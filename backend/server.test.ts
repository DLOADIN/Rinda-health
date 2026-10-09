// API tests. The first block needs no database. The second runs every role's CRUD flow against a real PostgreSQL
// (Neon) inside a throwaway schema that is dropped afterwards; it runs when DATABASE_URL or TEST_DATABASE_URL is set.
import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { Writable } from 'node:stream';
import { config as loadDotenv } from 'dotenv';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createApp,
  createLogger,
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
    // Phone notices stay off in the pilot profile until the ethics committee knows (FR-58).
    expect(FLAG_DEFAULTS.pilot.messaging).toBe(false);
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
    const log = lines.join('');
    expect(log).not.toContain('482915');
    expect(log).not.toContain('x@y.co');
  });
});

// A throwaway schema needs a direct (unpooled) connection: Neon's pooler does not keep search_path.
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
    WHATSAPP_TOKEN: 'test-wa-token',
    WHATSAPP_PHONE_NUMBER_ID: '1234567890',
    PUBLIC_URL: 'http://localhost:5173',
  });
  const { logger, lines } = sinkLogger();
  let googleClaims: Record<string, unknown> = {};
  // One fake for every outside service: Google sign-in, Gemini and the WhatsApp Cloud API.
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
    // Safety net: never run these tests unless the throwaway schema really holds its own tables.
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

  const signup = async (role: string, identifier: string, password = 'correct-horse-1') => {
    const agent = request.agent(app);
    const res = await agent
      .post('/api/v1/auth/signup')
      .send({ role, identifier, password, preferredLanguage: 'en' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
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

    // This test app has an amendment reference and a Gemini key, so switching the AI on is allowed here; the
    // refusal without them is covered in the 'without a database' tests and the pilot placeholder check.
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

    // No phone on this account, so a WhatsApp opt-in is refused rather than stored for later.
    await agent.put('/api/v1/participant/messaging').send({ whatsapp: true }).expect(409);

    // No AI without the separate, unticked opt-in (consent scope ai_explanations).
    outbound.length = 0;
    expect((await agent.get('/api/v1/participant/ai-explanations')).body).toEqual({
      ai: false,
      available: true,
    });
    expect((await ask('first_step')).body.source).toBe('template');
    expect(outbound.some((o) => o.url.includes('generativelanguage'))).toBe(false);
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
    // Asked again: the saved answer comes back and Gemini is not called a second time.
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
      'pass',
      'saved',
      'numbers',
      'scope',
      'templates_only',
    ]);
  });

  it('WhatsApp notices: only after opt-in, and the message holds no results (ADR-020)', async () => {
    const { agent, me } = await signup('participant', '0788 555 444');
    expect((await agent.get('/api/v1/participant/messaging')).body).toEqual({
      whatsapp: false,
      whatsappAvailable: true,
      hasPhone: true,
    });
    const submit = () =>
      agent
        .post('/api/v1/participant/assessments')
        .set('Idempotency-Key', randomUUID())
        .send({ language: 'en', startedAt: new Date().toISOString(), answers });

    outbound.length = 0;
    await submit().expect(201);
    await new Promise((r) => setTimeout(r, 300));
    expect(outbound.some((o) => o.url.includes('graph.facebook.com'))).toBe(false);

    await agent.put('/api/v1/participant/messaging').send({ whatsapp: true }).expect(200);
    await submit().expect(201);
    for (let i = 0; i < 40 && !outbound.some((o) => o.url.includes('graph.facebook.com')); i++) {
      await new Promise((r) => setTimeout(r, 250));
    }
    await new Promise((r) => setTimeout(r, 500)); // let the message_events row land
    const call = outbound.find((o) => o.url.includes('graph.facebook.com'));
    expect(call?.url).toContain('/1234567890/messages');
    const payload = JSON.parse(call?.body ?? '{}');
    expect(payload).toMatchObject({
      to: '250788555444',
      type: 'template',
      template: { name: 'rinda_summary_ready' },
    });
    expect(call?.body).not.toMatch(/hypertension|below|band|systolic|142/i);
    const events = await db.query('SELECT status FROM message_events WHERE user_id = $1', [me.id]);
    expect(events.rows).toEqual([{ status: 'sent' }]);
  });

  it('dashboards include 14 days of chart data', async () => {
    const { agent } = await signup('researcher_admin', 'charts-admin@example.com');
    const dash = await agent.get('/api/v1/dashboard');
    expect(dash.body.checkupsByDay).toHaveLength(14);
    expect(dash.body.checkupsByDay.at(-1).count).toBeGreaterThan(0);
    expect(dash.body.signupsByDay).toHaveLength(14);
  });

  it('logs hold no identifiers, passwords or health values (FR-15)', () => {
    const log = lines.join('');
    for (const sentinel of [
      'correct-horse-1',
      '0788',
      'lockme@example.com',
      '250788555444',
      'test-wa-token',
      'test-gemini-key',
      '"systolic"',
      'google.user@gmail.com',
    ]) {
      expect(log).not.toContain(sentinel);
    }
  });
});
