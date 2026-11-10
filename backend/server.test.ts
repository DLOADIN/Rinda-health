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
  generativeGuideAllowed,
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
  pcmToWav,
  speechChunks,
  voiceChain,
  wavParts,
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

const GOOD_LIBRARY = { 'guide.tip': 'Small steps help.' };
const geminiAnswer = (text = 'Small steps help.', sourceIds = ['guide.tip']) =>
  new Response(
    JSON.stringify({
      candidates: [
        {
          finishReason: 'STOP',
          content: {
            parts: [{ text: JSON.stringify({ paragraphs: [{ text, sourceIds }], followUpChipIds: [] }) }],
          },
        },
      ],
    }),
    { status: 200 },
  );

describe('voice helpers', () => {
  it('wraps raw speech in a WAV file and reads it back', () => {
    const pcm = Buffer.from([1, 0, 2, 0, 3, 0, 4, 0]);
    const wav = pcmToWav(pcm, 24000);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wavParts(wav)).toMatchObject({ sampleRate: 24000, channels: 1, bits: 16 });
    expect(wavParts(wav)?.pcm).toEqual(pcm);
    expect(wavParts(Buffer.from('not audio'))).toBeNull();
  });

  it('splits long text into short sentences without losing words', () => {
    const text = 'Hello, I am Rinda. '.repeat(20);
    const chunks = speechChunks(text, 60);
    expect(chunks.every((c) => c.length <= 60)).toBe(true);
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toBe(text.trim().replace(/\s+/g, ' '));
  });

  it('only uses voice services that have a key, in the configured order', () => {
    const base = loadConfig({ SESSION_SECRET: 'x'.repeat(40) });
    expect(voiceChain(base)).toEqual([]);
    expect(voiceChain({ ...base, GROQ_API_KEY: 'g', ELEVENLABS_API_KEY: 'e', GEMINI_API_KEY: 'm' })).toEqual([
      'groq',
      'elevenlabs',
      'gemini',
    ]);
    expect(voiceChain({ ...base, ELEVEN_LABS_API_KEY: 'e' })).toEqual(['elevenlabs']);
    expect(
      voiceChain({ ...base, GROQ_API_KEY: 'g', GEMINI_API_KEY: 'm', VOICE_PROVIDERS: 'groq,gemini,unknown' }),
    ).toEqual(['groq', 'gemini']);
  });
});

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
      return geminiAnswer();
    }) as unknown as typeof fetch;
    const first = await explainWithModels(config, fakeFetch, {}, GOOD_LIBRARY, []);
    expect(first.model).toBe('model-two');
    expect(asked).toEqual(['model-one', 'model-two']);
    asked.length = 0;
    await explainWithModels(config, fakeFetch, {}, GOOD_LIBRARY, []);
    expect(asked).toEqual(['model-two']);

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
        : geminiAnswer()) as unknown as typeof fetch;
    expect((await explainWithModels(busyConfig, busyFetch, {}, GOOD_LIBRARY, [])).model).toBe('calm-two');
    busy = false;
    expect((await explainWithModels(busyConfig, busyFetch, {}, GOOD_LIBRARY, [])).model).toBe('busy-one');
  });

  it('asks the next model when an answer is empty or fails the checks, and keeps the last outcome if none passes', async () => {
    const config = loadConfig({
      APP_ENV: 'test',
      GEMINI_API_KEY: 'k',
      GEMINI_MODEL: 'checks-empty',
      GEMINI_FALLBACK_MODELS: 'checks-diagnoses,checks-good',
    });
    const asked: string[] = [];
    const fakeFetch = (async (url: string) => {
      const model = /models\/([^:]+):/.exec(url)?.[1] ?? '';
      asked.push(model);
      if (model === 'checks-empty') return new Response(JSON.stringify({ candidates: [] }), { status: 200 });
      if (model === 'checks-diagnoses') return geminiAnswer('You have a disease.');
      return geminiAnswer();
    }) as unknown as typeof fetch;
    const r = await explainWithModels(config, fakeFetch, {}, GOOD_LIBRARY, []);
    expect(r).toMatchObject({ outcome: 'pass', model: 'checks-good' });
    expect(asked).toEqual(['checks-empty', 'checks-diagnoses', 'checks-good']);

    const allBad = loadConfig({
      APP_ENV: 'test',
      GEMINI_API_KEY: 'k',
      GEMINI_MODEL: 'bad-a',
      GEMINI_FALLBACK_MODELS: 'bad-b',
    });
    const badFetch = (async () => geminiAnswer('You have a disease.')) as unknown as typeof fetch;
    expect(await explainWithModels(allBad, badFetch, {}, GOOD_LIBRARY, [])).toMatchObject({
      answer: null,
      outcome: 'banned',
      model: 'bad-b',
    });
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

    const library = { 'guide.tip': 'Small steps help.' };
    const first = await explainWithModels(config, fakeFetch, {}, library, []);
    expect(first).toMatchObject({ outcome: 'pass', model: 'openrouter:chain/free:free' });
    expect(first.answer?.paragraphs[0]?.text).toBe('Small steps help.');
    expect(asked).toEqual(['gemini', 'groq', 'openrouter']);

    asked.length = 0;
    groq = 'ok';
    expect((await explainWithModels(config, fakeFetch, {}, library, [])).model).toBe('groq:chain-groq');
    expect(asked).toEqual(['groq']);

    const down = (async () => new Response('{}', { status: 503 })) as unknown as typeof fetch;
    const none = await explainWithModels(config, down, {}, {}, []);
    expect(none).toMatchObject({ answer: null, outcome: 'error', model: null });

    const pilot = { ...config, APP_ENV: 'pilot' as const };
    expect(guideChain(pilot).map((s) => s.provider)).toEqual(['gemini']);
    expect(guideChain({ ...config, GROQ_API_KEY: undefined }).map((s) => s.provider)).toEqual([
      'gemini',
      'openrouter',
    ]);
  });

  it('keeps the AI guide off in the pilot unless Gemini is on a paid tier, whatever other keys are set', () => {
    const base = loadConfig({ APP_ENV: 'test', ETHICS_AMENDMENT_REF: 'REF-1' });
    const pilot = (extra: Partial<typeof base>) => ({ ...base, APP_ENV: 'pilot' as const, ...extra });
    expect(generativeGuideAllowed(pilot({ GROQ_API_KEY: 'k', OPENROUTER_API_KEY: 'k' }))).toBe(false);
    expect(generativeGuideAllowed(pilot({ GEMINI_API_KEY: 'k', GEMINI_PAID_TIER: 'false' }))).toBe(false);
    expect(generativeGuideAllowed(pilot({ GEMINI_API_KEY: 'k', GEMINI_PAID_TIER: 'true' }))).toBe(true);
    expect(generativeGuideAllowed({ ...base, GROQ_API_KEY: 'k' })).toBe(true);
    expect(generativeGuideAllowed({ ...base, GROQ_API_KEY: 'k', ETHICS_AMENDMENT_REF: undefined })).toBe(
      false,
    );
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
    PINDO_API_TOKEN: 'test-pindo-token',
    ELEVENLABS_API_KEY: 'test-voice-key',
    GROQ_API_KEY: 'test-groq-key',
    GUIDE_PROVIDERS: 'gemini',
    VOICE_PROVIDERS: 'elevenlabs,gemini,groq',
    SMS_ONLY_TO: '+250788555999, +250788555111',
    PUBLIC_URL: 'http://localhost:5173',
  });
  const { logger, lines } = sinkLogger();
  let googleClaims: Record<string, unknown> = {};
  let geminiAnswer: unknown = null;
  const voiceDown = new Set<string>();
  const outbound: Array<{ url: string; body: string }> = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    outbound.push({ url, body: String(init?.body ?? '') });
    if (url.includes('generativelanguage.googleapis.com') && url.includes('-tts')) {
      if (voiceDown.has('gemini')) return new Response('{}', { status: 429 });
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: 'AQACAAMABAA=' } }],
              },
            },
          ],
        }),
        { status: 200 },
      );
    }
    if (url.includes('api.groq.com/openai/v1/audio/speech')) {
      if (voiceDown.has('groq')) return new Response('{}', { status: 500 });
      return new Response(pcmToWav(Buffer.from([9, 0, 9, 0]), 48000), { status: 200 });
    }
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
    if (url.includes('api.brevo.com')) return new Response('{"messageId":"<test@brevo>"}', { status: 201 });
    if (url.includes('api.elevenlabs.io') && voiceDown.has('elevenlabs'))
      return new Response('{}', { status: 401 });
    if (url.includes('api.elevenlabs.io'))
      return new Response(new Uint8Array([73, 68, 51, 4]), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      });
    if (url.includes('api.pindo.io'))
      return new Response('{"status":"sent","sms_id":"out_sms_test"}', { status: 201 });
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
    expect((await agent.get('/api/v1/dashboard')).body.cards).toHaveLength(5);
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
    const since = new Date();
    const { agent } = await signup('participant', 'guide-user@example.com');
    expect((await agent.get('/api/v1/participant/ai-explanations')).body).toEqual({
      ai: true,
      available: true,
    });
    await agent.put('/api/v1/participant/ai-explanations').send({ ai: false }).expect(200);
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
    const log = await db.query(
      'SELECT source, validator_outcome FROM guide_request_log WHERE created_at >= $1 ORDER BY created_at',
      [since],
    );
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

  it('phone health readings: only with consent, upserted per day, deleted when sharing stops', async () => {
    const { agent } = await signup('participant', 'phone-health@example.com');
    const day = new Date().toISOString().slice(0, 10);
    const upload = {
      platform: 'android',
      readings: [
        { type: 'heartRate', day, value: 72, value2: null, min: 58, max: 131, unit: 'bpm' },
        { type: 'bloodPressure', day, value: 118, value2: 76, min: null, max: null, unit: 'mmHg' },
        { type: 'steps', day, value: 6400, value2: null, min: null, max: null, unit: 'count' },
      ],
    };
    expect((await agent.get('/api/v1/participant/phone-health')).body).toMatchObject({
      available: true,
      share: false,
      readings: [],
    });
    const refused = await agent.post('/api/v1/participant/phone-health/readings').send(upload);
    expect(refused.status).toBe(409);

    await agent.put('/api/v1/participant/phone-health/consent').send({ share: true }).expect(200);
    await agent.post('/api/v1/participant/phone-health/readings').send(upload).expect(200);
    await agent
      .post('/api/v1/participant/phone-health/readings')
      .send({ ...upload, readings: [{ ...upload.readings[0], value: 75 }] })
      .expect(200);
    const listed = (await agent.get('/api/v1/participant/phone-health')).body;
    expect(listed.share).toBe(true);
    expect(listed.readings).toHaveLength(3);
    expect(listed.readings.find((r: { type: string }) => r.type === 'heartRate')).toMatchObject({
      value: 75,
      min: 58,
      max: 131,
      platform: 'android',
    });
    expect(listed.readings.find((r: { type: string }) => r.type === 'bloodPressure')).toMatchObject({
      value: 118,
      value2: 76,
    });

    await agent
      .post('/api/v1/participant/phone-health/readings')
      .send({ ...upload, readings: [{ ...upload.readings[0], value: 900 }] })
      .expect(400);

    await agent.put('/api/v1/participant/phone-health/consent').send({ share: false }).expect(200);
    const after = await db.query("SELECT count(*)::int AS n FROM phone_health_readings WHERE unit = 'bpm'");
    expect(after.rows[0].n).toBe(0);
    expect((await agent.get('/api/v1/participant/phone-health')).body.readings).toEqual([]);
  });

  it('Ask Rinda chat: fifteen questions a day about Rinda Health, and crisis words are never sent', async () => {
    const { agent } = await signup('participant', 'chat-user@example.com');
    await agent
      .post('/api/v1/participant/assessments')
      .set('Idempotency-Key', randomUUID())
      .send({
        language: 'en',
        startedAt: new Date().toISOString(),
        answers: { ...answers, systolic: 120, diastolic: 80 },
      })
      .expect(201);
    const ask = (body: Record<string, unknown>) =>
      agent.post('/api/v1/chat').send({ language: 'en', ...body });

    expect((await agent.get('/api/v1/chat')).body).toEqual({ available: true, turnsLeft: 15 });
    await agent.put('/api/v1/participant/ai-explanations').send({ ai: false }).expect(200);
    expect((await agent.get('/api/v1/chat')).body).toEqual({ available: false, turnsLeft: 15 });
    expect((await ask({ question: 'How can I walk more?' })).body.status).toBe('unavailable');
    await agent.put('/api/v1/participant/ai-explanations').send({ ai: true }).expect(200);
    expect((await agent.get('/api/v1/chat')).body).toEqual({ available: true, turnsLeft: 15 });

    outbound.length = 0;
    const crisis = await ask({ question: 'I want to kill myself' });
    expect(crisis.status).toBe(422);
    expect(crisis.body.error.code).toBe('CHAT_SAFETY');
    const personal = await ask({ question: 'call me on 0788 123 456' });
    expect(personal.body.error.code).toBe('CHAT_PERSONAL');
    const hidden = await ask({
      question: 'And walking?',
      history: [{ role: 'user', text: 'my email is someone@example.com' }],
    });
    expect(hidden.body.error.code).toBe('CHAT_PERSONAL');
    expect((await ask({ question: 'I feel so stressed lately' })).body).toMatchObject({
      status: 'off_topic',
      turnsLeft: 15,
    });
    await ask({ question: 'Hi', chipId: 'tips' }).expect(400);
    expect(outbound).toHaveLength(0);
    expect((await agent.get('/api/v1/chat')).body.turnsLeft).toBe(15);

    geminiAnswer = {
      paragraphs: [
        { text: 'Short walks count, and a few on most days add up.', sourceIds: ['guide.tpl.first_step'] },
      ],
      followUpChipIds: [],
    };
    const first = await ask({ question: 'How can I walk more?' });
    expect(first.body).toMatchObject({ status: 'answered', turnsLeft: 14 });
    expect(first.body.requestId).toEqual(expect.any(String));
    await agent
      .post('/api/v1/guide/feedback')
      .send({ requestId: first.body.requestId, helpful: true })
      .expect(204);
    const sent = outbound.find((o) => o.url.includes('generativelanguage'))?.body ?? '';
    expect(sent).toContain('How can I walk more?');
    for (const secret of ['chat-user@example.com', 'phq9', 'gad7']) expect(sent).not.toContain(secret);

    geminiAnswer = {
      paragraphs: [{ text: 'off topic', sourceIds: ['rinda.off_topic'] }],
      followUpChipIds: [],
    };
    expect((await ask({ question: 'Who won the football match?' })).body).toMatchObject({
      status: 'off_topic',
      paragraphs: [],
      turnsLeft: 13,
    });
    geminiAnswer = {
      paragraphs: [{ text: 'Short walks count.', sourceIds: ['guide.tpl.first_step'] }],
      followUpChipIds: [],
    };
    expect((await ask({ chipId: 'tips' })).body.turnsLeft).toBe(12);
    expect((await ask({ question: 'And fruit?' })).body.turnsLeft).toBe(11);
    for (let left = 10; left >= 0; left--)
      expect((await ask({ question: 'And salt?' })).body.turnsLeft).toBe(left);
    const overLimit = await ask({ question: 'One more?' });
    expect(overLimit.status).toBe(429);
    expect(overLimit.body.error.code).toBe('CHAT_LIMIT');

    const chatLog = await db.query("SELECT * FROM guide_request_log WHERE chip_id = 'chat'");
    expect(chatLog.rows).toHaveLength(15);
    expect(JSON.stringify(chatLog.rows)).not.toMatch(/walk more|football|fruit/);

    const facilitator = await signup('facilitator', 'chat-facilitator@example.com');
    const general = await facilitator.agent
      .post('/api/v1/chat')
      .send({ language: 'en', question: 'What does Rinda check?' });
    expect(general.body).toMatchObject({ status: 'answered', turnsLeft: 14 });
  });

  it('email reports: on by default for email accounts, can be switched off, NCD results only (ADR-020)', async () => {
    const byPhone = await signup('participant', '0788 555 444');
    expect((await byPhone.agent.get('/api/v1/participant/email-reports')).body).toEqual({
      email: false,
      available: true,
      hasEmail: false,
      decided: false,
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

    expect((await agent.get('/api/v1/participant/email-reports')).body).toEqual({
      email: true,
      available: true,
      hasEmail: true,
      decided: false,
    });
    await agent.put('/api/v1/participant/email-reports').send({ email: false }).expect(200);
    outbound.length = 0;
    await submit().expect(201);
    await new Promise((r) => setTimeout(r, 300));
    expect(brevoCalls()).toHaveLength(0);

    await agent.put('/api/v1/participant/email-reports').send({ email: true, extra: 1 }).expect(400);
    await agent.put('/api/v1/participant/email-reports').send({ email: true }).expect(200);
    const kept: Promise<unknown>[] = [];
    const contextKey = Symbol.for('@vercel/request-context');
    const scope = globalThis as Record<symbol, unknown>;
    scope[contextKey] = { get: () => ({ waitUntil: (task: Promise<unknown>) => kept.push(task) }) };
    const checkup = await Promise.resolve(submit().expect(201)).finally(() => delete scope[contextKey]);
    expect(kept).toHaveLength(2);
    await Promise.all(kept);
    expect(brevoCalls()).toHaveLength(1);
    await waitForBrevo(1);
    const call = brevoCalls()[0];
    expect(call?.url).toBe('https://api.brevo.com/v3/smtp/email');
    const payload = JSON.parse(call?.body ?? '{}');
    expect(payload).toMatchObject({
      sender: { name: 'Rinda Health Services', email: 'reports@rinda.test' },
      to: [{ email: 'reports-user@example.com' }],
      subject: 'Your Rinda check-up summary',
    });
    expect(payload.textContent).toContain('Blood pressure');
    expect(payload.textContent).toContain('40% of the healthy target');
    expect(payload.textContent).toContain('Why it matters');
    expect(payload.textContent).toContain('What you can do');
    expect(payload.textContent).toContain('Your plan for this week');
    expect(payload.textContent).toContain('Your number: 60 minutes a week');
    expect(payload.htmlContent).toContain('Sent by Rinda Health Services');
    expect(payload.textContent).toContain(`http://localhost:5173/app/results/${checkup.body.id}`);
    expect(payload.textContent).not.toMatch(/phq|gad|mood|anxiety|depress/i);
    expect(payload.htmlContent).not.toContain('<script');
    const paragraphs = String(payload.textContent).split('\n\n');
    expect(new Set(paragraphs).size).toBe(paragraphs.length);
    const events = await db.query(
      "SELECT channel, status FROM message_events WHERE user_id = $1 AND channel = 'email'",
      [me.id],
    );
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

    const fresh = await signup('participant', 'default-on@example.com');
    outbound.length = 0;
    await fresh.agent
      .post('/api/v1/participant/assessments')
      .set('Idempotency-Key', randomUUID())
      .send({ language: 'en', startedAt: new Date().toISOString(), answers })
      .expect(201);
    await waitForBrevo(1);
    expect(JSON.parse(brevoCalls()[0]?.body ?? '{}').to).toEqual([{ email: 'default-on@example.com' }]);
  });

  it('SMS reports: on by default for phone accounts, NCD results only, can be switched off or limited', async () => {
    const byEmail = await signup('participant', 'sms-no-phone@example.com');
    expect((await byEmail.agent.get('/api/v1/participant/sms-notices')).body).toEqual({
      sms: false,
      available: true,
      hasPhone: false,
      decided: false,
    });
    await byEmail.agent.put('/api/v1/participant/sms-notices').send({ sms: true }).expect(409);

    const { agent, me } = await signup('participant', '0788 555 999');
    expect((await agent.get('/api/v1/participant/sms-notices')).body).toEqual({
      sms: true,
      available: true,
      hasPhone: true,
      decided: false,
    });
    const submit = (who = agent) =>
      who
        .post('/api/v1/participant/assessments')
        .set('Idempotency-Key', randomUUID())
        .send({ language: 'en', startedAt: new Date().toISOString(), answers });
    const calls = () => outbound.filter((o) => o.url.includes('api.pindo.io'));
    const settle = () => new Promise((r) => setTimeout(r, 800));

    outbound.length = 0;
    const checkup = await submit().expect(201);
    for (let i = 0; i < 40 && calls().length < 1; i++) await new Promise((r) => setTimeout(r, 250));
    expect(calls()).toHaveLength(1);
    const call = calls()[0];
    expect(call?.url).toBe('https://api.pindo.io/v1/sms/');
    const body = JSON.parse(call?.body ?? '{}');
    expect(body).toMatchObject({ to: '+250788555999', sender: 'PindoTest' });
    expect(body.text).toContain('Blood pressure: Confirm at a health centre');
    expect(body.text).toContain(
      'Physical activity: Below recommended (60 minutes a week, 40% of the healthy target)',
    );
    expect(body.text).toContain(`http://localhost:5173/app/results/${checkup.body.id}`);
    expect(body.text).not.toMatch(/phq|gad|mood|anxiety|depress|test-pindo-token/i);
    expect(body.text).toMatch(/^[\x20-\x7E\n]*$/);
    const events = await db.query(
      "SELECT status FROM message_events WHERE user_id = $1 AND channel = 'sms'",
      [me.id],
    );
    expect(events.rows).toEqual([{ status: 'sent' }]);

    await agent.put('/api/v1/participant/sms-notices').send({ sms: false, extra: 1 }).expect(400);
    await agent.put('/api/v1/participant/sms-notices').send({ sms: false }).expect(200);
    outbound.length = 0;
    await submit().expect(201);
    await settle();
    expect(calls()).toHaveLength(0);

    const outside = await signup('participant', '0788 555 222');
    outbound.length = 0;
    await submit(outside.agent).expect(201);
    const smsEvents = () =>
      db.query("SELECT status, error_code FROM message_events WHERE user_id = $1 AND channel = 'sms'", [
        outside.me.id,
      ]);
    for (let i = 0; i < 40 && (await smsEvents()).rows.length < 1; i++)
      await new Promise((r) => setTimeout(r, 250));
    expect(calls()).toHaveLength(0);
    expect((await smsEvents()).rows).toEqual([{ status: 'skipped', error_code: 'not_allowed' }]);
  });

  it('voice check-up: speaks only approved lines, makes each clip once and never sends answers', async () => {
    await request(app).get('/api/v1/voice').expect(401);
    const { agent } = await signup('participant', 'voice-user@example.com');
    expect((await agent.get('/api/v1/voice')).body).toEqual({ enabled: true, available: true });
    const voiceCalls = () => outbound.filter((o) => o.url.includes('api.elevenlabs.io'));

    outbound.length = 0;
    const first = await agent.get('/api/v1/voice/speech?id=q.tobacco.current&language=en').expect(200);
    expect(first.headers['content-type']).toContain('audio/mpeg');
    expect(Buffer.from(first.body)).toEqual(Buffer.from([73, 68, 51, 4]));
    expect(voiceCalls()).toHaveLength(1);
    const sent = JSON.parse(voiceCalls()[0]?.body ?? '{}');
    expect(sent.text).toContain('Do you currently use any tobacco');
    expect(sent.text).toContain('Please say yes or no.');
    expect(voiceCalls()[0]?.url).toContain('/v1/text-to-speech/');

    await agent.get('/api/v1/voice/speech?id=q.tobacco.current&language=en').expect(200);
    expect(voiceCalls()).toHaveLength(1);

    const choice = await agent.get('/api/v1/voice/speech?id=q.auditc.2&language=en').expect(200);
    expect(choice.body).toBeTruthy();
    expect(JSON.parse(voiceCalls()[1]?.body ?? '{}').text).toContain('Your choices are: 1 or 2, 3 or 4');

    await agent.get('/api/v1/voice/speech?id=q.unknown&language=en').expect(404);
    await agent.get('/api/v1/voice/speech?id=I%20weigh%2090&language=en').expect(400);
    await agent.get('/api/v1/voice/speech?id=q.tobacco.current&language=rw').expect(400);
    await agent.get('/api/v1/voice/speech?id=q.tobacco.current&language=en&text=hi').expect(400);
    const staff = await signup('facilitator', 'voice-staff@example.com');
    await staff.agent.get('/api/v1/voice').expect(403);

    const binary = (r: request.Response, done: (e: Error | null, body: Buffer) => void) => {
      const parts: Buffer[] = [];
      r.on('data', (c: Buffer) => parts.push(c));
      r.on('end', () => done(null, Buffer.concat(parts)));
    };
    voiceDown.add('elevenlabs');
    outbound.length = 0;
    const fromGemini = await agent
      .get('/api/v1/voice/speech?id=q.diet.salt&language=en')
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(fromGemini.headers['content-type']).toContain('audio/wav');
    expect(wavParts(fromGemini.body as Buffer)).toMatchObject({ sampleRate: 24000 });
    expect(outbound.map((o) => new URL(o.url).hostname)).toEqual([
      'api.elevenlabs.io',
      'generativelanguage.googleapis.com',
    ]);
    expect(JSON.parse(outbound[1]?.body ?? '{}').generationConfig.responseModalities).toEqual(['AUDIO']);

    voiceDown.add('gemini');
    outbound.length = 0;
    const fromGroq = await agent
      .get('/api/v1/voice/speech?id=voice.intro&language=en')
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(wavParts(fromGroq.body as Buffer)).toMatchObject({ sampleRate: 48000 });
    const groqCalls = outbound.filter((o) => o.url.includes('api.groq.com'));
    expect(groqCalls.length).toBeGreaterThan(1);
    for (const call of groqCalls) {
      const sent = JSON.parse(call.body);
      expect(sent).toMatchObject({ model: 'canopylabs/orpheus-v1-english', response_format: 'wav' });
      expect(sent.input.length).toBeLessThanOrEqual(180);
    }

    voiceDown.add('groq');
    await agent.get('/api/v1/voice/speech?id=voice.got&language=en').expect(503);
    await agent.get('/api/v1/voice/speech?id=q.diet.salt&language=en').expect(200);
    voiceDown.clear();
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

  it('live session console: steps and times only, for the session facilitator', async () => {
    const { agent: fac } = await signup('facilitator', 'live-fac@example.com');
    const { agent: p, me: participant } = await signup('participant', 'live-p@example.com');
    const progress = (step: string) => p.post('/api/v1/participant/session-progress').send({ step });
    await progress('signin').expect(204);

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
    await progress('results').expect(204);
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
    await phone.post('/api/v1/devices/claim').send({ code }).expect(404);

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
    // A facilitator who never started a session with this participant can still carry the package;
    // a closed session is opened for them so the upload stays traceable.
    expect((await other.post('/api/v1/facilitator/handover').send(sealed).expect(200)).body).toEqual({
      saved: 0,
      already: 2,
      invalid: 0,
    });
    const otherSessions = (await other.get('/api/v1/facilitator/sessions').expect(200)).body as Array<{
      participantId?: string;
      deviceLabel?: string | null;
    }>;
    expect(otherSessions.some((s) => s.deviceLabel === 'QR hand-over')).toBe(true);
    const mine = (await phone.get('/api/v1/participant/assessments').expect(200)).body as Array<{
      key: string;
      viaQr: boolean;
    }>;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ key, viaQr: true });

    const uploads = (await fac.get('/api/v1/facilitator/handovers').expect(200)).body as Array<{
      id: string;
      byMe: boolean;
      participantLabel: string;
      checkups: number;
    }>;
    const ours = uploads.filter((u) => u.byMe);
    expect(ours).toHaveLength(2);
    expect(ours[1]).toMatchObject({ checkups: 1, safetyEvents: 1, saved: 2, already: 0, invalid: 0 });
    expect(ours[0]).toMatchObject({ saved: 0, already: 2 });
    expect(ours[0]?.participantLabel).toBe('h•••@example.com');
    expect(JSON.stringify(uploads)).not.toContain('ho-p@example.com');
    const seenByOther = (await other.get('/api/v1/facilitator/handovers').expect(200)).body as Array<{
      id: string;
      byMe: boolean;
    }>;
    expect(seenByOther.find((u) => u.id === ours[1]?.id)?.byMe).toBe(false);
    const detail = await fac.get(`/api/v1/facilitator/handovers/${ours[1]?.id}`).expect(200);
    expect(detail.body.checkupList).toEqual([
      expect.objectContaining({ rulesetVersion: expect.any(String), newFromQr: true }),
    ]);
    expect(JSON.stringify(detail.body)).not.toMatch(/systolic|answers|results/);
    await phone.get('/api/v1/facilitator/handovers').expect(403);
    await fac.get(`/api/v1/facilitator/handovers/${randomUUID()}`).expect(404);
    const dash = (await fac.get('/api/v1/dashboard').expect(200)).body as {
      cards: Array<{ key: string; value: number }>;
    };
    expect(dash.cards.find((c) => c.key === 'qr_uploads')?.value).toBe(2);
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
