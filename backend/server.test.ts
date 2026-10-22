import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { Writable } from 'node:stream';
import { config as loadDotenv } from 'dotenv';
import { CheckupSubmission } from '@rinda/schemas';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCollector, sealHandover, toFrames } from '../frontend/src/lib/handover-seal.ts';
import {
  createApp,
  createLogger,
  explainWithModels,
  geminiModels,
  guideChain,
  handoverKey,
  handoverToken,
  handoverTokenValid,
  openHandover,
  createPool,
  directUrlOf,
  FLAG_DEFAULTS,
  loadConfig,
  maskIdentifier,
  numbersIn,
  migrate,
  type Db,
} from './server.ts';

loadDotenv({ path: path.join(import.meta.dirname, '..', '.env'), quiet: true });

function sinkLogger() {
  const lines: string[] = [];
  const sink = new Writable({
    write(chunk, _enc, done) {
      lines.push(String(chunk));
      done();
    },
  });
  return { logger: createLogger('info', sink), lines };
}

describe('without a database', () => {
  it('moves to the next free Gemini model when one has used up its allowance, and skips it for the day', async () => {
    const config = loadConfig({
      APP_ENV: 'test',
      GEMINI_API_KEY: 'test-key',
      GEMINI_MODEL: 'model-one',
      GEMINI_FALLBACK_MODELS: 'model-two, model-three,model-one',
    });
    expect(geminiModels(config)).toEqual(['model-one', 'model-two', 'model-three']);
    const asked: string[] = [];
    const fakeFetch = (async (url: string) => {
      const model = /models\/([^:]+):/.exec(url)?.[1] ?? '';
      asked.push(model);
      if (model === 'model-one') return new Response('{}', { status: 429 });
      return new Response(JSON.stringify({ candidates: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    const first = await explainWithModels(config, fakeFetch, {}, {}, []);
    expect(first.model).toBe('model-two');
    expect(asked).toEqual(['model-one', 'model-two']);
    asked.length = 0;
    await explainWithModels(config, fakeFetch, {}, {}, []);
    expect(asked).toEqual(['model-two']);

    // A busy model (503) is passed over for that request only, not for the day.
    const busyConfig = loadConfig({
      APP_ENV: 'test',
      GEMINI_API_KEY: 'k',
      GEMINI_MODEL: 'busy-one',
      GEMINI_FALLBACK_MODELS: 'calm-two',
    });
    let busy = true;
    const busyFetch = (async (url: string) =>
      url.includes('busy-one') && busy
        ? new Response('{}', { status: 503 })
        : new Response(JSON.stringify({ candidates: [] }), { status: 200 })) as unknown as typeof fetch;
    expect((await explainWithModels(busyConfig, busyFetch, {}, {}, [])).model).toBe('calm-two');
    busy = false;
    expect((await explainWithModels(busyConfig, busyFetch, {}, {}, [])).model).toBe('busy-one');
  });

  it('carries on to Groq and then OpenRouter when Gemini cannot answer, and never loops back', async () => {
    const config = loadConfig({
      APP_ENV: 'test',
      GEMINI_API_KEY: 'g-key',
      GEMINI_MODEL: 'chain-gemini',
      GEMINI_FALLBACK_MODELS: '',
      GROQ_API_KEY: 'groq-key',
      GROQ_MODELS: 'chain-groq',
      OPENROUTER_API_KEY: 'or-key',
      OPENROUTER_MODELS: 'chain/free:free',
    });
    expect(guideChain(config).map((s) => `${s.provider}:${s.model}`)).toEqual([
      'gemini:chain-gemini',
      'groq:chain-groq',
      'openrouter:chain/free:free',
    ]);
    const asked: string[] = [];
    let groq: 'slow' | 'busy' | 'ok' = 'slow';
    const reply = JSON.stringify({
      paragraphs: [{ text: 'Small steps help.', sourceIds: ['guide.tip'] }],
      followUpChipIds: [],
    });
    const fakeFetch = (async (url: string, init: RequestInit) => {
      const body = String(init.body);
      // The provider keys travel only in headers, never in what is sent about the person.
      expect(body).not.toMatch(/g-key|groq-key|or-key/);
      if (url.includes('generativelanguage')) {
        asked.push('gemini');
        return new Response('{}', { status: 429 });
      }
      if (url.includes('groq.com')) {
        asked.push('groq');
        if (groq === 'slow') throw new DOMException('timed out', 'TimeoutError');
        if (groq === 'busy') return new Response('{}', { status: 503 });
      } else asked.push('openrouter');
      return new Response(
        JSON.stringify({
          choices: [{ finish_reason: 'stop', message: { content: '```json\n' + reply + '\n```' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    // Gemini has used up its allowance and Groq does not answer in time, so OpenRouter answers.
    const library = { 'guide.tip': 'Small steps help.' };
    const first = await explainWithModels(config, fakeFetch, {}, library, []);
    expect(first).toMatchObject({ outcome: 'pass', model: 'openrouter:chain/free:free' });
    expect(first.answer?.paragraphs[0]?.text).toBe('Small steps help.');
    expect(asked).toEqual(['gemini', 'groq', 'openrouter']);

    // Next time Gemini is skipped for the day, and a Groq that answers is used.
    asked.length = 0;
    groq = 'ok';
    expect((await explainWithModels(config, fakeFetch, {}, library, [])).model).toBe('groq:chain-groq');
    expect(asked).toEqual(['groq']);

    // When nothing answers, the result says so once; the chain does not start again from the top.
    const down = (async () => new Response('{}', { status: 503 })) as unknown as typeof fetch;
    const none = await explainWithModels(config, down, {}, {}, []);
    expect(none).toMatchObject({ answer: null, outcome: 'error', model: null });

    // In the pilot only Gemini is asked, because free tiers may keep what is sent to them.
    const pilot = { ...config, APP_ENV: 'pilot' as const };
    expect(guideChain(pilot).map((s) => s.provider)).toEqual(['gemini']);
    // A provider without a key is left out.
    expect(guideChain({ ...config, GROQ_API_KEY: undefined }).map((s) => s.provider)).toEqual([
      'gemini',
      'openrouter',
    ]);
  });

  it('offline hand-over: the phone seals, the frames reassemble, and only the server key opens it', async () => {
    const secret = randomBytes(48).toString('base64url');
    const server = handoverKey(secret);
    const payload = {
      v: 1 as const,
      userId: randomUUID(),
      token: handoverToken(secret, 'someone'),
      createdAt: new Date().toISOString(),
      checkups: [],
      safetyEvents: [],
    };
    const sealed = await sealHandover(payload, server.publicKey, server.kid);
    expect(JSON.stringify(sealed)).not.toContain(payload.userId);
    const frames = toFrames({ ...sealed, ct: sealed.ct + 'A'.repeat(4000) });
    expect(frames.length).toBeGreaterThan(2);
    const collect = createCollector();
    let complete: string | null = null;
    // Frames arrive out of order and repeated, as a camera sees a looping QR code.
    for (const frame of [...frames].reverse().concat(frames)) complete ??= collect(frame)?.complete ?? null;
    expect(JSON.parse(complete ?? '{}').ct).toBe(sealed.ct + 'A'.repeat(4000));
    expect(openHandover(server.ecdh, sealed)).toEqual(payload);
    expect(() => openHandover(handoverKey('another-secret-'.repeat(3)).ecdh, sealed)).toThrow();
    const tampered = { ...sealed, ct: sealed.ct.slice(0, -2) + (sealed.ct.endsWith('AA') ? 'BB' : 'AA') };
    expect(() => openHandover(server.ecdh, tampered)).toThrow();
  });

  it('offline hand-over proofs are tied to one person, work across a key rotation, and expire after 30 days', () => {
    const [old, current] = [randomBytes(48).toString('base64url'), randomBytes(48).toString('base64url')];
    const token = handoverToken(old, 'person-a');
    expect(handoverTokenValid([current, old], 'person-a', token)).toBe(true);
    expect(handoverTokenValid([current], 'person-a', token)).toBe(false);
    expect(handoverTokenValid([old], 'person-b', token)).toBe(false);
    const issued = Math.floor(Date.now() / 1000) - 31 * 86_400;
    expect(handoverTokenValid([old], 'person-a', handoverToken(old, 'person-a', issued))).toBe(false);
  });

  const config = loadConfig({ APP_ENV: 'test' });
  const { logger, lines } = sinkLogger();
  const app = createApp({ config, logger, db: null });

  it('requires real settings outside development and test', () => {
    expect(() => loadConfig({ APP_ENV: 'staging' })).toThrow(/SESSION_SECRET|DATABASE_URL/);
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/APP_ENV/);
    expect(loadConfig({ APP_ENV: 'development' }).generatedSecret).toBe(true);
    const pilot = { APP_ENV: 'pilot', SESSION_SECRET: 'x'.repeat(40), DATABASE_URL: 'postgresql://u:p@h/db' };
    expect(() => loadConfig({ ...pilot, ETHICS_AMENDMENT_REF: 'SYNTHETIC-DEV-ONLY' })).toThrow(
      /ETHICS_AMENDMENT_REF/,
    );
    expect(FLAG_DEFAULTS.pilot.messaging).toBe(false);
  });

  it('uses the Vercel address for Google sign-in when PUBLIC_URL is not set, and localhost on a PC', () => {
    const vercel = { APP_ENV: 'test', VERCEL_PROJECT_PRODUCTION_URL: 'rinda-health.vercel.app' };
    expect(loadConfig(vercel).PUBLIC_URL).toBe('https://rinda-health.vercel.app');
    expect(loadConfig({ ...vercel, PUBLIC_URL: 'https://example.org' }).PUBLIC_URL).toBe(
      'https://example.org',
    );
    expect(loadConfig({ APP_ENV: 'test' }).PUBLIC_URL).toBe('http://localhost:5173');
    // On Vercel a PUBLIC_URL copied from a PC's .env never sends anyone to localhost.
    expect(loadConfig({ ...vercel, PUBLIC_URL: 'http://localhost:5173' }).PUBLIC_URL).toBe(
      'https://rinda-health.vercel.app',
    );
    expect(loadConfig({ APP_ENV: 'test', VERCEL_URL: 'rinda-abc.vercel.app' }).PUBLIC_URL).toBe(
      'https://rinda-abc.vercel.app',
    );
  });

  it('finds numbers written as digits or words (guide validator)', () => {
    expect(numbersIn('One small step: about 20 more minutes on three days, 2.5 km.')).toEqual([
      20, 2.5, 1, 3,
    ]);
  });

  it('health says the database is not configured', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.body).toMatchObject({ status: 'ok', database: 'not_configured' });
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('flags are booleans and the generative guide stays off without an ethics amendment (FR-50)', async () => {
    const res = await request(app).get('/api/v1/flags');
    expect(Object.values(res.body).every((v) => typeof v === 'boolean')).toBe(true);
    expect(res.body.guideGenerative).toBe(false);
  });

  it('database routes answer 503 with a stable code', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ identifier: 'a@b.co', password: 'x' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('DB_UNAVAILABLE');
  });

  it('Google sign-in reports when it is not set up', async () => {
    expect((await request(app).get('/api/v1/auth/providers')).body).toEqual({
      password: true,
      google: false,
    });
    expect((await request(app).get('/api/v1/auth/google/start')).status).toBe(503);
  });

  it('masks identifiers for staff views', () => {
    expect(maskIdentifier('anthony@gmail.com', null)).toBe('a•••@gmail.com');
    expect(maskIdentifier(null, '+250788123456')).toBe('+2507•• ••• 456');
  });

  it('never logs bodies, passwords or query strings (FR-15)', async () => {
    await request(app)
      .post('/api/v1/auth/signup?pin=482915')
      .send({ identifier: 'x@y.co', password: 'Sentinel482915' });
    // Random request IDs are hex, so digits inside them are not values.
    const log = lines.join('').replace(/"reqId":"[0-9a-f]+"/g, '');
    expect(log).not.toContain('482915');
    expect(log).not.toContain('x@y.co');
  });
});

const dbUrl =
  process.env['TEST_DATABASE_URL'] ||
  directUrlOf({
    DIRECT_URL: process.env['DIRECT_URL'] || undefined,
    DATABASE_URL: process.env['DATABASE_URL'] || undefined,
  });

describe.skipIf(!dbUrl)('with a database (throwaway schema)', () => {
  const schema = `test_${randomBytes(4).toString('hex')}`;
  let db: Db;
  let admin: Db;
  const config = loadConfig({
    APP_ENV: 'test',
    DATABASE_URL: dbUrl ?? '',
    DB_SCHEMA: schema,
    GOOGLE_CLIENT_ID: 'test-client',
    GOOGLE_CLIENT_SECRET: 'test-secret',
    GEMINI_API_KEY: 'test-gemini-key',
    ETHICS_AMENDMENT_REF: 'SYNTHETIC-DEV-ONLY',
    BREVO_API_KEY: 'test-brevo-key',
    EMAIL_FROM: 'reports@rinda.test',
    WHATSAPP_TOKEN: 'test-wa-token',
    WHATSAPP_PHONE_NUMBER_ID: '1234567890',
    PUBLIC_URL: 'http://localhost:5173',
  });
  const { logger, lines } = sinkLogger();
  let googleClaims: Record<string, unknown> = {};
  let geminiAnswer: unknown = null;
  const outbound: Array<{ url: string; body: string }> = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    outbound.push({ url, body: String(init?.body ?? '') });
    if (url.includes('generativelanguage.googleapis.com')) {
      return new Response(
        JSON.stringify({
          candidates: [
            { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(geminiAnswer) }] } },
          ],
          usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 120 },
        }),
        { status: 200 },
      );
    }
    if (url.includes('graph.facebook.com'))
      return new Response('{"messages":[{"id":"wamid.test"}]}', { status: 200 });
    if (url.includes('api.brevo.com')) return new Response('{"messageId":"<test@brevo>"}', { status: 201 });
    return new Response(
      JSON.stringify({
        id_token: `e30.${Buffer.from(JSON.stringify(googleClaims)).toString('base64url')}.sig`,
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    admin = createPool(dbUrl ?? '');
    db = createPool(dbUrl ?? '', schema);
    await migrate(db, schema);
    const own = await db.query<{ t: string | null }>(`SELECT to_regclass('${schema}.users')::text AS t`);
    if (!own.rows[0]?.t)
      throw new Error(`Test schema ${schema} was not migrated; refusing to touch other schemas.`);
    app = createApp({ config, logger, db, fetchFn });
  }, 60_000);

  afterAll(async () => {
    await db?.end();
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  const signup = async (role: string, identifier: string, password = 'correct-horse-1', consent = true) => {
    const agent = request.agent(app);
    const res = await agent
      .post('/api/v1/auth/signup')
      .send({ role, identifier, password, preferredLanguage: 'en' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    if (role === 'participant' && consent) {
      await agent
        .post('/api/v1/participant/consents')
        .send({
          purposeAcknowledged: true,
          ageConfirmed: true,
          consents: { core: true, mental_wellness: true, audio: false, follow_up: false },
          language: 'en',
        })
        .expect(201);
    }
    return { agent, me: res.body as { id: string; role: string } };
  };

  const answers = {
    tobaccoUse: true,
    auditC: [1, 1, 0],
    moderateMinutes: 60,
    vigorousMinutes: 0,
    servingsPerDay: 3,
    addsSaltAtTable: false,
    heightCm: 170,
    weightKg: 72.2,
    waistCm: 80,
    systolic: 142,
    diastolic: 91,
    measurementSource: 'in_session',
  };

  it('health reports the database as ok', async () => {
    expect((await request(app).get('/api/v1/health')).body.database).toBe('ok');
  });

  it('participant: sign up with a phone number, profile, idempotent check-ups, read and delete (FR-08)', async () => {
    const { agent } = await signup('participant', '0788 123 456');
    const me = await agent.get('/api/v1/me');
    expect(me.body).toMatchObject({ role: 'participant', phone: '+250788123456', email: null });

    await agent
      .put('/api/v1/participant/profile')
      .send({ ageBand: '18-24', sex: 'female', districtBand: 'gasabo' })
      .expect(200);

    const key = randomUUID();
    const body = { language: 'en', startedAt: new Date().toISOString(), answers };
    const first = await agent.post('/api/v1/participant/assessments').set('Idempotency-Key', key).send(body);
    expect(first.status).toBe(201);
    expect(first.body.results.ncd.find((r: { domain: string }) => r.domain === 'bp').band).toBe(
      'hypertension_range',
    );
    expect(first.body.results.ncd.find((r: { domain: string }) => r.domain === 'bmi').value).toBe(25);
    expect(first.body.plan.focus[0].id).toBe('bp_confirm');
    for (let i = 0; i < 9; i++) {
      await agent.post('/api/v1/participant/assessments').set('Idempotency-Key', key).send(body).expect(200);
    }
    const list = await agent.get('/api/v1/participant/assessments');
    expect(list.body).toHaveLength(1);

    const mismatch = await agent
      .post('/api/v1/participant/assessments')
      .set('Idempotency-Key', key)
      .send({ ...body, answers: { ...answers, systolic: 120 } });
    expect(mismatch.status).toBe(409);

    const bad = await agent
      .post('/api/v1/participant/assessments')
      .set('Idempotency-Key', randomUUID())
      .send({ ...body, answers: { ...answers, heightCm: 1.65 } });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details).toEqual([{ path: 'answers.heightCm', issue: 'height_in_metres' }]);

    await agent.get(`/api/v1/participant/assessments/${first.body.id}`).expect(200);
    await agent.delete(`/api/v1/participant/assessments/${first.body.id}`).expect(204);
    await agent.get(`/api/v1/participant/assessments/${first.body.id}`).expect(404);

    const dash = await agent.get('/api/v1/dashboard');
    expect(dash.body.cards.map((c: { key: string }) => c.key)).toContain('checkups_total');

    await agent.get('/api/v1/facilitator/sessions').expect(403);
    await agent.get('/api/v1/admin/users').expect(403);
  });

  it('sign in, wrong passwords, lockout after five tries, sign out (FR-03)', async () => {
    await signup('participant', 'lockme@example.com');
    const login = (password: string) =>
      request(app).post('/api/v1/auth/login').send({ identifier: 'LockMe@Example.com', password });
    await login('correct-horse-1').expect(200);
    for (let i = 0; i < 5; i++) expect((await login('wrong')).status).toBe(401);
    expect((await login('correct-horse-1')).status).toBe(423);

    const { agent } = await signup('participant', 'signout@example.com');
    await agent.post('/api/v1/auth/logout').expect(204);
    await agent.get('/api/v1/me').expect(401);
    const dup = await request(app).post('/api/v1/auth/signup').send({
      role: 'participant',
      identifier: 'signout@example.com',
      password: 'another-pass-1',
      preferredLanguage: 'en',
    });
    expect(dup.status).toBe(409);
  });

  it('profile: update details and change password', async () => {
    const { agent } = await signup('reviewer', 'rev-profile@example.com');
    const patched = await agent
      .patch('/api/v1/me')
      .send({ displayName: 'Ama', preferredLanguage: 'rw', phone: '0722000111' });
    expect(patched.body).toMatchObject({
      displayName: 'Ama',
      preferredLanguage: 'rw',
      phone: '+250722000111',
    });
    await agent.patch('/api/v1/me').send({ email: null, phone: null }).expect(400);
    await agent
      .post('/api/v1/me/password')
      .send({ currentPassword: 'wrong', newPassword: 'new-password-1' })
      .expect(401);
    await agent
      .post('/api/v1/me/password')
      .send({ currentPassword: 'correct-horse-1', newPassword: 'new-password-1' })
      .expect(204);
    await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'rev-profile@example.com', password: 'new-password-1' })
      .expect(200);
  });

  it('facilitator: masked participants, sessions with tasks, safety events (FR-45, FR-13)', async () => {
    const { me: participant } = await signup('participant', 'sessioned@example.com');
    const { agent } = await signup('facilitator', 'fac@example.com');
    const participants = await agent.get('/api/v1/facilitator/participants');
    const row = participants.body.find((p: { id: string }) => p.id === participant.id);
    expect(row.label).toBe('s•••@example.com');
    expect(JSON.stringify(participants.body)).not.toContain('sessioned@example.com');

    const session = await agent
      .post('/api/v1/facilitator/sessions')
      .send({ participantId: participant.id, deviceLabel: 'Phone 2' });
    expect(session.status).toBe(201);
    const id = session.body.id as string;
    const task = await agent
      .put(`/api/v1/facilitator/sessions/${id}/tasks/questionnaire`)
      .send({ outcome: 'completed_with_help', durationSeconds: 300 });
    expect(task.body.tasks).toEqual([
      { taskCode: 'questionnaire', outcome: 'completed_with_help', durationSeconds: 300 },
    ]);
    expect((await agent.post(`/api/v1/facilitator/sessions/${id}/end`)).body.endedAt).not.toBeNull();

    await agent
      .post('/api/v1/facilitator/safety-events')
      .send({
        participantId: participant.id,
        tier: 2,
        triggerType: 'observed',
        actions: ['facilitator_checkin'],
      })
      .expect(201);
    await agent
      .post('/api/v1/facilitator/safety-events')
      .send({ participantId: participant.id, tier: 2, triggerType: 'observed', actions: [], phq9Total: 21 })
      .expect(400);
    expect((await agent.get('/api/v1/facilitator/safety-events')).body.length).toBeGreaterThan(0);
    await agent.delete(`/api/v1/facilitator/sessions/${id}`).expect(204);
    expect((await agent.get('/api/v1/dashboard')).body.cards).toHaveLength(4);
  });

  it('researcher-admin: users CRUD, last-admin guard, flags guard, audit log (FR-48, FR-50, FR-54)', async () => {
    const { agent, me } = await signup('researcher_admin', 'admin@example.com');
    const created = await agent
      .post('/api/v1/admin/users')
      .send({ role: 'facilitator', identifier: 'new-fac@example.com', password: 'temporary-pass-1' });
    expect(created.status).toBe(201);
    const updated = await agent
      .patch(`/api/v1/admin/users/${created.body.id}`)
      .send({ role: 'reviewer', active: false });
    expect(updated.body).toMatchObject({ role: 'reviewer', active: false });
    await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'new-fac@example.com', password: 'temporary-pass-1' })
      .expect(403);
    await agent.delete(`/api/v1/admin/users/${created.body.id}`).expect(204);

    const others = (await agent.get('/api/v1/admin/users?role=researcher_admin')).body as Array<{
      id: string;
    }>;
    if (others.length === 1)
      await agent.patch(`/api/v1/admin/users/${me.id}`).send({ active: false }).expect(409);
    await agent.delete(`/api/v1/admin/users/${me.id}`).expect(409);

    await agent.patch('/api/v1/admin/flags/guideGenerative').send({ enabled: true }).expect(200);
    expect((await agent.patch('/api/v1/admin/flags/whatIf').send({ enabled: false })).body.whatIf).toBe(
      false,
    );

    const log = await agent.get('/api/v1/admin/audit-log');
    expect(log.body.map((e: { action: string }) => e.action)).toEqual(
      expect.arrayContaining(['user.create', 'flag.update']),
    );
    await expect(db.query('UPDATE audit_log SET action = $1', ['tampered'])).rejects.toThrow(/append-only/);
    expect((await agent.get('/api/v1/dashboard')).body.usersByRole.length).toBeGreaterThan(0);
  });

  it('content: draft, two-person approval, publish, immutable after publishing (FR-20, FR-46)', async () => {
    const { agent: adminAgent } = await signup('researcher_admin', 'content-admin@example.com');
    const { agent: r1 } = await signup('reviewer', 'r1@example.com');
    const { agent: r2 } = await signup('reviewer', 'r2@example.com');
    const draft = await adminAgent.post('/api/v1/content').send({
      type: 'band_labels',
      key: 'band-labels',
      version: '0.2.0',
      language: 'en',
      body: { 'band.bp.normal': 'Normal' },
    });
    expect(draft.status).toBe(201);
    const id = draft.body.id as string;
    await adminAgent.post(`/api/v1/content/${id}/approvals`).send({ decision: 'approved' }).expect(409);
    await r1.post(`/api/v1/content/${id}/approvals`).send({ decision: 'approved' }).expect(200);
    await adminAgent.post(`/api/v1/content/${id}/publish`).expect(409);
    await r2.post(`/api/v1/content/${id}/approvals`).send({ decision: 'approved' }).expect(200);
    const published = await adminAgent.post(`/api/v1/content/${id}/publish`);
    expect(published.body.status).toBe('published');
    await adminAgent.patch(`/api/v1/content/${id}`).send({ version: '0.2.1' }).expect(409);
    await adminAgent.delete(`/api/v1/content/${id}`).expect(409);
    await r1
      .post('/api/v1/content')
      .send({ type: 'general', key: 'x', version: '1.0.0', language: 'en', body: {} })
      .expect(403);
  });

  it('deletion request: participant asks, admin completes, identifiers removed (FR-18)', async () => {
    const { agent: p, me } = await signup('participant', 'leaving@example.com');
    await p.post('/api/v1/participant/deletion-requests').expect(201);
    expect((await p.get('/api/v1/participant/deletion-requests/current')).body.status).toBe('requested');
    const { agent: a } = await signup('researcher_admin', 'deleter@example.com');
    const list = await a.get('/api/v1/admin/deletion-requests');
    const req = list.body.find(
      (d: { status: string; participantLabel: string }) => d.participantLabel === 'l•••@example.com',
    );
    await a.post(`/api/v1/admin/deletion-requests/${req.id}/complete`).expect(204);
    const row = await db.query('SELECT email, phone, deleted_at FROM users WHERE id = $1', [me.id]);
    expect(row.rows[0]).toMatchObject({ email: null, phone: null });
    await p.get('/api/v1/me').expect(401);
  });

  it('Google sign-in: PKCE redirect, then a verified account is created and signed in (FR-51)', async () => {
    const agent = request.agent(app);
    const start = await agent.get('/api/v1/auth/google/start?intent=signup&role=reviewer');
    expect(start.status).toBe(302);
    const location = new URL(start.headers['location'] as string);
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('scope')).toBe('openid email');
    // On a PC Google returns to localhost; through the live address it returns there instead.
    expect(location.searchParams.get('redirect_uri')).toBe(
      'http://localhost:5173/api/v1/auth/google/callback',
    );
    const live = await request(app)
      .get('/api/v1/auth/google/start')
      .set('x-forwarded-host', 'rinda-health.vercel.app');
    expect(new URL(live.headers['location'] as string).searchParams.get('redirect_uri')).toBe(
      'https://rinda-health.vercel.app/api/v1/auth/google/callback',
    );
    googleClaims = {
      iss: 'https://accounts.google.com',
      aud: 'test-client',
      sub: 'google-sub-123',
      exp: Math.floor(Date.now() / 1000) + 300,
      nonce: location.searchParams.get('nonce'),
      email: 'Google.User@gmail.com',
      email_verified: true,
    };
    const callback = await agent.get(
      `/api/v1/auth/google/callback?code=abc&state=${location.searchParams.get('state')}`,
    );
    expect(callback.headers['location']).toBe('http://localhost:5173/app');
    const me = await agent.get('/api/v1/me');
    expect(me.body).toMatchObject({
      role: 'reviewer',
      email: 'google.user@gmail.com',
      hasGoogle: true,
      hasPassword: false,
    });

    const forged = await request(app).get('/api/v1/auth/google/callback?code=abc&state=forged');
    expect(forged.headers['location']).toBe('http://localhost:5173/login?error=google');
  });

  it('Rinda Guide: template first, Gemini answer only when it passes the validator (FR-36, NFR-16)', async () => {
    const { agent } = await signup('participant', 'guide-user@example.com');
    const checkup = await agent
      .post('/api/v1/participant/assessments')
      .set('Idempotency-Key', randomUUID())
      .send({
        language: 'en',
        startedAt: new Date().toISOString(),
        answers: { ...answers, systolic: 120, diastolic: 80 },
      });
    expect(checkup.status).toBe(201);
    expect(checkup.body.values).toMatchObject({
      moderateMinutes: 60,
      servingsPerDay: 3,
      systolic: 120,
      auditC: 2,
    });
    const ask = (chipId: string, language = 'en') =>
      agent.post('/api/v1/guide/explain').send({ assessmentId: checkup.body.id, chipId, language });

    outbound.length = 0;
    expect((await agent.get('/api/v1/participant/ai-explanations')).body).toEqual({
      ai: false,
      available: true,
    });
    expect((await ask('first_step')).body.source).toBe('template');
    expect(outbound.some((o) => o.url.includes('generativelanguage'))).toBe(false);
    // "What can I do?" works through the API too, with answers drawn from the offline answer set.
    const tips = await ask('tips').expect(200);
    expect(tips.body.source).toBe('template');
    expect(tips.body.paragraphs.flatMap((p: { sourceIds: string[] }) => p.sourceIds)).toContain(
      'ga.activity.below.tips',
    );
    expect(tips.body.paragraphs.length).toBeLessThanOrEqual(4);
    await agent.put('/api/v1/participant/ai-explanations').send({ ai: true }).expect(200);
    await agent.put('/api/v1/participant/ai-explanations').send({ ai: true, extra: 1 }).expect(400);

    geminiAnswer = {
      paragraphs: [
        {
          text: 'A good first step: about 20 more minutes of activity on 3 days.',
          sourceIds: ['guide.tpl.first_step'],
        },
      ],
      followUpChipIds: ['plan_week', 'not_a_chip'],
    };
    outbound.length = 0;
    const generated = await ask('first_step');
    expect(generated.body).toMatchObject({ source: 'generated', followUpChipIds: ['plan_week'] });
    const sent = outbound.find((o) => o.url.includes('generativelanguage'))?.body ?? '';
    for (const secret of ['guide-user@example.com', checkup.body.id, 'phq9', 'gad7'])
      expect(sent).not.toContain(secret);

    geminiAnswer = {
      paragraphs: [{ text: 'Walk 45 minutes a day.', sourceIds: ['guide.tpl.first_step'] }],
      followUpChipIds: [],
    };
    outbound.length = 0;
    const again = await ask('first_step');
    expect(again.body).toMatchObject({ source: 'generated', paragraphs: generated.body.paragraphs });
    expect(outbound.some((o) => o.url.includes('generativelanguage'))).toBe(false);
    await db.query('DELETE FROM guide_answers');

    const changedNumber = await ask('first_step');
    expect(changedNumber.body.source).toBe('template');
    expect(changedNumber.body.paragraphs[0].text).toContain('about 20 more minutes of activity on 3 days');

    geminiAnswer = {
      paragraphs: [{ text: 'Your mood matters too.', sourceIds: ['guide.tpl.first_step'] }],
      followUpChipIds: [],
    };
    expect((await ask('first_step')).body.source).toBe('template');

    outbound.length = 0;
    const kinyarwanda = await ask('overview', 'rw');
    expect(kinyarwanda.body.source).toBe('template');
    expect(outbound.some((o) => o.url.includes('generativelanguage'))).toBe(false);

    await agent
      .post('/api/v1/guide/feedback')
      .send({ requestId: kinyarwanda.body.requestId, helpful: true })
      .expect(204);
    const log = await db.query('SELECT source, validator_outcome FROM guide_request_log ORDER BY created_at');
    expect(log.rows.map((r) => r.validator_outcome)).toEqual([
      'templates_only',
      'templates_only',
      'pass',
      'saved',
      'numbers',
      'scope',
      'templates_only',
    ]);
  });

  it('email reports: only after opt-in, NCD results only, never mental wellness (ADR-020)', async () => {
    const byPhone = await signup('participant', '0788 555 444');
    expect((await byPhone.agent.get('/api/v1/participant/email-reports')).body).toEqual({
      email: false,
      available: true,
      hasEmail: false,
    });
    await byPhone.agent.put('/api/v1/participant/email-reports').send({ email: true }).expect(409);

    const { agent, me } = await signup('participant', 'reports-user@example.com');
    const submit = () =>
      agent
        .post('/api/v1/participant/assessments')
        .set('Idempotency-Key', randomUUID())
        .send({ language: 'en', startedAt: new Date().toISOString(), answers });
    const brevoCalls = () => outbound.filter((o) => o.url.includes('api.brevo.com'));
    const waitForBrevo = async (n: number) => {
      for (let i = 0; i < 40 && brevoCalls().length < n; i++) await new Promise((r) => setTimeout(r, 250));
      await new Promise((r) => setTimeout(r, 300));
    };

    outbound.length = 0;
    await submit().expect(201);
    await new Promise((r) => setTimeout(r, 300));
    expect(brevoCalls()).toHaveLength(0);

    await agent.put('/api/v1/participant/email-reports').send({ email: true, extra: 1 }).expect(400);
    await agent.put('/api/v1/participant/email-reports').send({ email: true }).expect(200);
    const checkup = await submit().expect(201);
    await waitForBrevo(1);
    const call = brevoCalls()[0];
    expect(call?.url).toBe('https://api.brevo.com/v3/smtp/email');
    const payload = JSON.parse(call?.body ?? '{}');
    expect(payload).toMatchObject({
      sender: { name: 'Rinda Health', email: 'reports@rinda.test' },
      to: [{ email: 'reports-user@example.com' }],
      subject: 'Your Rinda check-up summary',
    });
    expect(payload.textContent).toContain('Blood pressure');
    expect(payload.textContent).toContain('40% of the healthy target');
    expect(payload.textContent).toContain('What this means for you');
    expect(payload.textContent).toContain(`http://localhost:5173/app/results/${checkup.body.id}`);
    expect(payload.textContent).not.toMatch(/phq|gad|mood|anxiety|depress/i);
    expect(payload.htmlContent).not.toContain('<script');
    const paragraphs = String(payload.textContent).split('\n\n');
    expect(new Set(paragraphs).size).toBe(paragraphs.length);
    const events = await db.query('SELECT channel, status FROM message_events WHERE user_id = $1', [me.id]);
    expect(events.rows).toEqual([{ channel: 'email', status: 'sent' }]);

    await agent
      .post('/api/v1/participant/email-reports/send')
      .send({ assessmentId: checkup.body.id })
      .expect(200, {
        status: 'sent',
      });
    await byPhone.agent
      .post('/api/v1/participant/email-reports/send')
      .send({ assessmentId: checkup.body.id })
      .expect(409);

    await agent.put('/api/v1/participant/email-reports').send({ email: false }).expect(200);
    outbound.length = 0;
    await submit().expect(201);
    await new Promise((r) => setTimeout(r, 500));
    expect(brevoCalls()).toHaveLength(0);
  });

  it('consent comes first: no check-up without taking part, and choices can change later (FR-02, FR-44)', async () => {
    const { agent } = await signup('participant', 'no-consent-yet@example.com', 'correct-horse-1', false);
    expect((await agent.get('/api/v1/participant/consents')).body).toEqual({
      decided: false,
      core: false,
      mental_wellness: false,
      audio: false,
      follow_up: false,
    });
    const submit = () =>
      agent
        .post('/api/v1/participant/assessments')
        .set('Idempotency-Key', randomUUID())
        .send({ language: 'en', startedAt: new Date().toISOString(), answers });
    expect((await submit()).body.error.code).toBe('CONSENT_REQUIRED');

    const consentBody = {
      purposeAcknowledged: true,
      ageConfirmed: true,
      consents: { core: true, mental_wellness: false, audio: false, follow_up: true },
      language: 'en',
    };
    await agent
      .post('/api/v1/participant/consents')
      .send({ ...consentBody, ageConfirmed: false })
      .expect(400);
    await agent
      .post('/api/v1/participant/consents')
      .send({ ...consentBody, nationalId: '1' })
      .expect(400);
    await agent.post('/api/v1/participant/consents').send(consentBody).expect(201);
    await submit().expect(201);

    const withWellness = await agent
      .post('/api/v1/participant/assessments')
      .set('Idempotency-Key', randomUUID())
      .send({
        language: 'en',
        startedAt: new Date().toISOString(),
        answers: { ...answers, wellness: { phq9: [3, 3, 3, 3, 3, 3, 3, 3, 0], gad7: [3, 3, 3, 3, 3, 3, 3] } },
      })
      .expect(201);
    expect(withWellness.body.results.wellness.every((r: { band: string }) => r.band === 'insufficient')).toBe(
      true,
    );
    expect(withWellness.body.safety.tier).toBeNull();

    await agent
      .put('/api/v1/participant/consents')
      .send({ scope: 'mental_wellness', granted: true })
      .expect(200);
    await agent.put('/api/v1/participant/consents').send({ scope: 'core', granted: false }).expect(400);
    expect((await agent.get('/api/v1/participant/consents')).body).toMatchObject({
      decided: true,
      core: true,
      mental_wellness: true,
      follow_up: true,
    });
  });

  it('mental wellness: separate results, Tier 1 at 10 records a safety event without answers (FR-25)', async () => {
    const { agent, me } = await signup('participant', 'wellness@example.com');
    const send = (wellness: unknown) =>
      agent
        .post('/api/v1/participant/assessments')
        .set('Idempotency-Key', randomUUID())
        .send({ language: 'en', startedAt: new Date().toISOString(), answers: { ...answers, wellness } });

    const nine = await send({ phq9: [1, 1, 1, 1, 1, 1, 1, 2, 0], gad7: [2, 2, 2, 1, 1, 1, null] }).expect(
      201,
    );
    expect(nine.body.safety.tier).toBeNull();
    expect(nine.body.results.wellness.find((r: { domain: string }) => r.domain === 'gad7').band).toBe(
      'insufficient',
    );
    const ten = await send({ phq9: [2, 1, 1, 1, 1, 1, 1, 2, 0], gad7: [0, 0, 0, 0, 0, 0, 0] }).expect(201);
    expect(ten.body.safety).toMatchObject({ tier: 1, triggerType: 'score_threshold' });
    expect(ten.body.results.ncd.map((r: { domain: string }) => r.domain)).not.toContain('phq9');
    const events = await db.query(
      'SELECT tier, trigger_type, actions, recorded_by_role FROM safety_events WHERE participant_id = $1',
      [me.id],
    );
    expect(events.rows).toEqual([
      {
        tier: 1,
        trigger_type: 'score_threshold',
        actions: ['referral_list_shown'],
        recorded_by_role: 'system',
      },
    ]);
    await send({ phq9: [9, 0, 0, 0, 0, 0, 0, 0, 0], gad7: [0, 0, 0, 0, 0, 0, 0] }).expect(400);
  });

  it('item 9 safety events from the phone: stored once, never with answers (FR-11, FR-13)', async () => {
    const { agent, me } = await signup('participant', 'item9@example.com');
    const event = {
      id: randomUUID(),
      tier: 2,
      triggerType: 'item9',
      actions: ['safety_screen_shown', 'referral_list_shown'],
      occurredAt: new Date().toISOString(),
      recordedByRole: 'system',
    };
    await agent.post('/api/v1/participant/safety-events').send(event).expect(201);
    await agent.post('/api/v1/participant/safety-events').send(event).expect(200);
    await agent
      .post('/api/v1/participant/safety-events')
      .send({ ...event, id: randomUUID(), phq9: [0, 0, 0, 0, 0, 0, 0, 0, 2] })
      .expect(400);
    await agent
      .post('/api/v1/participant/safety-events')
      .send({ ...event, id: randomUUID(), tier: 3, recordedByRole: 'facilitator' })
      .expect(400);
    const stored = await db.query('SELECT count(*)::int AS n FROM safety_events WHERE participant_id = $1', [
      me.id,
    ]);
    expect(stored.rows[0].n).toBe(1);
  });

  it('SUS feedback is stored per item with its version and averaged for the admin (FR-17)', async () => {
    const { agent } = await signup('participant', 'sus@example.com');
    expect((await agent.get('/api/v1/participant/feedback')).body).toEqual({ submitted: false });
    await agent
      .post('/api/v1/participant/feedback')
      .send({ formVersion: 'sus-1.0', items: [4, 2, 4, 2, 4, 2, 4, 2, 4, 9] })
      .expect(400);
    const sent = await agent
      .post('/api/v1/participant/feedback')
      .send({ formVersion: 'sus-1.0', items: [4, 2, 4, 2, 4, 2, 4, 2, 4, 2] })
      .expect(201);
    expect(sent.body).toEqual({ score: 75 });
    expect((await agent.get('/api/v1/participant/feedback')).body).toEqual({ submitted: true });

    const { agent: adminAgent } = await signup('researcher_admin', 'sus-admin@example.com');
    const cards = (await adminAgent.get('/api/v1/dashboard')).body.cards as Array<{
      key: string;
      value: number;
    }>;
    expect(cards.find((c) => c.key === 'sus_responses')?.value).toBeGreaterThanOrEqual(1);
    expect(cards.find((c) => c.key === 'sus_average')?.value).toBe(75);
  });

  it('WhatsApp notices: only after opt-in, never with results', async () => {
    const byEmail = await signup('participant', 'wa-no-phone@example.com');
    await byEmail.agent.put('/api/v1/participant/whatsapp').send({ whatsapp: true }).expect(409);

    const { agent, me } = await signup('participant', '0788 555 777');
    expect((await agent.get('/api/v1/participant/whatsapp')).body).toEqual({
      whatsapp: false,
      available: true,
      hasPhone: true,
    });
    const submit = () =>
      agent
        .post('/api/v1/participant/assessments')
        .set('Idempotency-Key', randomUUID())
        .send({ language: 'en', startedAt: new Date().toISOString(), answers });
    const calls = () => outbound.filter((o) => o.url.includes('graph.facebook.com'));

    outbound.length = 0;
    await submit().expect(201);
    await new Promise((r) => setTimeout(r, 400));
    expect(calls()).toHaveLength(0);

    await agent.put('/api/v1/participant/whatsapp').send({ whatsapp: true, extra: 1 }).expect(400);
    await agent.put('/api/v1/participant/whatsapp').send({ whatsapp: true }).expect(200);
    await submit().expect(201);
    for (let i = 0; i < 40 && calls().length === 0; i++) await new Promise((r) => setTimeout(r, 250));
    await new Promise((r) => setTimeout(r, 400));
    const call = calls()[0];
    expect(call?.url).toContain('/1234567890/messages');
    expect(JSON.parse(call?.body ?? '{}')).toMatchObject({
      to: '250788555777',
      type: 'template',
      template: { name: 'rinda_summary_ready' },
    });
    expect(call?.body).not.toMatch(/hypertension|below|band|systolic|142/i);
    const events = await db.query(
      "SELECT status FROM message_events WHERE user_id = $1 AND channel = 'whatsapp'",
      [me.id],
    );
    expect(events.rows).toEqual([{ status: 'sent' }]);
  });

  it('live session console: steps and times only, for the session facilitator', async () => {
    const { agent: fac } = await signup('facilitator', 'live-fac@example.com');
    const { agent: p, me: participant } = await signup('participant', 'live-p@example.com');
    const progress = (step: string) => p.post('/api/v1/participant/session-progress').send({ step });
    await progress('signin').expect(204); // no session yet

    const session = await fac
      .post('/api/v1/facilitator/sessions')
      .send({ participantId: participant.id })
      .expect(201);
    const live = () => fac.get(`/api/v1/facilitator/sessions/${session.body.id}/live`);
    for (const step of ['signin', 'consent', 'questionnaire', 'questionnaire'])
      await progress(step).expect(200);
    await p
      .post('/api/v1/participant/session-progress')
      .send({ step: 'questionnaire', answers: [1] })
      .expect(400);

    const now = (await live().expect(200)).body;
    expect(now.current.step).toBe('questionnaire');
    expect(now.online).toBe(true);
    expect(now.timeline.map((x: { step: string }) => x.step)).toEqual(['signin', 'consent', 'questionnaire']);
    expect(JSON.stringify(now)).not.toMatch(/systolic|band|phq|live-p@/);

    const { agent: other } = await signup('facilitator', 'live-other@example.com');
    await other.get(`/api/v1/facilitator/sessions/${session.body.id}/live`).expect(404);

    await fac.post(`/api/v1/facilitator/sessions/${session.body.id}/end`).expect(200);
    const after = (await live().expect(200)).body;
    expect(after).toMatchObject({ ended: true, current: null });
    await progress('results').expect(204); // nothing is tracked once the session ends
  });

  it('research report: aggregate numbers only, for researcher-admins', async () => {
    const { agent: p } = await signup('participant', 'report-p@example.com');
    await p
      .post('/api/v1/participant/assessments')
      .set('Idempotency-Key', randomUUID())
      .send({ language: 'en', startedAt: new Date().toISOString(), answers })
      .expect(201);
    const { agent: adminAgent } = await signup('researcher_admin', 'report-admin@example.com');
    const report = (await adminAgent.get('/api/v1/admin/research-report').expect(200)).body;
    expect(report.participants.total).toBeGreaterThan(0);
    expect(report.tasks).toHaveLength(6);
    expect(report.sus).toHaveProperty('responses');
    expect(report.bands.bp).toBeDefined();
    expect(JSON.stringify(report)).not.toMatch(/@example\.com|0788|"id"/);

    await p.get('/api/v1/admin/research-report').expect(403);
  });

  it('QR set-up and wipe: one-time link, claimed once, wiped at the end', async () => {
    const { agent: fac } = await signup('facilitator', 'qr-fac@example.com');
    const { me: participant } = await signup('participant', 'qr-p@example.com');
    const session = await fac
      .post('/api/v1/facilitator/sessions')
      .send({ participantId: participant.id, deviceLabel: 'Phone 2' })
      .expect(201);
    const link = (await fac.post(`/api/v1/facilitator/sessions/${session.body.id}/device-link`).expect(201))
      .body;
    expect(link.url).toMatch(/^http:\/\/localhost:5173\/setup\/[A-Za-z0-9_-]{20,}$/);
    const code = String(link.url).split('/setup/')[1];

    const phone = request(app);
    await phone
      .post('/api/v1/devices/claim')
      .send({ code: 'x'.repeat(24) })
      .expect(404);
    const claim = (await phone.post('/api/v1/devices/claim').send({ code }).expect(200)).body;
    expect(claim).toMatchObject({ language: 'en', deviceLabel: 'Phone 2' });
    await phone.post('/api/v1/devices/claim').send({ code }).expect(404); // one-time only

    const status = () => phone.get('/api/v1/devices/status').set('x-device-token', claim.deviceToken);
    expect((await status().expect(200)).body).toEqual({ wipe: false });
    expect((await phone.get('/api/v1/devices/status').set('x-device-token', 'y'.repeat(30))).body).toEqual({
      wipe: true,
    });
    const live = () => fac.get(`/api/v1/facilitator/sessions/${session.body.id}/live`);
    expect((await live()).body.device).toMatchObject({ linked: true, wipeRequested: false, wipedAt: null });

    await fac.post(`/api/v1/facilitator/sessions/${session.body.id}/wipe`).expect(200);
    expect((await status()).body).toEqual({ wipe: true });
    await phone.post('/api/v1/devices/wiped').set('x-device-token', claim.deviceToken).expect(204);
    const after = (await live()).body;
    expect(after.ended).toBe(true);
    expect(after.device.wipedAt).not.toBeNull();
    await fac.post(`/api/v1/facilitator/sessions/${session.body.id}/device-link`).expect(409);
  });

  it('offline hand-over: a facilitator uploads a sealed package once, for their own participant only', async () => {
    const { agent: fac } = await signup('facilitator', 'ho-fac@example.com');
    const { agent: other } = await signup('facilitator', 'ho-other@example.com');
    const { agent: phone, me: participant } = await signup('participant', 'ho-p@example.com');
    await fac.post('/api/v1/facilitator/sessions').send({ participantId: participant.id }).expect(201);
    const pass = (await phone.get('/api/v1/participant/handover-pass').expect(200)).body as {
      publicKey: string;
      kid: string;
      token: string;
    };
    const key = randomUUID();
    const payload: Parameters<typeof sealHandover>[0] = {
      v: 1 as const,
      userId: participant.id,
      token: pass.token,
      createdAt: new Date().toISOString(),
      checkups: [
        {
          key,
          body: CheckupSubmission.parse({ language: 'en', startedAt: new Date().toISOString(), answers }),
        },
      ],
      safetyEvents: [
        {
          id: randomUUID(),
          tier: 2 as const,
          triggerType: 'item9' as const,
          actions: ['safety_screen_shown' as const, 'referral_list_shown' as const],
          occurredAt: new Date().toISOString(),
          recordedByRole: 'system' as const,
        },
      ],
    };
    const sealed = await sealHandover(payload, pass.publicKey, pass.kid);

    await other.post('/api/v1/facilitator/handover').send(sealed).expect(403);
    await phone.post('/api/v1/facilitator/handover').send(sealed).expect(403);
    expect((await fac.post('/api/v1/facilitator/handover').send(sealed).expect(200)).body).toEqual({
      saved: 2,
      already: 0,
      invalid: 0,
    });
    expect((await fac.post('/api/v1/facilitator/handover').send(sealed).expect(200)).body).toEqual({
      saved: 0,
      already: 2,
      invalid: 0,
    });
    const mine = (await phone.get('/api/v1/participant/assessments').expect(200)).body as unknown[];
    expect(mine).toHaveLength(1);
    // The phone sending the same check-up itself later gives back the same stored one, not a second.
    await phone
      .post('/api/v1/participant/assessments')
      .set('Idempotency-Key', key)
      .send(payload.checkups[0]?.body)
      .expect(200);

    const forged = await sealHandover(
      { ...payload, token: `${Math.floor(Date.now() / 1000)}.${'x'.repeat(43)}` },
      pass.publicKey,
      pass.kid,
    );
    await fac.post('/api/v1/facilitator/handover').send(forged).expect(403);
    const garbled = { ...sealed, ct: sealed.ct.slice(0, -4) + 'AAAA' };
    await fac.post('/api/v1/facilitator/handover').send(garbled).expect(400);
    await fac
      .post('/api/v1/facilitator/handover')
      .send({ ...sealed, kid: '00000000' })
      .expect(400);

    // Someone who has not agreed to take part: the package opens, but nothing is stored.
    const { agent: noConsent, me: other2 } = await signup(
      'participant',
      'ho-nc@example.com',
      undefined,
      false,
    );
    await fac.post('/api/v1/facilitator/sessions').send({ participantId: other2.id }).expect(201);
    const ncPass = (await noConsent.get('/api/v1/participant/handover-pass').expect(200)).body as typeof pass;
    const ncSealed = await sealHandover(
      {
        ...payload,
        userId: other2.id,
        token: ncPass.token,
        safetyEvents: [],
        checkups: [{ ...payload.checkups[0], key: randomUUID() } as (typeof payload.checkups)[number]],
      },
      ncPass.publicKey,
      ncPass.kid,
    );
    expect((await fac.post('/api/v1/facilitator/handover').send(ncSealed).expect(200)).body).toEqual({
      saved: 0,
      already: 0,
      invalid: 1,
    });
  });

  it('allows at most five new check-ups a day per person, while repeats of the same one still answer', async () => {
    const { agent } = await signup('participant', 'daily-limit@example.com');
    const body = { language: 'en', startedAt: new Date().toISOString(), answers };
    const keys = Array.from({ length: 5 }, () => randomUUID());
    for (const key of keys)
      await agent.post('/api/v1/participant/assessments').set('Idempotency-Key', key).send(body).expect(201);
    const sixth = await agent
      .post('/api/v1/participant/assessments')
      .set('Idempotency-Key', randomUUID())
      .send(body)
      .expect(429);
    expect(sixth.body.error.code).toBe('DAILY_LIMIT');
    await agent
      .post('/api/v1/participant/assessments')
      .set('Idempotency-Key', keys[0] ?? '')
      .send(body)
      .expect(200);
  });

  it('dashboards include 14 days of chart data', async () => {
    const { agent } = await signup('researcher_admin', 'charts-admin@example.com');
    const dash = await agent.get('/api/v1/dashboard');
    expect(dash.body.checkupsByDay).toHaveLength(14);
    expect(dash.body.checkupsByDay.at(-1).count).toBeGreaterThan(0);
    expect(dash.body.signupsByDay).toHaveLength(14);
  });

  it('logs hold no identifiers, passwords or health values (FR-15)', () => {
    // Random request IDs are hex, so digits inside them are not values.
    const log = lines.join('').replace(/"reqId":"[0-9a-f]+"/g, '');
    for (const sentinel of [
      'correct-horse-1',
      '0788',
      'lockme@example.com',
      '250788555444',
      'test-brevo-key',
      'test-wa-token',
      'reports-user@example.com',
      'test-gemini-key',
      '"systolic"',
      'google.user@gmail.com',
    ]) {
      expect(log).not.toContain(sentinel);
    }
  });
});
