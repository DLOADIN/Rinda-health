import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BUNDLED_CONTENT, RULESET_V1 } from '@rinda/content';
import {
  allowedNumbers,
  assessSafety,
  composeGuideAnswer,
  GUIDE_CHIPS,
  isValue,
  normalise,
  planNextSteps,
  scoreAssessment,
  validateMeasurement,
  type Answer,
  type AssessmentInput,
  type AssessmentResult,
  type Plan,
  type SafetyAssessment,
  type MeasurementType,
  type Sex,
} from '@rinda/rules';
import {
  AdminCreateUserRequest,
  AdminUpdateUserRequest,
  ApprovalRequest,
  ChangePasswordRequest,
  CheckupSubmission,
  ContentCreateRequest,
  ContentUpdateRequest,
  FacilitatorSafetyEventRequest,
  FLAG_KEYS,
  FlagKey,
  FlagUpdateRequest,
  GuideAnswer,
  GuideExplainRequest,
  GuideFeedbackRequest,
  MessagingPreference,
  AiPreference,
  LoginRequest,
  parseIdentifier,
  normalisePhone,
  ParticipantProfile,
  Role,
  SessionCreateRequest,
  SignupRequest,
  TASK_CODES,
  TaskResultRequest,
  UpdateMeRequest,
  type ErrorCode,
  type Flags,
  type Identifier,
  type Me,
} from '@rinda/schemas';
import argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { config as loadDotenv } from 'dotenv';
import express, {
  Router,
  type ErrorRequestHandler,
  type Express,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import pg from 'pg';
import pino, { type DestinationStream, type Logger } from 'pino';
import { z, ZodError } from 'zod';

export const API_VERSION = '0.2.0';
const HERE = import.meta.dirname;

const emptyAsUndefined = (v: unknown) => (v === '' ? undefined : v);
const optionalText = z.preprocess(emptyAsUndefined, z.string().optional());

const EnvSchema = z
  .object({
    APP_ENV: z.enum(['development', 'staging', 'pilot', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'silent']).default('info'),
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    DATABASE_URL: z.preprocess(emptyAsUndefined, z.url({ protocol: /^postgres(ql)?$/ }).optional()),
    DIRECT_URL: z.preprocess(emptyAsUndefined, z.url({ protocol: /^postgres(ql)?$/ }).optional()),
    DB_SCHEMA: z.preprocess(
      emptyAsUndefined,
      z
        .string()
        .regex(/^[a-z_][a-z0-9_]{0,40}$/)
        .optional(),
    ),
    SESSION_SECRET: z.string().min(32, 'must be at least 32 characters'),
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(72).default(12),
    SESSION_IDLE_HOURS: z.coerce.number().int().min(1).max(72).default(8),
    PUBLIC_URL: z.url().default('http://localhost:5173'),
    GOOGLE_CLIENT_ID: optionalText,
    GOOGLE_CLIENT_SECRET: optionalText,
    GEMINI_API_KEY: optionalText,
    GEMINI_MODEL: z.string().default('gemini-3.5-flash'),
    ETHICS_AMENDMENT_REF: optionalText,
    /** Set to true only for a paid Gemini tier whose terms say prompts are not used for training (needed in the pilot). */
    GEMINI_PAID_TIER: z.preprocess(emptyAsUndefined, z.enum(['true', 'false']).default('false')),
    WHATSAPP_TOKEN: optionalText,
    WHATSAPP_PHONE_NUMBER_ID: optionalText,
    WHATSAPP_TEMPLATE: z.string().default('rinda_summary_ready'),
    WHATSAPP_TEMPLATE_LANGUAGE_EN: z.string().default('en'),
    WHATSAPP_TEMPLATE_LANGUAGE_RW: z.string().default('en'),
    WHATSAPP_API_VERSION: z.string().default('v21.0'),
    MESSAGING_APPROVAL_REF: optionalText,
    SEED_PASSWORD: optionalText,
  })
  .superRefine((env, ctx) => {
    if (env.APP_ENV !== 'development' && env.APP_ENV !== 'test' && !env.DATABASE_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: `is required when APP_ENV=${env.APP_ENV}`,
      });
    }
    if (env.APP_ENV === 'pilot' && env.ETHICS_AMENDMENT_REF?.toUpperCase().startsWith('SYNTHETIC')) {
      ctx.addIssue({
        code: 'custom',
        path: ['ETHICS_AMENDMENT_REF'],
        message: 'must be the approved amendment reference in the pilot, not a SYNTHETIC placeholder',
      });
    }
  });

export type AppConfig = z.infer<typeof EnvSchema> & { generatedSecret: boolean };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (env === process.env) {
    loadDotenv({ path: [path.join(HERE, '.env'), path.join(HERE, '..', '.env')], quiet: true });
  }
  if (env['NODE_ENV'] === 'production' && !env['APP_ENV']) {
    throw new Error(
      'Invalid environment. Fix these in .env (see .env.example):\n  - APP_ENV: is required when NODE_ENV=production',
    );
  }
  const appEnv = env['APP_ENV'] ?? 'development';
  const input: Record<string, string | undefined> = { ...env };
  let generatedSecret = false;
  if ((appEnv === 'development' || appEnv === 'test') && !input['SESSION_SECRET']) {
    input['SESSION_SECRET'] = randomBytes(48).toString('base64url');
    generatedSecret = true;
  }
  const parsed = EnvSchema.safeParse(input);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(env)'}: ${i.message}`);
    throw new Error(`Invalid environment. Fix these in .env (see .env.example):\n${lines.join('\n')}`);
  }
  return { ...parsed.data, generatedSecret };
}

const googleConfigured = (c: AppConfig) => Boolean(c.GOOGLE_CLIENT_ID && c.GOOGLE_CLIENT_SECRET);
const generativeGuideAllowed = (c: AppConfig) =>
  Boolean(c.ETHICS_AMENDMENT_REF && c.GEMINI_API_KEY) &&
  (c.APP_ENV !== 'pilot' || c.GEMINI_PAID_TIER === 'true');
const whatsappConfigured = (c: AppConfig) => Boolean(c.WHATSAPP_TOKEN && c.WHATSAPP_PHONE_NUMBER_ID);

const SENSITIVE_KEYS = [
  'pin',
  'password',
  'newPassword',
  'currentPassword',
  'token',
  'accessToken',
  'refreshToken',
  'answers',
  'responses',
  'measurements',
  'value',
  'systolic',
  'diastolic',
  'studyCode',
  'email',
  'phone',
  'identifier',
  'values',
  'results',
  'plan',
  'facts',
  'templateAnswer',
  'paragraphs',
  'heightCm',
  'weightKg',
  'waistCm',
  'servingsPerDay',
  'moderateMinutes',
  'vigorousMinutes',
];
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  ...SENSITIVE_KEYS.flatMap((k) => [k, `*.${k}`, `*.*.${k}`]),
];

export function createLogger(level: string, destination?: DestinationStream): Logger {
  return pino(
    {
      level,
      base: { service: 'rinda-api' },
      redact: { paths: REDACT_PATHS, censor: '[redacted]' },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    destination,
  );
}

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

const notFound = () => new AppError(404, 'NOT_FOUND', 'Not found.');
const forbidden = () => new AppError(403, 'FORBIDDEN', 'You do not have access to this.');

export type Db = pg.Pool;
type Queryable = pg.Pool | pg.PoolClient;

export function createPool(connectionString: string, schema?: string): Db {
  // A schema (tests only) is set as a startup option, so it applies before the first query. Use a direct URL.
  return new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    ...(schema ? { options: `-c search_path=${schema},public` } : {}),
  });
}

async function rows<T extends pg.QueryResultRow>(
  db: Queryable,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

async function one<T extends pg.QueryResultRow>(
  db: Queryable,
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  return (await db.query<T>(sql, params)).rows[0] ?? null;
}

async function tx<T>(db: Db, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export function directUrlOf(config: Pick<AppConfig, 'DIRECT_URL' | 'DATABASE_URL'>): string | undefined {
  if (config.DIRECT_URL) return config.DIRECT_URL;
  if (!config.DATABASE_URL) return undefined;
  const url = new URL(config.DATABASE_URL);
  url.hostname = url.hostname.replace('-pooler.', '.');
  return url.toString();
}

const MIGRATIONS_DIR = path.join(HERE, 'db', 'migrations');

/** Applies every db/migrations/*.sql file that has not run yet, each in its own transaction. */
export async function migrate(db: Db, schema?: string): Promise<string[]> {
  if (schema) await db.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  await db.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const done = new Set(
    (await rows<{ name: string }>(db, 'SELECT name FROM schema_migrations')).map((r) => r.name),
  );
  const applied: string[] = [];
  for (const file of readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    if (done.has(file)) continue;
    // 001_init.sql may have been run by hand in the Neon SQL editor. If its tables exist, record it as applied.
    if (file === '001_init.sql' && done.size === 0) {
      // Only the schema being migrated counts: never let search_path fall through to another schema's tables.
      const existing = await one<{ t: string | null }>(
        db,
        "SELECT to_regclass(quote_ident(current_schema()) || '.users')::text AS t",
      );
      if (existing?.t) {
        await db.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        done.add(file);
        continue;
      }
    }
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    await tx(db, async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
    applied.push(file);
  }
  return applied;
}

interface UserRow extends pg.QueryResultRow {
  id: string;
  role: Role;
  email: string | null;
  phone: string | null;
  password_hash: string | null;
  google_sub: string | null;
  display_name: string | null;
  preferred_language: 'en' | 'rw';
  order_assignment: 'AB' | 'BA' | null;
  active: boolean;
  failed_attempts: number;
  locked_until: Date | null;
  created_at: Date;
  last_sign_in_at: Date | null;
  deleted_at: Date | null;
}

const toMe = (u: UserRow): Me => ({
  id: u.id,
  role: u.role,
  email: u.email,
  phone: u.phone,
  displayName: u.display_name,
  preferredLanguage: u.preferred_language,
  hasPassword: Boolean(u.password_hash),
  hasGoogle: Boolean(u.google_sub),
  createdAt: u.created_at.toISOString(),
});

export function maskIdentifier(email: string | null, phone: string | null): string {
  if (email) {
    const [local = '', domain = ''] = email.split('@');
    return `${local.slice(0, 1)}•••@${domain}`;
  }
  if (phone) return `${phone.slice(0, 5)}•• ••• ${phone.slice(-3)}`;
  return '—';
}

const isUniqueViolation = (e: unknown) => (e as { code?: string }).code === '23505';

async function audit(
  db: Queryable,
  actor: { id: string; role: string } | null,
  action: string,
  target?: { type: string; id: string },
  metadata?: Record<string, string | number | boolean>,
) {
  await db.query(
    'INSERT INTO audit_log (actor_id, actor_role, action, target_type, target_id, metadata) VALUES ($1, $2, $3, $4, $5, $6)',
    [
      actor?.id ?? null,
      actor?.role ?? 'system',
      action,
      target?.type ?? null,
      target?.id ?? null,
      metadata ?? null,
    ],
  );
}

const ARGON2 = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;
const hashPassword = (password: string) => argon2.hash(password, ARGON2);
let dummyHash: Promise<string> | null = null;
/** Verifies a password; with no hash, still spends the same time so unknown accounts are not revealed. */
async function verifyPassword(hash: string | null, password: string): Promise<boolean> {
  if (!hash) {
    dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
    await argon2.verify(await dummyHash, password);
    return false;
  }
  return argon2.verify(hash, password);
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const SESSION_COOKIE = 'rinda_session';
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

async function startSession(
  db: Db,
  config: AppConfig,
  res: Response,
  user: UserRow,
  method: 'password' | 'google',
) {
  const token = randomBytes(32).toString('base64url');
  await db.query(
    `INSERT INTO user_sessions (user_id, token_hash, auth_method, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(hours => $4))`,
    [user.id, sha256(token), method, config.SESSION_TTL_HOURS],
  );
  await db.query(
    'UPDATE users SET last_sign_in_at = now(), failed_attempts = 0, locked_until = NULL WHERE id = $1',
    [user.id],
  );
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.PUBLIC_URL.startsWith('https://'),
    sameSite: 'strict',
    path: '/api',
    maxAge: config.SESSION_TTL_HOURS * 3_600_000,
  });
  if (user.role !== 'participant') await audit(db, user, 'auth.signin', undefined, { method });
}

interface AuthUser {
  id: string;
  role: Role;
  sessionId: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    id: string;
    routePrefix?: string;
    user?: AuthUser;
  }
}

const OAUTH_COOKIE = 'rinda_oauth';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const OAuthState = z.strictObject({
  state: z.string(),
  verifier: z.string(),
  nonce: z.string(),
  intent: z.enum(['login', 'signup']),
  role: Role,
  language: z.enum(['en', 'rw']),
  exp: z.number(),
});
type OAuthState = z.infer<typeof OAuthState>;

const b64url = (buf: Buffer) => buf.toString('base64url');
const sign = (secret: string, data: string) => b64url(createHmac('sha256', secret).update(data).digest());

function sealState(secret: string, state: OAuthState): string {
  const data = b64url(Buffer.from(JSON.stringify(state)));
  return `${data}.${sign(secret, data)}`;
}

function openState(secret: string, sealed: string | undefined): OAuthState | null {
  if (!sealed) return null;
  const [data = '', signature = ''] = sealed.split('.');
  const expected = Buffer.from(sign(secret, data));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const parsed = OAuthState.safeParse(JSON.parse(Buffer.from(data, 'base64url').toString('utf8')));
    return parsed.success && parsed.data.exp > Date.now() ? parsed.data : null;
  } catch {
    return null;
  }
}

const GoogleClaims = z.object({
  iss: z.enum(['https://accounts.google.com', 'accounts.google.com']),
  aud: z.string(),
  sub: z.string().min(1),
  exp: z.number(),
  nonce: z.string(),
  email: z.email(),
  email_verified: z.literal(true),
});

function readIdToken(idToken: string, clientId: string, nonce: string) {
  const payload = idToken.split('.')[1];
  if (!payload) return null;
  try {
    const claims = GoogleClaims.safeParse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
    if (!claims.success) return null;
    const c = claims.data;
    return c.aud === clientId && c.nonce === nonce && c.exp * 1000 > Date.now() ? c : null;
  } catch {
    return null;
  }
}

const GUIDE_SYSTEM_PROMPT = `You are the guide inside Rinda Health, an educational app that helps young adults in Rwanda
(aged 18 to 35) understand everyday risk factors for non-communicable diseases.

You receive one person's results, already calculated by fixed rules, a short plan chosen by those rules, an answer
written from approved health-education text, and the library of approved text. Rewrite that answer so it speaks to
this person's own results and the question they chose.

These limits keep people safe, so follow them exactly:
- Use only the facts and approved text you are given. If something is not there, leave it out.
- Copy numbers exactly as given. Never calculate, round or estimate a new number.
- Results are educational bands, not diagnoses. Never say the person has a disease.
- No medicines, doses, treatments, phone numbers, links or emergency instructions. The app shows those itself.
- No weight-loss targets and no comments about body shape. Talk about everyday habits.
- Do not mention mood, stress, anxiety or mental health.
- Be warm and practical, with no blame, fear or shame. Use short sentences and everyday words.
- Write in the requested language, in at most 4 short paragraphs and under 150 words.
- For each paragraph, list the IDs of the approved texts it draws on, taken from the library.`;

/** Gemini structured-output schema (OpenAPI subset). Lengths and counts are checked afterwards with Zod. */
const GEMINI_ANSWER_SCHEMA = {
  type: 'OBJECT',
  properties: {
    paragraphs: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { text: { type: 'STRING' }, sourceIds: { type: 'ARRAY', items: { type: 'STRING' } } },
        required: ['text', 'sourceIds'],
      },
    },
    followUpChipIds: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['paragraphs', 'followUpChipIds'],
};

export type GuideOutcome = 'pass' | 'schema' | 'length' | 'numbers' | 'sources' | 'banned' | 'scope';

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  hundred: 100,
};
const BANNED =
  /\b(diagnos\w*|you have|cure[sd]?|guarantee\w*|medicine\w*|medication\w*|tablets?|pills?|dose\w*|mg|emergency|ambulance|suicid\w*|self-harm|obese)\b/i;
const OUT_OF_SCOPE = /\b(mood|stress\w*|anxi\w*|depress\w*|mental|worr\w*|PHQ|GAD)\b/i;
const LINK_OR_PHONE = /https?:\/\/|www\.|\+?\d[\d\s-]{6,}\d/;

/** Deterministic checks on a generated answer (docs/AI_GUIDE.md "Validator"). Returns the first failure, or pass. */
/** Every number in a text, written as digits ("20") or as a word ("one", "three"). */
export function numbersIn(text: string): number[] {
  return [
    ...[...text.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => Number(m[0].replace(',', '.'))),
    ...[...text.toLowerCase().matchAll(/\b[a-z]+\b/g)].flatMap((m) =>
      m[0] in NUMBER_WORDS ? [NUMBER_WORDS[m[0]] as number] : [],
    ),
  ];
}

export function validateGuideAnswer(
  answer: GuideAnswer,
  allowed: readonly number[],
  library: ReadonlySet<string>,
): GuideOutcome {
  const text = answer.paragraphs.map((p) => p.text).join(' ');
  if (text.split(/\s+/).filter(Boolean).length > 150) return 'length';
  if (LINK_OR_PHONE.test(text) || BANNED.test(text)) return 'banned';
  if (OUT_OF_SCOPE.test(text)) return 'scope';
  if (numbersIn(text).some((n) => !allowed.includes(n))) return 'numbers';
  if (answer.paragraphs.some((p) => p.sourceIds.some((id) => !library.has(id)))) return 'sources';
  return 'pass';
}

interface GeminiResult {
  answer: GuideAnswer | null;
  outcome: GuideOutcome | 'error' | 'refused';
  inputTokens: number | null;
  outputTokens: number | null;
}

async function explainWithGemini(
  config: AppConfig,
  fetchFn: typeof fetch,
  facts: Record<string, unknown>,
  library: Record<string, string>,
  allowed: readonly number[],
): Promise<GeminiResult> {
  const libraryText = Object.entries(library)
    .map(([id, text]) => `${id}: ${text}`)
    .join('\n');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.GEMINI_MODEL)}:generateContent`;
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': config.GEMINI_API_KEY ?? '' },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: `${GUIDE_SYSTEM_PROMPT}\n\nLibrary of approved text:\n${libraryText}` }],
      },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(facts) }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: GEMINI_ANSWER_SCHEMA,
        temperature: 0.4,
        maxOutputTokens: 2048,
      },
    }),
  });
  const body = z
    .object({
      candidates: z
        .array(
          z.object({
            finishReason: z.string().optional(),
            content: z.object({ parts: z.array(z.object({ text: z.string().optional() })) }).optional(),
          }),
        )
        .optional(),
      usageMetadata: z
        .object({ promptTokenCount: z.number().optional(), candidatesTokenCount: z.number().optional() })
        .optional(),
    })
    .safeParse(await res.json());
  const usage = {
    inputTokens: body.success ? (body.data.usageMetadata?.promptTokenCount ?? null) : null,
    outputTokens: body.success ? (body.data.usageMetadata?.candidatesTokenCount ?? null) : null,
  };
  if (!res.ok || !body.success) return { answer: null, outcome: 'error', ...usage };
  const candidate = body.data.candidates?.[0];
  const raw = candidate?.content?.parts.map((p) => p.text ?? '').join('') ?? '';
  if (!raw || (candidate?.finishReason && candidate.finishReason !== 'STOP'))
    return { answer: null, outcome: 'refused', ...usage };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { answer: null, outcome: 'schema', ...usage };
  }
  const answer = GuideAnswer.safeParse({
    ...(parsed as object),
    followUpChipIds: ((parsed as { followUpChipIds?: unknown[] }).followUpChipIds ?? [])
      .filter((c) => (GUIDE_CHIPS as readonly unknown[]).includes(c))
      .slice(0, 3),
  });
  if (!answer.success) return { answer: null, outcome: 'schema', ...usage };
  const outcome = validateGuideAnswer(answer.data, allowed, new Set(Object.keys(library)));
  return { answer: outcome === 'pass' ? answer.data : null, outcome, ...usage };
}

/** Values the participant entered, for their own charts (never sent to the guide or to any third party). */
function valuesOf(input: AssessmentInput) {
  const v = (a: Answer<number> | undefined) => (a && isValue(a) ? a.value : null);
  const audit = input.auditC.map(v);
  return {
    moderateMinutes: v(input.activity.moderateMinutes),
    vigorousMinutes: v(input.activity.vigorousMinutes),
    servingsPerDay: v(input.diet.servingsPerDay),
    heightCm: v(input.body.heightCm),
    weightKg: v(input.body.weightKg),
    waistCm: v(input.body.waistCm),
    systolic: v(input.bp.systolic),
    diastolic: v(input.bp.diastolic),
    auditC: audit.every((x) => x !== null) ? audit.reduce<number>((s, x) => s + (x ?? 0), 0) : null,
  };
}

async function sendSummaryNotice(
  db: Db,
  config: AppConfig,
  logger: Logger,
  fetchFn: typeof fetch,
  userId: string,
): Promise<void> {
  if (!whatsappConfigured(config) || !(await currentFlags(db, config)).messaging) return;
  const consent = await one<{ granted: boolean }>(
    db,
    "SELECT granted FROM consent_events WHERE user_id = $1 AND scope = 'whatsapp_notices' ORDER BY created_at DESC LIMIT 1",
    [userId],
  );
  if (!consent?.granted) return;
  const user = await one<{ phone: string | null; preferred_language: 'en' | 'rw' }>(
    db,
    'SELECT phone, preferred_language FROM users WHERE id = $1 AND active AND deleted_at IS NULL',
    [userId],
  );
  const record = (status: 'sent' | 'failed' | 'skipped', errorCode: string | null) =>
    db.query(
      'INSERT INTO message_events (user_id, channel, template, status, error_code) VALUES ($1, $2, $3, $4, $5)',
      [userId, 'whatsapp', config.WHATSAPP_TEMPLATE, status, errorCode],
    );
  if (!user?.phone) {
    await record('skipped', 'no_phone');
    return;
  }
  let res: globalThis.Response;
  try {
    res = await sendWhatsApp(config, fetchFn, user.phone, user.preferred_language);
  } catch {
    await record('failed', 'network');
    logger.warn({ event: 'whatsapp_notice', status: 'failed' }, 'message');
    return;
  }
  await record(res.ok ? 'sent' : 'failed', res.ok ? null : `http_${res.status}`);
  logger.info(
    { event: 'whatsapp_notice', status: res.ok ? 'sent' : 'failed', httpStatus: res.status },
    'message',
  );
}

function sendWhatsApp(config: AppConfig, fetchFn: typeof fetch, phone: string, language: 'en' | 'rw') {
  return fetchFn(
    `https://graph.facebook.com/${config.WHATSAPP_API_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.WHATSAPP_TOKEN ?? ''}` },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone.replace(/^\+/, ''),
        type: 'template',
        template: {
          name: config.WHATSAPP_TEMPLATE,
          language: {
            code:
              language === 'rw' ? config.WHATSAPP_TEMPLATE_LANGUAGE_RW : config.WHATSAPP_TEMPLATE_LANGUAGE_EN,
          },
        },
      }),
    },
  );
}

const requestId = (): RequestHandler => (req, res, next) => {
  req.id = randomBytes(12).toString('hex'); // always server-made, so no client value reaches the logs
  res.setHeader('x-request-id', req.id);
  next();
};

const requestLogger =
  (logger: Logger): RequestHandler =>
  (req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const route = req.route ? `${req.routePrefix ?? ''}${String(req.route.path)}` : '(unmatched)';
      logger.info(
        {
          reqId: req.id,
          method: req.method,
          route,
          status: res.statusCode,
          durationMs: Number((process.hrtime.bigint() - started) / 1_000_000n),
        },
        'request',
      );
    });
    next();
  };

/** Records the mount pattern for the request log, so logs carry route templates, never real path values. */
const mountAt =
  (pattern: string): RequestHandler =>
  (req, _res, next) => {
    req.routePrefix = pattern;
    next();
  };

const uuidParam = (req: Request, name = 'id') => z.uuid().parse(req.params[name]);

function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, req, res, _next) => {
    const send = (
      status: number,
      code: ErrorCode,
      message: string,
      details?: Array<{ path: string; issue: string }>,
    ) => res.status(status).json({ error: details ? { code, message, details } : { code, message } });
    if (error instanceof ZodError) {
      // Paths and issue codes only: Zod messages can quote the received value.
      const details = error.issues.map((i) => ({
        path: i.path.join('.'),
        issue: i.message.length < 40 ? i.message : i.code,
      }));
      send(400, 'VALIDATION_FAILED', 'Some fields are missing or not in the expected format.', details);
      return;
    }
    if (error instanceof AppError) {
      send(error.status, error.code, error.message);
      return;
    }
    if (isUniqueViolation(error)) {
      send(409, 'ALREADY_EXISTS', 'This already exists.');
      return;
    }
    const type = (error as { type?: string }).type;
    if (type === 'entity.parse.failed') {
      send(400, 'VALIDATION_FAILED', 'The request body is not valid JSON.');
      return;
    }
    if (type === 'entity.too.large') {
      send(413, 'VALIDATION_FAILED', 'The request body is too large.');
      return;
    }
    // Log the error class and database code only: driver messages can contain submitted values.
    logger.error(
      {
        reqId: req.id,
        errorName: (error as Error).name ?? 'unknown',
        pgCode: (error as { code?: string }).code,
      },
      'unhandled_error',
    );
    send(500, 'INTERNAL', 'Something went wrong on our side. Please try again.');
  };
}

const DEVELOPMENT_FLAGS: Flags = {
  offlineSync: true,
  guideDeterministic: true,
  guideGenerative: true, // still needs ETHICS_AMENDMENT_REF and a key to take effect
  measurementCoach: true,
  progressTrends: true,
  whatIf: true,
  careNavigator: true,
  careGeolocation: true,
  clinicCard: true,
  sharedDeviceMode: true,
  readAloud: true,
  usabilityEvents: false,
  pilotInsights: true,
  messaging: true, // still needs WhatsApp settings and each participant's opt-in
};
/** The documented pilot profile (docs/FEATURES.md). Changing a pilot default needs the supervisor's agreement. */
const PILOT_FLAGS: Flags = {
  ...DEVELOPMENT_FLAGS,
  guideGenerative: false,
  careGeolocation: false,
  readAloud: false,
  usabilityEvents: false,
  messaging: false, // until the ethics committee knows participants get WhatsApp notices
};
export const FLAG_DEFAULTS: Record<AppConfig['APP_ENV'], Flags> = {
  development: DEVELOPMENT_FLAGS,
  staging: DEVELOPMENT_FLAGS,
  test: DEVELOPMENT_FLAGS,
  pilot: PILOT_FLAGS,
};

async function currentFlags(db: Db | null, config: AppConfig): Promise<Flags> {
  const flags: Flags = { ...FLAG_DEFAULTS[config.APP_ENV] };
  if (db) {
    const stored = await rows<{ key: string; enabled: boolean }>(
      db,
      'SELECT key, enabled FROM feature_flags WHERE environment = $1',
      [config.APP_ENV],
    );
    for (const row of stored)
      if ((FLAG_KEYS as readonly string[]).includes(row.key)) flags[row.key as FlagKey] = row.enabled;
  }
  flags.guideGenerative = flags.guideGenerative && generativeGuideAllowed(config);
  return flags;
}

export interface AppDeps {
  config: AppConfig;
  logger: Logger;
  db: Db | null;
  /** Injected in tests to stand in for Google's token endpoint. */
  fetchFn?: typeof fetch;
}

const ruleset = RULESET_V1;

/** Converts a check-up form into the rules input. Null or absent means skipped, never 0 (FR-05). */
function toAssessmentInput(a: CheckupSubmission['answers'], sex: Sex): AssessmentInput {
  const ans = <T>(v: T | null | undefined): Answer<T> =>
    v === null || v === undefined ? { missing: 'SKIPPED' } : { value: v };
  const declined = (n: number) => Array.from({ length: n }, () => ({ missing: 'MODULE_DECLINED' as const }));
  return {
    sex,
    tobaccoUse: ans(a.tobaccoUse),
    auditC: [ans(a.auditC[0]), ans(a.auditC[1]), ans(a.auditC[2])],
    activity: { moderateMinutes: ans(a.moderateMinutes), vigorousMinutes: ans(a.vigorousMinutes) },
    diet: { servingsPerDay: ans(a.servingsPerDay), addsSaltAtTable: ans(a.addsSaltAtTable) },
    body: { heightCm: ans(a.heightCm), weightKg: ans(a.weightKg), waistCm: ans(a.waistCm) },
    bp: { systolic: ans(a.systolic), diastolic: ans(a.diastolic) },
    // The mental-wellness module is not offered yet: it needs validated Kinyarwanda PHQ-9 and GAD-7 and the
    // item 9 safety screen (Milestone 1). Recorded as declined, never as 0.
    phq9: declined(ruleset.domains.phq9.variant === 'PHQ-8' ? 8 : 9),
    gad7: declined(ruleset.domains.gad7.items),
  };
}

/** Hard range checks from the ruleset (FR-07). Returns per-field issue codes for the form. */
function measurementIssues(a: CheckupSubmission['answers']) {
  const fields: Array<[keyof CheckupSubmission['answers'], MeasurementType]> = [
    ['heightCm', 'height'],
    ['weightKg', 'weight'],
    ['waistCm', 'waist'],
    ['diastolic', 'diastolic'],
    ['moderateMinutes', 'moderateMinutes'],
    ['vigorousMinutes', 'vigorousMinutes'],
    ['servingsPerDay', 'servingsPerDay'],
  ];
  const issues: Array<{ path: string; issue: string }> = [];
  for (const [field, type] of fields) {
    const value = a[field];
    if (typeof value === 'number') {
      const issue = validateMeasurement(type, value, ruleset);
      if (issue) issues.push({ path: `answers.${field}`, issue });
    }
  }
  if (typeof a.systolic === 'number') {
    const issue = validateMeasurement('systolic', a.systolic, ruleset, {
      ...(typeof a.diastolic === 'number' ? { diastolic: a.diastolic } : {}),
    });
    if (issue) issues.push({ path: 'answers.systolic', issue });
  }
  return issues;
}

function identifierColumn(id: Identifier): 'email' | 'phone' {
  return id.kind === 'email' ? 'email' : 'phone';
}

function parseIdentifierOrThrow(raw: string): Identifier {
  const id = parseIdentifier(raw);
  if (!id) throw new AppError(400, 'VALIDATION_FAILED', 'Enter a valid email address or phone number.');
  return id;
}

async function createUser(
  db: Queryable,
  input: {
    role: Role;
    identifier?: Identifier;
    passwordHash: string | null;
    displayName?: string | null;
    language: 'en' | 'rw';
    googleSub?: string | null;
  },
): Promise<UserRow> {
  const user = await one<UserRow>(
    db,
    `INSERT INTO users (role, email, phone, password_hash, display_name, preferred_language, order_assignment, google_sub)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      input.role,
      input.identifier?.kind === 'email' ? input.identifier.value : null,
      input.identifier?.kind === 'phone' ? input.identifier.value : null,
      input.passwordHash,
      input.displayName ?? null,
      input.language,
      input.role === 'participant' ? (randomInt(2) === 0 ? 'AB' : 'BA') : null,
      input.googleSub ?? null,
    ],
  );
  if (!user) throw new Error('insert returned no row');
  if (user.role === 'participant')
    await db.query('INSERT INTO participant_profiles (user_id) VALUES ($1)', [user.id]);
  return user;
}

export function createApp({ config, logger, db, fetchFn = fetch }: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY);

  app.use(requestId());
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          workerSrc: ["'self'"],
          manifestSrc: ["'self'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'self'"],
        },
      },
      strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(requestLogger(logger));

  const needDb = (): Db => {
    if (!db) throw new AppError(503, 'DB_UNAVAILABLE', 'The database is not connected yet.');
    return db;
  };

  /** Signed-in user from the session cookie, with an idle timeout (FR-55). */
  const requireAuth: RequestHandler = async (req, _res, next) => {
    const database = needDb();
    const token = (req.cookies as Record<string, string | undefined>)[SESSION_COOKIE];
    if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in.');
    const row = await one<{ session_id: string; last_seen_at: Date; id: string; role: Role }>(
      database,
      `SELECT s.id AS session_id, s.last_seen_at, u.id, u.role
         FROM user_sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
          AND s.last_seen_at > now() - make_interval(hours => $2)
          AND u.active AND u.deleted_at IS NULL`,
      [sha256(token), config.SESSION_IDLE_HOURS],
    );
    if (!row) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in.');
    if (Date.now() - row.last_seen_at.getTime() > 5 * 60_000) {
      await database.query('UPDATE user_sessions SET last_seen_at = now() WHERE id = $1', [row.session_id]);
    }
    req.user = { id: row.id, role: row.role, sessionId: row.session_id };
    next();
  };

  /** Deny by default: only the listed roles pass (FR-53). */
  const requireRole =
    (...roles: Role[]): RequestHandler =>
    (req, _res, next) => {
      if (!req.user || !roles.includes(req.user.role)) throw forbidden();
      next();
    };

  const me = (req: Request): AuthUser => {
    if (!req.user) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in.');
    return req.user;
  };

  const mount = (prefix: string, router: Router) => app.use(prefix, mountAt(prefix), router);
  const authLimiter = rateLimit({
    windowMs: 60_000,
    limit: config.APP_ENV === 'test' ? 1000 : 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      res
        .status(429)
        .json({ error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a minute.' } });
    },
  });

  const system = Router();
  system.get('/health', async (_req, res) => {
    let database: 'ok' | 'not_configured' | 'unreachable' = 'not_configured';
    if (db) {
      try {
        await db.query('SELECT 1');
        database = 'ok';
      } catch {
        database = 'unreachable';
      }
    }
    res.json({ status: 'ok', version: API_VERSION, database });
  });
  system.get('/flags', async (_req, res) => {
    res.set('cache-control', 'no-cache');
    res.json(await currentFlags(db, config));
  });
  mount('/api/v1', system);

  // ── 8.2 Authentication (sign up, sign in, sign out, Google) ─────────────────────────────────────────────────────
  const auth = Router();
  auth.get('/providers', (_req, res) => {
    res.json({ password: true, google: googleConfigured(config) });
  });

  auth.post('/signup', authLimiter, async (req, res) => {
    const database = needDb();
    const body = SignupRequest.parse(req.body);
    const identifier = parseIdentifierOrThrow(body.identifier);
    const exists = await one(database, `SELECT 1 FROM users WHERE ${identifierColumn(identifier)} = $1`, [
      identifier.value,
    ]);
    if (exists)
      throw new AppError(409, 'ALREADY_EXISTS', 'An account with this email or phone number already exists.');
    const user = await tx(database, async (client) => {
      const created = await createUser(client, {
        role: body.role,
        identifier,
        passwordHash: await hashPassword(body.password),
        displayName: body.displayName ?? null,
        language: body.preferredLanguage,
      });
      if (created.role !== 'participant')
        await audit(client, created, 'auth.signup', { type: 'user', id: created.id });
      return created;
    });
    await startSession(database, config, res, user, 'password');
    res.status(201).json(toMe(user));
  });

  auth.post('/login', authLimiter, async (req, res) => {
    const database = needDb();
    const body = LoginRequest.parse(req.body);
    const identifier = parseIdentifierOrThrow(body.identifier);
    const user = await one<UserRow>(
      database,
      `SELECT * FROM users WHERE ${identifierColumn(identifier)} = $1 AND deleted_at IS NULL`,
      [identifier.value],
    );
    const invalid = new AppError(
      401,
      'INVALID_CREDENTIALS',
      'The email, phone number or password is not right.',
    );
    if (!user) {
      await verifyPassword(null, body.password);
      throw invalid;
    }
    if (user.locked_until && user.locked_until.getTime() > Date.now()) {
      throw new AppError(423, 'LOCKED', 'Too many wrong attempts. Please try again in 15 minutes.');
    }
    if (!(await verifyPassword(user.password_hash, body.password))) {
      await database.query(
        `UPDATE users SET failed_attempts = CASE WHEN failed_attempts + 1 >= $2 THEN 0 ELSE failed_attempts + 1 END,
                          locked_until = CASE WHEN failed_attempts + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END
          WHERE id = $1`,
        [user.id, MAX_FAILED_ATTEMPTS, LOCK_MINUTES],
      );
      throw invalid;
    }
    if (!user.active)
      throw new AppError(403, 'FORBIDDEN', 'This account is turned off. Please contact the research team.');
    await startSession(database, config, res, user, 'password');
    res.json(toMe(user));
  });

  auth.post('/logout', async (req, res) => {
    const token = (req.cookies as Record<string, string | undefined>)[SESSION_COOKIE];
    if (db && token) {
      const session = await one<{ user_id: string; role: Role }>(
        db,
        `UPDATE user_sessions s SET revoked_at = now() FROM users u
          WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND u.id = s.user_id RETURNING s.user_id, u.role`,
        [sha256(token)],
      );
      if (session && session.role !== 'participant') {
        await audit(db, { id: session.user_id, role: session.role }, 'auth.signout');
      }
    }
    res.clearCookie(SESSION_COOKIE, { path: '/api' });
    res.status(204).end();
  });

  auth.get('/google/start', (req, res) => {
    if (!googleConfigured(config))
      throw new AppError(503, 'NOT_CONFIGURED', 'Google sign-in is not set up yet.');
    const query = z
      .object({
        intent: z.enum(['login', 'signup']).default('login'),
        role: Role.default('participant'),
        lang: z.enum(['en', 'rw']).default('en'),
      })
      .parse(req.query);
    const state: OAuthState = {
      state: b64url(randomBytes(16)),
      verifier: b64url(randomBytes(32)),
      nonce: b64url(randomBytes(16)),
      intent: query.intent,
      role: query.role,
      language: query.lang,
      exp: Date.now() + 10 * 60_000,
    };
    res.cookie(OAUTH_COOKIE, sealState(config.SESSION_SECRET, state), {
      httpOnly: true,
      secure: config.PUBLIC_URL.startsWith('https://'),
      sameSite: 'lax', // must survive Google's redirect back to us
      path: '/api/v1/auth/google',
      maxAge: 10 * 60_000,
    });
    const url = new URL(GOOGLE_AUTH_URL);
    url.search = new URLSearchParams({
      client_id: config.GOOGLE_CLIENT_ID ?? '',
      redirect_uri: `${config.PUBLIC_URL}/api/v1/auth/google/callback`,
      response_type: 'code',
      scope: 'openid email',
      state: state.state,
      nonce: state.nonce,
      code_challenge: b64url(createHash('sha256').update(state.verifier).digest()),
      code_challenge_method: 'S256',
      prompt: 'select_account',
    }).toString();
    res.redirect(url.toString());
  });

  auth.get('/google/callback', async (req, res) => {
    const back = (error: string) => res.redirect(`${config.PUBLIC_URL}/login?error=${error}`);
    const cookies = req.cookies as Record<string, string | undefined>;
    const saved = openState(config.SESSION_SECRET, cookies[OAUTH_COOKIE]);
    res.clearCookie(OAUTH_COOKIE, { path: '/api/v1/auth/google' });
    const query = z
      .object({ code: z.string().optional(), state: z.string().optional() })
      .safeParse(req.query);
    if (!db || !googleConfigured(config) || !saved || !query.success || !query.data.code)
      return back('google');
    const a = Buffer.from(saved.state);
    const b = Buffer.from(query.data.state ?? '');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return back('google');

    let claims: z.infer<typeof GoogleClaims> | null = null;
    try {
      const tokenRes = await fetchFn(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: query.data.code,
          client_id: config.GOOGLE_CLIENT_ID ?? '',
          client_secret: config.GOOGLE_CLIENT_SECRET ?? '',
          redirect_uri: `${config.PUBLIC_URL}/api/v1/auth/google/callback`,
          grant_type: 'authorization_code',
          code_verifier: saved.verifier,
        }).toString(),
      });
      const json = z.object({ id_token: z.string() }).safeParse(await tokenRes.json());
      if (tokenRes.ok && json.success)
        claims = readIdToken(json.data.id_token, config.GOOGLE_CLIENT_ID ?? '', saved.nonce);
    } catch {
      logger.warn({ reqId: req.id }, 'google_token_exchange_failed');
    }
    if (!claims) return back('google');

    const email = claims.email.toLowerCase();
    let user = await one<UserRow>(
      db,
      'SELECT * FROM users WHERE (google_sub = $1 OR email = $2) AND deleted_at IS NULL ORDER BY (google_sub = $1) DESC LIMIT 1',
      [claims.sub, email],
    );
    if (user && !user.google_sub) {
      user = await one<UserRow>(
        db,
        'UPDATE users SET google_sub = $2, updated_at = now() WHERE id = $1 RETURNING *',
        [user.id, claims.sub],
      );
    }
    if (!user) {
      if (saved.intent !== 'signup') return back('google_no_account');
      const sub = claims.sub;
      user = await tx(db, async (client) => {
        const created = await createUser(client, {
          role: saved.role,
          identifier: { kind: 'email', value: email },
          passwordHash: null,
          language: saved.language,
          googleSub: sub,
        });
        if (created.role !== 'participant')
          await audit(client, created, 'auth.signup', { type: 'user', id: created.id });
        return created;
      });
    }
    if (!user || !user.active) return back('account_off');
    await startSession(db, config, res, user, 'google');
    res.redirect(`${config.PUBLIC_URL}/app`);
  });
  mount('/api/v1/auth', auth);

  // ── 8.3 My account (every role) ─────────────────────────────────────────────────────────────────────────────────
  const account = Router();
  account.use(requireAuth);

  account.get('/', async (req, res) => {
    const user = await one<UserRow>(needDb(), 'SELECT * FROM users WHERE id = $1', [me(req).id]);
    if (!user) throw notFound();
    res.json(toMe(user));
  });

  account.patch('/', async (req, res) => {
    const database = needDb();
    const body = UpdateMeRequest.parse(req.body);
    const current = await one<UserRow>(database, 'SELECT * FROM users WHERE id = $1', [me(req).id]);
    if (!current) throw notFound();
    const email = body.email === undefined ? current.email : (body.email?.toLowerCase() ?? null);
    const phone =
      body.phone === undefined ? current.phone : body.phone === null ? null : normalisePhone(body.phone);
    if (!email && !phone)
      throw new AppError(400, 'VALIDATION_FAILED', 'Keep at least an email address or a phone number.');
    const updated = await one<UserRow>(
      database,
      `UPDATE users SET display_name = $2, email = $3, phone = $4, preferred_language = $5, updated_at = now()
        WHERE id = $1 RETURNING *`,
      [
        current.id,
        body.displayName === undefined ? current.display_name : body.displayName,
        email,
        phone,
        body.preferredLanguage ?? current.preferred_language,
      ],
    );
    if (!updated) throw notFound();
    res.json(toMe(updated));
  });

  account.post('/password', async (req, res) => {
    const database = needDb();
    const body = ChangePasswordRequest.parse(req.body);
    const user = await one<UserRow>(database, 'SELECT * FROM users WHERE id = $1', [me(req).id]);
    if (!user) throw notFound();
    if (user.password_hash && !(await verifyPassword(user.password_hash, body.currentPassword ?? ''))) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Your current password is not right.');
    }
    await database.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [
      user.id,
      await hashPassword(body.newPassword),
    ]);
    // Sign out every other device.
    await database.query(
      'UPDATE user_sessions SET revoked_at = now() WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL',
      [user.id, me(req).sessionId],
    );
    res.status(204).end();
  });
  mount('/api/v1/me', account);

  // ── 8.4 Participant: profile, check-ups (assessments), deletion requests ───────────────────────────────────────
  const participant = Router();
  participant.use(requireAuth, requireRole('participant'));

  participant.get('/profile', async (req, res) => {
    const row = await one<{ age_band: string | null; sex: Sex; district_band: string | null }>(
      needDb(),
      'SELECT age_band, sex, district_band FROM participant_profiles WHERE user_id = $1',
      [me(req).id],
    );
    res.json({
      ageBand: row?.age_band ?? null,
      sex: row?.sex ?? 'not_stated',
      districtBand: row?.district_band ?? null,
    });
  });

  participant.put('/profile', async (req, res) => {
    const body = ParticipantProfile.parse(req.body);
    await needDb().query(
      `INSERT INTO participant_profiles (user_id, age_band, sex, district_band) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET age_band = $2, sex = $3, district_band = $4, updated_at = now()`,
      [me(req).id, body.ageBand, body.sex, body.districtBand],
    );
    res.json(body);
  });

  type AssessmentRow = {
    id: string;
    request_hash: string;
    ruleset_version: string;
    results: unknown;
    plan: unknown;
    safety: unknown;
    input: AssessmentInput;
    created_at: Date;
  };
  const toAssessment = (r: AssessmentRow) => ({
    id: r.id,
    createdAt: r.created_at.toISOString(),
    rulesetVersion: r.ruleset_version,
    results: r.results,
    plan: r.plan,
    safety: r.safety,
    values: valuesOf(r.input),
  });

  participant.post('/assessments', async (req, res) => {
    const database = needDb();
    const key = z.uuid().safeParse(req.get('idempotency-key'));
    if (!key.success)
      throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'An Idempotency-Key header (UUID) is required.');
    const body = CheckupSubmission.parse(req.body);
    const issues = measurementIssues(body.answers);
    if (issues.length > 0) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Please check the highlighted readings.',
          details: issues,
        },
      });
      return;
    }
    const userId = me(req).id;
    const requestHash = sha256(normalise(body));
    const existing = await one<AssessmentRow>(
      database,
      'SELECT * FROM assessments WHERE user_id = $1 AND idempotency_key = $2',
      [userId, key.data],
    );
    if (existing) {
      if (existing.request_hash !== requestHash) {
        throw new AppError(
          409,
          'IDEMPOTENCY_MISMATCH',
          'This submission key was already used for different answers.',
        );
      }
      res.json(toAssessment(existing));
      return;
    }
    const profile = await one<{ sex: Sex }>(
      database,
      'SELECT sex FROM participant_profiles WHERE user_id = $1',
      [userId],
    );
    const input = toAssessmentInput(body.answers, profile?.sex ?? 'not_stated');
    const results = scoreAssessment(input, ruleset);
    const plan = planNextSteps(results, ruleset);
    const safety = assessSafety(input, results, ruleset);
    const inserted = await one<AssessmentRow>(
      database,
      `INSERT INTO assessments (user_id, idempotency_key, request_hash, ruleset_version, language, input, results, plan,
                                safety, started_at, submitted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
       ON CONFLICT (user_id, idempotency_key) DO NOTHING RETURNING *`,
      [
        userId,
        key.data,
        requestHash,
        ruleset.version,
        body.language,
        input,
        results,
        plan,
        safety,
        body.startedAt,
      ],
    );
    const row =
      inserted ??
      (await one<AssessmentRow>(
        database,
        'SELECT * FROM assessments WHERE user_id = $1 AND idempotency_key = $2',
        [userId, key.data],
      ));
    if (!row) throw new Error('assessment not stored');
    res.status(inserted ? 201 : 200).json(toAssessment(row));
    if (inserted) {
      void sendSummaryNotice(database, config, logger, fetchFn, userId).catch(() =>
        logger.warn({ reqId: req.id, event: 'notice_error' }, 'message'),
      );
    }
  });

  participant.get('/assessments', async (req, res) => {
    const list = await rows<AssessmentRow>(
      needDb(),
      'SELECT * FROM assessments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100',
      [me(req).id],
    );
    res.json(list.map(toAssessment));
  });

  participant.get('/assessments/:id', async (req, res) => {
    const row = await one<AssessmentRow>(
      needDb(),
      'SELECT * FROM assessments WHERE id = $1 AND user_id = $2',
      [uuidParam(req), me(req).id],
    );
    if (!row) throw notFound();
    res.json(toAssessment(row));
  });

  participant.delete('/assessments/:id', async (req, res) => {
    const result = await needDb().query('DELETE FROM assessments WHERE id = $1 AND user_id = $2', [
      uuidParam(req),
      me(req).id,
    ]);
    if (result.rowCount === 0) throw notFound();
    res.status(204).end();
  });

  participant.post('/deletion-requests', async (req, res) => {
    const database = needDb();
    const open = await one<{ id: string; requested_at: Date }>(
      database,
      "SELECT id, requested_at FROM deletion_requests WHERE user_id = $1 AND status = 'requested'",
      [me(req).id],
    );
    const row =
      open ??
      (await one<{ id: string; requested_at: Date }>(
        database,
        'INSERT INTO deletion_requests (user_id) VALUES ($1) RETURNING id, requested_at',
        [me(req).id],
      ));
    res
      .status(open ? 200 : 201)
      .json({ id: row?.id, status: 'requested', requestedAt: row?.requested_at.toISOString() });
  });

  participant.get('/deletion-requests/current', async (req, res) => {
    const row = await one<{ id: string; status: string; requested_at: Date; completed_at: Date | null }>(
      needDb(),
      'SELECT id, status, requested_at, completed_at FROM deletion_requests WHERE user_id = $1 ORDER BY requested_at DESC LIMIT 1',
      [me(req).id],
    );
    res.json(
      row
        ? {
            id: row.id,
            status: row.status,
            requestedAt: row.requested_at.toISOString(),
            completedAt: row.completed_at?.toISOString() ?? null,
          }
        : null,
    );
  });
  mount('/api/v1/participant', participant);

  // ── 8.5 Facilitator: participants, sessions and task results, safety events ────────────────────────────────────
  const facilitator = Router();
  facilitator.use(requireAuth);

  facilitator.get('/participants', requireRole('facilitator', 'researcher_admin'), async (_req, res) => {
    const list = await rows<{
      id: string;
      email: string | null;
      phone: string | null;
      display_name: string | null;
      order_assignment: string | null;
      created_at: Date;
      assessments: number;
    }>(
      needDb(),
      `SELECT u.id, u.email, u.phone, u.display_name, u.order_assignment, u.created_at,
              (SELECT count(*)::int FROM assessments a WHERE a.user_id = u.id) AS assessments
         FROM users u WHERE u.role = 'participant' AND u.deleted_at IS NULL ORDER BY u.created_at DESC LIMIT 500`,
    );
    // Masked identifiers only: facilitators never see a participant's full email or phone number.
    res.json(
      list.map((p) => ({
        id: p.id,
        label: maskIdentifier(p.email, p.phone),
        displayName: p.display_name,
        orderAssignment: p.order_assignment,
        createdAt: p.created_at.toISOString(),
        assessments: p.assessments,
      })),
    );
  });

  type SessionRow = {
    id: string;
    participant_id: string;
    email: string | null;
    phone: string | null;
    order_assignment: string | null;
    device_label: string | null;
    started_at: Date;
    ended_at: Date | null;
    tasks: Array<{ taskCode: string; outcome: string; durationSeconds: number }> | null;
  };
  const SESSION_SELECT = `
    SELECT s.id, s.participant_id, u.email, u.phone, u.order_assignment, s.device_label, s.started_at, s.ended_at,
           (SELECT json_agg(json_build_object('taskCode', t.task_code, 'outcome', t.outcome, 'durationSeconds', t.duration_seconds)
                            ORDER BY t.recorded_at)
              FROM task_results t WHERE t.session_id = s.id) AS tasks
      FROM facilitator_sessions s JOIN users u ON u.id = s.participant_id`;
  const toSession = (s: SessionRow) => ({
    id: s.id,
    participantId: s.participant_id,
    participantLabel: maskIdentifier(s.email, s.phone),
    orderAssignment: s.order_assignment,
    deviceLabel: s.device_label,
    startedAt: s.started_at.toISOString(),
    endedAt: s.ended_at?.toISOString() ?? null,
    tasks: s.tasks ?? [],
  });
  const ownSession = async (req: Request) => {
    const s = await one<SessionRow>(needDb(), `${SESSION_SELECT} WHERE s.id = $1 AND s.facilitator_id = $2`, [
      uuidParam(req),
      me(req).id,
    ]);
    if (!s) throw notFound();
    return s;
  };

  facilitator.get('/sessions', requireRole('facilitator'), async (req, res) => {
    const list = await rows<SessionRow>(
      needDb(),
      `${SESSION_SELECT} WHERE s.facilitator_id = $1 ORDER BY s.started_at DESC LIMIT 200`,
      [me(req).id],
    );
    res.json(list.map(toSession));
  });

  facilitator.post('/sessions', requireRole('facilitator'), async (req, res) => {
    const database = needDb();
    const body = SessionCreateRequest.parse(req.body);
    const p = await one(
      database,
      "SELECT 1 FROM users WHERE id = $1 AND role = 'participant' AND deleted_at IS NULL",
      [body.participantId],
    );
    if (!p) throw notFound();
    const created = await one<{ id: string }>(
      database,
      'INSERT INTO facilitator_sessions (participant_id, facilitator_id, device_label) VALUES ($1, $2, $3) RETURNING id',
      [body.participantId, me(req).id, body.deviceLabel || null],
    );
    if (!created) throw new Error('session not created');
    await audit(database, me(req), 'session.start', { type: 'facilitator_session', id: created.id });
    const s = await one<SessionRow>(database, `${SESSION_SELECT} WHERE s.id = $1`, [created.id]);
    if (!s) throw notFound();
    res.status(201).json(toSession(s));
  });

  facilitator.get('/sessions/:id', requireRole('facilitator'), async (req, res) => {
    res.json(toSession(await ownSession(req)));
  });

  facilitator.put('/sessions/:id/tasks/:taskCode', requireRole('facilitator'), async (req, res) => {
    const session = await ownSession(req);
    const taskCode = z.enum(TASK_CODES).parse(req.params['taskCode']);
    const body = TaskResultRequest.parse(req.body);
    await needDb().query(
      `INSERT INTO task_results (session_id, task_code, outcome, duration_seconds) VALUES ($1, $2, $3, $4)
       ON CONFLICT (session_id, task_code) DO UPDATE SET outcome = $3, duration_seconds = $4, recorded_at = now()`,
      [session.id, taskCode, body.outcome, body.durationSeconds],
    );
    res.json(toSession(await ownSession(req)));
  });

  facilitator.post('/sessions/:id/end', requireRole('facilitator'), async (req, res) => {
    const session = await ownSession(req);
    await needDb().query(
      'UPDATE facilitator_sessions SET ended_at = coalesce(ended_at, now()) WHERE id = $1',
      [session.id],
    );
    await audit(needDb(), me(req), 'session.end', { type: 'facilitator_session', id: session.id });
    res.json(toSession(await ownSession(req)));
  });

  facilitator.delete('/sessions/:id', requireRole('facilitator'), async (req, res) => {
    const session = await ownSession(req);
    await needDb().query('DELETE FROM facilitator_sessions WHERE id = $1', [session.id]);
    await audit(needDb(), me(req), 'session.delete', { type: 'facilitator_session', id: session.id });
    res.status(204).end();
  });

  facilitator.get('/safety-events', requireRole('facilitator', 'researcher_admin'), async (_req, res) => {
    const list = await rows<{
      id: string;
      tier: number;
      trigger_type: string;
      actions: string[];
      occurred_at: Date;
      recorded_by_role: string;
      supervisor_informed_at: Date | null;
      email: string | null;
      phone: string | null;
    }>(
      needDb(),
      `SELECT e.id, e.tier, e.trigger_type, e.actions, e.occurred_at, e.recorded_by_role, e.supervisor_informed_at,
              u.email, u.phone
         FROM safety_events e LEFT JOIN users u ON u.id = e.participant_id
        ORDER BY e.occurred_at DESC LIMIT 200`,
    );
    res.json(
      list.map((e) => ({
        id: e.id,
        tier: e.tier,
        triggerType: e.trigger_type,
        actions: e.actions,
        occurredAt: e.occurred_at.toISOString(),
        recordedByRole: e.recorded_by_role,
        supervisorInformedAt: e.supervisor_informed_at?.toISOString() ?? null,
        participantLabel: maskIdentifier(e.email, e.phone),
      })),
    );
  });

  facilitator.post('/safety-events', requireRole('facilitator'), async (req, res) => {
    const database = needDb();
    const body = FacilitatorSafetyEventRequest.parse(req.body);
    const p = await one(database, "SELECT 1 FROM users WHERE id = $1 AND role = 'participant'", [
      body.participantId,
    ]);
    if (!p) throw notFound();
    const row = await one<{ id: string }>(
      database,
      `INSERT INTO safety_events (participant_id, tier, trigger_type, actions, occurred_at, recorded_by, recorded_by_role,
                                  supervisor_informed_at)
       VALUES ($1, $2, $3, $4, now(), $5, 'facilitator', $6) RETURNING id`,
      [
        body.participantId,
        body.tier,
        body.triggerType,
        [...new Set(body.actions)],
        me(req).id,
        body.supervisorInformedAt ?? null,
      ],
    );
    if (!row) throw new Error('safety event not stored');
    await audit(
      database,
      me(req),
      'safety_event.record',
      { type: 'safety_event', id: row.id },
      { tier: body.tier },
    );
    res.status(201).json({ id: row.id });
  });
  mount('/api/v1/facilitator', facilitator);

  // ── 8.6 Researcher-admin: users, deletion requests, audit log, flags ───────────────────────────────────────────
  const admin = Router();
  admin.use(requireAuth, requireRole('researcher_admin'));

  type AdminUserRow = UserRow & { assessments: number };
  const toAdminUser = (u: AdminUserRow) => ({
    ...toMe(u),
    active: u.active,
    lastSignInAt: u.last_sign_in_at?.toISOString() ?? null,
    assessments: u.assessments,
  });

  admin.get('/users', async (req, res) => {
    const q = z
      .object({ role: Role.optional(), search: z.string().trim().max(80).optional() })
      .parse(req.query);
    const list = await rows<AdminUserRow>(
      needDb(),
      `SELECT u.*, (SELECT count(*)::int FROM assessments a WHERE a.user_id = u.id) AS assessments
         FROM users u
        WHERE u.deleted_at IS NULL
          AND ($1::text IS NULL OR u.role = $1)
          AND ($2::text IS NULL OR u.email ILIKE '%' || $2 || '%' OR u.phone ILIKE '%' || $2 || '%'
               OR u.display_name ILIKE '%' || $2 || '%')
        ORDER BY u.created_at DESC LIMIT 500`,
      [q.role ?? null, q.search || null],
    );
    res.json(list.map(toAdminUser));
  });

  admin.post('/users', async (req, res) => {
    const database = needDb();
    const body = AdminCreateUserRequest.parse(req.body);
    const identifier = parseIdentifierOrThrow(body.identifier);
    const user = await tx(database, async (client) => {
      const created = await createUser(client, {
        role: body.role,
        identifier,
        passwordHash: await hashPassword(body.password),
        displayName: body.displayName ?? null,
        language: 'en',
      });
      await audit(client, me(req), 'user.create', { type: 'user', id: created.id }, { role: created.role });
      return created;
    });
    res.status(201).json(toAdminUser({ ...user, assessments: 0 }));
  });

  /** The last active researcher-admin can never be removed, so the console always has an owner (FR-54). */
  const assertNotLastAdmin = async (db2: Queryable, userId: string) => {
    const row = await one<{ others: number }>(
      db2,
      "SELECT count(*)::int AS others FROM users WHERE role = 'researcher_admin' AND active AND deleted_at IS NULL AND id <> $1",
      [userId],
    );
    if ((row?.others ?? 0) === 0)
      throw new AppError(409, 'CONFLICT', 'At least one active researcher-admin must remain.');
  };

  admin.patch('/users/:id', async (req, res) => {
    const database = needDb();
    const id = uuidParam(req);
    const body = AdminUpdateUserRequest.parse(req.body);
    const target = await one<UserRow>(database, 'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL', [
      id,
    ]);
    if (!target) throw notFound();
    const losingAdmin =
      target.role === 'researcher_admin' &&
      ((body.role && body.role !== 'researcher_admin') || body.active === false);
    if (losingAdmin) await assertNotLastAdmin(database, id);
    const updated = await one<UserRow>(
      database,
      `UPDATE users SET role = $2, active = $3, display_name = $4, updated_at = now() WHERE id = $1 RETURNING *`,
      [
        id,
        body.role ?? target.role,
        body.active ?? target.active,
        body.displayName === undefined ? target.display_name : body.displayName,
      ],
    );
    if (!updated) throw notFound();
    if (updated.role === 'participant' && target.role !== 'participant') {
      await database.query('INSERT INTO participant_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [
        id,
      ]);
    }
    if (body.active === false || (body.role && body.role !== target.role)) {
      await database.query(
        'UPDATE user_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
        [id],
      );
    }
    await audit(
      database,
      me(req),
      'user.update',
      { type: 'user', id },
      {
        role: updated.role,
        active: updated.active,
      },
    );
    const count = await one<{ n: number }>(
      database,
      'SELECT count(*)::int AS n FROM assessments WHERE user_id = $1',
      [id],
    );
    res.json(toAdminUser({ ...updated, assessments: count?.n ?? 0 }));
  });

  admin.delete('/users/:id', async (req, res) => {
    const database = needDb();
    const id = uuidParam(req);
    if (id === me(req).id) throw new AppError(409, 'CONFLICT', 'You cannot delete your own account here.');
    const target = await one<UserRow>(database, 'SELECT * FROM users WHERE id = $1', [id]);
    if (!target) throw notFound();
    if (target.role === 'researcher_admin') await assertNotLastAdmin(database, id);
    await tx(database, async (client) => {
      await client.query('DELETE FROM users WHERE id = $1', [id]);
      await audit(client, me(req), 'user.delete', { type: 'user', id }, { role: target.role });
    });
    res.status(204).end();
  });

  admin.get('/deletion-requests', async (_req, res) => {
    const list = await rows<{
      id: string;
      status: string;
      requested_at: Date;
      completed_at: Date | null;
      user_id: string | null;
      email: string | null;
      phone: string | null;
    }>(
      needDb(),
      `SELECT d.id, d.status, d.requested_at, d.completed_at, d.user_id, u.email, u.phone
         FROM deletion_requests d LEFT JOIN users u ON u.id = d.user_id
        ORDER BY (d.status = 'requested') DESC, d.requested_at DESC LIMIT 500`,
    );
    res.json(
      list.map((d) => ({
        id: d.id,
        status: d.status,
        requestedAt: d.requested_at.toISOString(),
        completedAt: d.completed_at?.toISOString() ?? null,
        // Due within 14 days of the request (FR-18).
        dueAt: new Date(d.requested_at.getTime() + 14 * 86_400_000).toISOString(),
        participantLabel: maskIdentifier(d.email, d.phone),
      })),
    );
  });

  /** Removes the participant's application data and identifiers, keeping a stub and the request record (FR-18). */
  admin.post('/deletion-requests/:id/complete', async (req, res) => {
    const database = needDb();
    const id = uuidParam(req);
    await tx(database, async (client) => {
      const request = await one<{ user_id: string | null; status: string }>(
        client,
        'SELECT user_id, status FROM deletion_requests WHERE id = $1 FOR UPDATE',
        [id],
      );
      if (!request) throw notFound();
      if (request.status === 'completed')
        throw new AppError(409, 'CONFLICT', 'This request is already completed.');
      if (request.user_id) {
        const uid = request.user_id;
        for (const sql of [
          'DELETE FROM assessments WHERE user_id = $1',
          'DELETE FROM participant_profiles WHERE user_id = $1',
          'DELETE FROM feedback_responses WHERE user_id = $1',
          'DELETE FROM facilitator_sessions WHERE participant_id = $1',
          'DELETE FROM user_sessions WHERE user_id = $1',
          'DELETE FROM message_events WHERE user_id = $1',
        ]) {
          await client.query(sql, [uid]);
        }
        await client.query(
          `UPDATE users SET email = NULL, phone = NULL, password_hash = NULL, google_sub = NULL, display_name = NULL,
                            active = false, deleted_at = now(), updated_at = now() WHERE id = $1`,
          [uid],
        );
      }
      await client.query(
        "UPDATE deletion_requests SET status = 'completed', completed_at = now(), completed_by = $2 WHERE id = $1",
        [id, me(req).id],
      );
      await audit(client, me(req), 'deletion.complete', { type: 'deletion_request', id });
    });
    res.status(204).end();
  });

  admin.get('/audit-log', async (req, res) => {
    const { limit } = z
      .object({ limit: z.coerce.number().int().min(1).max(500).default(200) })
      .parse(req.query);
    const list = await rows<{
      id: string;
      actor_role: string;
      action: string;
      target_type: string | null;
      target_id: string | null;
      metadata: unknown;
      created_at: Date;
      actor: string | null;
    }>(
      needDb(),
      `SELECT a.id::text, a.actor_role, a.action, a.target_type, a.target_id, a.metadata, a.created_at,
              coalesce(u.display_name, u.email, u.phone) AS actor
         FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
        ORDER BY a.created_at DESC LIMIT $1`,
      [limit],
    );
    res.json(
      list.map((a) => ({
        id: a.id,
        actor: a.actor,
        actorRole: a.actor_role,
        action: a.action,
        targetType: a.target_type,
        targetId: a.target_id,
        metadata: a.metadata,
        createdAt: a.created_at.toISOString(),
      })),
    );
  });

  admin.get('/flags', async (_req, res) => {
    res.json(await currentFlags(needDb(), config));
  });

  admin.patch('/flags/:key', async (req, res) => {
    const database = needDb();
    const key = FlagKey.parse(req.params['key']);
    const { enabled } = FlagUpdateRequest.parse(req.body);
    if (key === 'guideGenerative' && enabled && !generativeGuideAllowed(config)) {
      throw new AppError(
        409,
        'FLAG_GUARD',
        'The generative guide cannot be turned on without an approved ethics amendment reference and a provider key.',
      );
    }
    if (key === 'messaging' && enabled && config.APP_ENV === 'pilot' && !config.MESSAGING_APPROVAL_REF) {
      throw new AppError(
        409,
        'FLAG_GUARD',
        'Phone notices cannot be turned on in the pilot without an ethics approval reference.',
      );
    }
    await database.query(
      `INSERT INTO feature_flags (key, environment, enabled, updated_by) VALUES ($1, $2, $3, $4)
       ON CONFLICT (key, environment) DO UPDATE SET enabled = $3, updated_by = $4, updated_at = now()`,
      [key, config.APP_ENV, enabled, me(req).id],
    );
    await audit(database, me(req), 'flag.update', { type: 'flag', id: key }, { enabled });
    res.json(await currentFlags(database, config));
  });
  mount('/api/v1/admin', admin);

  // ── 8.7 Content versions with two-person approval (FR-20, FR-46) ────────────────────────────────────────────────
  const content = Router();
  content.use(requireAuth, requireRole('researcher_admin', 'reviewer'));

  type ContentRow = {
    id: string;
    type: string;
    key: string;
    version: string;
    language: string;
    body: unknown;
    status: 'draft' | 'published' | 'retired';
    created_by: string | null;
    created_at: Date;
    updated_at: Date;
    published_at: Date | null;
    approvals: Array<{
      approverId: string;
      approver: string | null;
      decision: string;
      notes: string | null;
    }> | null;
  };
  const CONTENT_SELECT = `
    SELECT c.*,
           (SELECT json_agg(json_build_object('approverId', a.approver_id, 'decision', a.decision, 'notes', a.notes,
                                              'approver', coalesce(u.display_name, u.email, u.phone)) ORDER BY a.created_at)
              FROM content_approvals a LEFT JOIN users u ON u.id = a.approver_id
             WHERE a.content_version_id = c.id) AS approvals
      FROM content_versions c`;
  const toContent = (c: ContentRow, viewerId: string) => {
    const approvals = c.approvals ?? [];
    return {
      id: c.id,
      type: c.type,
      key: c.key,
      version: c.version,
      language: c.language,
      body: c.body,
      status: c.status,
      createdAt: c.created_at.toISOString(),
      updatedAt: c.updated_at.toISOString(),
      publishedAt: c.published_at?.toISOString() ?? null,
      createdByMe: c.created_by === viewerId,
      approvals,
      approvedCount: approvals.filter((a) => a.decision === 'approved').length,
      myDecision: approvals.find((a) => a.approverId === viewerId)?.decision ?? null,
    };
  };
  const loadContent = async (id: string) => {
    const c = await one<ContentRow>(needDb(), `${CONTENT_SELECT} WHERE c.id = $1`, [id]);
    if (!c) throw notFound();
    return c;
  };
  const draftOnly = (c: ContentRow) => {
    if (c.status !== 'draft')
      throw new AppError(409, 'CONFLICT', 'Published versions cannot be changed. Create a new version.');
  };

  content.get('/', async (req, res) => {
    const q = z.object({ status: z.enum(['draft', 'published', 'retired']).optional() }).parse(req.query);
    const list = await rows<ContentRow>(
      needDb(),
      `${CONTENT_SELECT} WHERE ($1::text IS NULL OR c.status = $1) ORDER BY c.updated_at DESC LIMIT 300`,
      [q.status ?? null],
    );
    res.json(list.map((c) => toContent(c, me(req).id)));
  });

  content.get('/:id', async (req, res) => {
    res.json(toContent(await loadContent(uuidParam(req)), me(req).id));
  });

  content.post('/', requireRole('researcher_admin'), async (req, res) => {
    const database = needDb();
    const body = ContentCreateRequest.parse(req.body);
    const row = await one<{ id: string }>(
      database,
      `INSERT INTO content_versions (type, key, version, language, body, body_hash, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [body.type, body.key, body.version, body.language, body.body, sha256(normalise(body.body)), me(req).id],
    );
    if (!row) throw new Error('content not stored');
    await audit(database, me(req), 'content.create', { type: 'content_version', id: row.id });
    res.status(201).json(toContent(await loadContent(row.id), me(req).id));
  });

  content.patch('/:id', requireRole('researcher_admin'), async (req, res) => {
    const database = needDb();
    const id = uuidParam(req);
    const current = await loadContent(id);
    draftOnly(current);
    const body = ContentUpdateRequest.parse(req.body);
    const newBody = body.body ?? current.body;
    await tx(database, async (client) => {
      await client.query(
        'UPDATE content_versions SET version = $2, body = $3, body_hash = $4, updated_at = now() WHERE id = $1',
        [id, body.version ?? current.version, newBody, sha256(normalise(newBody))],
      );
      // A changed draft needs fresh approvals.
      await client.query('DELETE FROM content_approvals WHERE content_version_id = $1', [id]);
      await audit(client, me(req), 'content.update', { type: 'content_version', id });
    });
    res.json(toContent(await loadContent(id), me(req).id));
  });

  content.delete('/:id', requireRole('researcher_admin'), async (req, res) => {
    const database = needDb();
    const id = uuidParam(req);
    draftOnly(await loadContent(id));
    await database.query('DELETE FROM content_versions WHERE id = $1', [id]);
    await audit(database, me(req), 'content.delete', { type: 'content_version', id });
    res.status(204).end();
  });

  content.post('/:id/approvals', async (req, res) => {
    const database = needDb();
    const id = uuidParam(req);
    const current = await loadContent(id);
    draftOnly(current);
    if (current.created_by === me(req).id) {
      throw new AppError(409, 'CONFLICT', 'The person who wrote a version cannot approve it.');
    }
    const body = ApprovalRequest.parse(req.body);
    await database.query(
      `INSERT INTO content_approvals (content_version_id, approver_id, approver_role, decision, notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (content_version_id, approver_id) DO UPDATE SET decision = $4, notes = $5, created_at = now()`,
      [id, me(req).id, me(req).role, body.decision, body.notes ?? null],
    );
    await audit(
      database,
      me(req),
      'content.approval',
      { type: 'content_version', id },
      { decision: body.decision },
    );
    res.json(toContent(await loadContent(id), me(req).id));
  });

  content.post('/:id/publish', requireRole('researcher_admin'), async (req, res) => {
    const database = needDb();
    const id = uuidParam(req);
    const current = await loadContent(id);
    draftOnly(current);
    const approvals = current.approvals ?? [];
    const approvers = new Set(approvals.filter((a) => a.decision === 'approved').map((a) => a.approverId));
    if (approvers.size < 2 || approvals.some((a) => a.decision === 'changes_requested')) {
      throw new AppError(
        409,
        'CONFLICT',
        'Publishing needs approvals from two different people and no open change requests.',
      );
    }
    await tx(database, async (client) => {
      await client.query(
        `UPDATE content_versions SET status = 'retired', updated_at = now()
          WHERE type = $1 AND key = $2 AND language = $3 AND status = 'published'`,
        [current.type, current.key, current.language],
      );
      await client.query(
        "UPDATE content_versions SET status = 'published', published_at = now(), updated_at = now() WHERE id = $1",
        [id],
      );
      await audit(client, me(req), 'content.publish', { type: 'content_version', id });
    });
    res.json(toContent(await loadContent(id), me(req).id));
  });
  mount('/api/v1/content', content);

  // ── 8.8 Dashboard metrics, different for each role ──────────────────────────────────────────────────────────────
  const dashboard = Router();
  dashboard.use(requireAuth);
  dashboard.get('/', async (req, res) => {
    const database = needDb();
    const user = me(req);
    const series = async (sql: string, params: unknown[] = []) => {
      const found = new Map(
        (await rows<{ day: string; n: number }>(database, sql, params)).map((r) => [r.day, r.n]),
      );
      return Array.from({ length: 14 }, (_, i) => {
        const day = new Date(Date.now() - (13 - i) * 86_400_000).toISOString().slice(0, 10);
        return { day, count: found.get(day) ?? 0 };
      });
    };
    const count = async (sql: string, params: unknown[] = []) =>
      (await one<{ n: number }>(database, sql, params))?.n ?? 0;

    if (user.role === 'participant') {
      const latest = await one<AssessmentRow>(
        database,
        'SELECT * FROM assessments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
        [user.id],
      );
      const deletion = await one<{ status: string }>(
        database,
        "SELECT status FROM deletion_requests WHERE user_id = $1 AND status = 'requested' LIMIT 1",
        [user.id],
      );
      res.json({
        role: user.role,
        cards: [
          {
            key: 'checkups_total',
            value: await count('SELECT count(*)::int AS n FROM assessments WHERE user_id = $1', [user.id]),
          },
          {
            key: 'areas_to_focus',
            value: latest ? ((latest.plan as { focus?: unknown[] }).focus?.length ?? 0) : 0,
          },
          {
            key: 'areas_ok',
            value: latest
              ? ((latest.results as { ncd?: Array<{ severity: string }> }).ncd ?? []).filter(
                  (r) => r.severity === 'ok',
                ).length
              : 0,
          },
        ],
        latest: latest ? toAssessment(latest) : null,
        deletionRequested: Boolean(deletion),
      });
      return;
    }

    if (user.role === 'facilitator') {
      const recent = await rows<SessionRow>(
        database,
        `${SESSION_SELECT} WHERE s.facilitator_id = $1 ORDER BY s.started_at DESC LIMIT 5`,
        [user.id],
      );
      res.json({
        role: user.role,
        cards: [
          {
            key: 'participants_total',
            value: await count(
              "SELECT count(*)::int AS n FROM users WHERE role = 'participant' AND deleted_at IS NULL",
            ),
          },
          {
            key: 'sessions_today',
            value: await count(
              'SELECT count(*)::int AS n FROM facilitator_sessions WHERE facilitator_id = $1 AND started_at::date = current_date',
              [user.id],
            ),
          },
          {
            key: 'sessions_open',
            value: await count(
              'SELECT count(*)::int AS n FROM facilitator_sessions WHERE facilitator_id = $1 AND ended_at IS NULL',
              [user.id],
            ),
          },
          {
            key: 'safety_events_7d',
            value: await count(
              "SELECT count(*)::int AS n FROM safety_events WHERE occurred_at > now() - interval '7 days'",
            ),
          },
        ],
        recentSessions: recent.map(toSession),
        sessionsByDay: await series(
          `SELECT to_char(started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, count(*)::int AS n
             FROM facilitator_sessions WHERE facilitator_id = $1 AND started_at > now() - interval '14 days' GROUP BY 1`,
          [user.id],
        ),
      });
      return;
    }

    if (user.role === 'researcher_admin') {
      const byRole = await rows<{ role: string; n: number }>(
        database,
        'SELECT role, count(*)::int AS n FROM users WHERE deleted_at IS NULL GROUP BY role ORDER BY role',
      );
      const safety = await rows<{ tier: number; n: number }>(
        database,
        "SELECT tier, count(*)::int AS n FROM safety_events WHERE occurred_at > now() - interval '30 days' GROUP BY tier ORDER BY tier",
      );
      res.json({
        role: user.role,
        cards: [
          {
            key: 'users_total',
            value: await count('SELECT count(*)::int AS n FROM users WHERE deleted_at IS NULL'),
          },
          { key: 'checkups_total', value: await count('SELECT count(*)::int AS n FROM assessments') },
          {
            key: 'checkups_7d',
            value: await count(
              "SELECT count(*)::int AS n FROM assessments WHERE created_at > now() - interval '7 days'",
            ),
          },
          {
            key: 'deletions_pending',
            value: await count("SELECT count(*)::int AS n FROM deletion_requests WHERE status = 'requested'"),
          },
          {
            key: 'content_drafts',
            value: await count("SELECT count(*)::int AS n FROM content_versions WHERE status = 'draft'"),
          },
          {
            key: 'content_published',
            value: await count("SELECT count(*)::int AS n FROM content_versions WHERE status = 'published'"),
          },
        ],
        usersByRole: byRole.map((r) => ({ role: r.role, count: r.n })),
        safetyByTier: safety.map((r) => ({ tier: r.tier, count: r.n })),
        checkupsByDay: await series(
          `SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, count(*)::int AS n
             FROM assessments WHERE created_at > now() - interval '14 days' GROUP BY 1`,
        ),
        signupsByDay: await series(
          `SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, count(*)::int AS n
             FROM users WHERE created_at > now() - interval '14 days' AND deleted_at IS NULL GROUP BY 1`,
        ),
      });
      return;
    }

    // Reviewer
    const waiting = await rows<ContentRow>(
      database,
      `${CONTENT_SELECT} WHERE c.status = 'draft' AND (c.created_by IS NULL OR c.created_by <> $1)
          AND NOT EXISTS (SELECT 1 FROM content_approvals a WHERE a.content_version_id = c.id AND a.approver_id = $1)
        ORDER BY c.updated_at DESC LIMIT 5`,
      [user.id],
    );
    res.json({
      role: user.role,
      cards: [
        {
          key: 'reviews_waiting',
          value: await count(
            `SELECT count(*)::int AS n FROM content_versions c WHERE c.status = 'draft'
               AND (c.created_by IS NULL OR c.created_by <> $1)
               AND NOT EXISTS (SELECT 1 FROM content_approvals a WHERE a.content_version_id = c.id AND a.approver_id = $1)`,
            [user.id],
          ),
        },
        {
          key: 'reviews_done',
          value: await count('SELECT count(*)::int AS n FROM content_approvals WHERE approver_id = $1', [
            user.id,
          ]),
        },
        {
          key: 'content_published',
          value: await count("SELECT count(*)::int AS n FROM content_versions WHERE status = 'published'"),
        },
      ],
      waiting: waiting.map((c) => toContent(c, user.id)),
    });
  });
  mount('/api/v1/dashboard', dashboard);

  // ── 8.9 Rinda Guide: question chips answered from approved templates, optionally reworded by Gemini ──────────────
  const guide = Router();
  guide.use(requireAuth, requireRole('participant'));
  const generatedToday = new Map<string, { day: string; count: number }>();
  const GUIDE_DAILY_LIMIT = 20;

  guide.post('/explain', async (req, res) => {
    const database = needDb();
    const started = Date.now();
    const body = GuideExplainRequest.parse(req.body);
    const row = await one<{ results: AssessmentResult; plan: Plan; safety: SafetyAssessment }>(
      database,
      'SELECT results, plan, safety FROM assessments WHERE id = $1 AND user_id = $2',
      [body.assessmentId, me(req).id],
    );
    if (!row) throw notFound();
    const chipId = (GUIDE_CHIPS as readonly string[]).includes(body.chipId) ? body.chipId : 'overview';
    const content = BUNDLED_CONTENT[body.language];
    const lookup = (id: string) => content.text[id] ?? id;
    const draft = composeGuideAnswer(chipId, row.results, row.plan, lookup);
    // Numbers in the approved answer are allowed too, including words such as "One small step".
    const allowed = allowedNumbers(row.results, row.plan, draft, [
      ruleset.domains.activity.meetsAt,
      ruleset.domains.diet.meetsAt,
      ...numbersIn(draft.paragraphs.map((p) => p.text).join(' ')),
    ]);

    // Templates only for urgent results, any safety event, Kinyarwanda (until a reviewed evaluation), when the
    // flag is off (it needs ETHICS_AMENDMENT_REF and a key), or after the daily limit.
    const today = new Date().toISOString().slice(0, 10);
    const usage = generatedToday.get(me(req).id);
    const used = usage?.day === today ? usage.count : 0;
    const flags = await currentFlags(database, config);
    // The AI needs its own, separate opt-in (consent scope ai_explanations); without it the template is served.
    const aiConsent = await one<{ granted: boolean }>(
      database,
      "SELECT granted FROM consent_events WHERE user_id = $1 AND scope = 'ai_explanations' ORDER BY created_at DESC LIMIT 1",
      [me(req).id],
    );
    const templatesOnly =
      !flags.guideGenerative ||
      !generativeGuideAllowed(config) ||
      aiConsent?.granted !== true ||
      row.plan.urgent !== null ||
      row.safety.tier !== null ||
      body.language === 'rw' ||
      used >= GUIDE_DAILY_LIMIT;

    let answer: GuideAnswer = draft as GuideAnswer;
    let source: 'generated' | 'template' = 'template';
    let outcome: string = templatesOnly ? 'templates_only' : 'error';
    let tokens: { inputTokens: number | null; outputTokens: number | null } = {
      inputTokens: null,
      outputTokens: null,
    };
    // Each AI answer is written once per check-up, question and language, then the saved answer is reused.
    const saved = templatesOnly
      ? null
      : await one<{
          paragraphs: GuideAnswer['paragraphs'];
          follow_up_chip_ids: GuideAnswer['followUpChipIds'];
        }>(
          database,
          'SELECT paragraphs, follow_up_chip_ids FROM guide_answers WHERE assessment_id = $1 AND chip_id = $2 AND language = $3',
          [body.assessmentId, chipId, body.language],
        );
    if (saved) {
      answer = { paragraphs: saved.paragraphs, followUpChipIds: saved.follow_up_chip_ids };
      source = 'generated';
      outcome = 'saved';
    } else if (!templatesOnly) {
      const library = Object.fromEntries(
        Object.entries(content.text).filter(
          ([id]) => (id.startsWith('guide.') || id.startsWith('band.')) && !/^band\.(phq9|gad7)\./.test(id),
        ),
      );
      // Only codes, band words, values and targets for NCD areas: no identifiers, dates or mental-wellness data.
      const facts = {
        language: body.language,
        chip: chipId,
        results: row.results.ncd.map((r) => ({
          domain: r.domain,
          band: r.band,
          bandLabel: lookup(r.band === 'insufficient' ? 'band.insufficient' : `band.${r.domain}.${r.band}`),
          value: r.value,
        })),
        plan: row.plan.focus.map((f) => ({ domains: f.domains, target: f.target, reasons: f.reasons })),
        templateAnswer: draft.paragraphs.map((p) => p.text).join('\n\n'),
        allowedNumbers: allowed,
      };
      // Every attempt counts towards the daily limit, whether or not the answer passes the checks.
      generatedToday.set(me(req).id, { day: today, count: used + 1 });
      try {
        const result = await explainWithGemini(config, fetchFn, facts, library, allowed);
        tokens = { inputTokens: result.inputTokens, outputTokens: result.outputTokens };
        outcome = result.outcome;
        if (result.answer) {
          answer = result.answer;
          source = 'generated';
          await database.query(
            `INSERT INTO guide_answers (assessment_id, chip_id, language, paragraphs, follow_up_chip_ids, model)
             VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
            [
              body.assessmentId,
              chipId,
              body.language,
              JSON.stringify(answer.paragraphs),
              JSON.stringify(answer.followUpChipIds),
              config.GEMINI_MODEL,
            ],
          );
        }
      } catch {
        outcome = 'error';
        logger.warn({ reqId: req.id, event: 'guide_error' }, 'guide');
      }
    }
    const logRow = await one<{ id: string }>(
      database,
      `INSERT INTO guide_request_log (chip_id, source, validator_outcome, model, latency_ms, input_tokens, output_tokens)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        chipId,
        source,
        outcome,
        templatesOnly || saved ? null : config.GEMINI_MODEL,
        Date.now() - started,
        tokens.inputTokens,
        tokens.outputTokens,
      ],
    );
    res.json({
      requestId: logRow?.id,
      source,
      paragraphs: answer.paragraphs,
      followUpChipIds: answer.followUpChipIds,
    });
  });

  guide.post('/feedback', async (req, res) => {
    const body = GuideFeedbackRequest.parse(req.body);
    await needDb().query('UPDATE guide_request_log SET helpful = $2 WHERE id = $1', [
      body.requestId,
      body.helpful,
    ]);
    res.status(204).end();
  });
  mount('/api/v1/guide', guide);

  // ── 8.10 WhatsApp notices: opt in or out (consent event), never any results in the message ─────────────────────
  const messaging = Router();
  messaging.use(requireAuth, requireRole('participant'));

  messaging.get('/', async (req, res) => {
    const database = needDb();
    const latest = (scope: string) =>
      one<{ granted: boolean }>(
        database,
        'SELECT granted FROM consent_events WHERE user_id = $1 AND scope = $2 ORDER BY created_at DESC LIMIT 1',
        [me(req).id, scope],
      );
    const whatsapp = await latest('whatsapp_notices');
    const user = await one<{ phone: string | null }>(database, 'SELECT phone FROM users WHERE id = $1', [
      me(req).id,
    ]);
    const flags = await currentFlags(database, config);
    res.json({
      whatsapp: whatsapp?.granted ?? false,
      whatsappAvailable: flags.messaging && whatsappConfigured(config),
      hasPhone: Boolean(user?.phone),
    });
  });

  messaging.put('/', async (req, res) => {
    const database = needDb();
    const body = MessagingPreference.parse(req.body);
    const user = await one<{ preferred_language: 'en' | 'rw'; phone: string | null }>(
      database,
      'SELECT preferred_language, phone FROM users WHERE id = $1',
      [me(req).id],
    );
    const flags = await currentFlags(database, config);
    const canSend = flags.messaging && whatsappConfigured(config) && Boolean(user?.phone);
    if (body.whatsapp && !canSend) {
      throw new AppError(409, 'CONFLICT', 'This kind of notice is not available.');
    }
    await database.query(
      `INSERT INTO consent_events (user_id, scope, granted, consent_doc_version, language)
       VALUES ($1, 'whatsapp_notices', $2, 'messaging-0.1.0', $3)`,
      [me(req).id, body.whatsapp, user?.preferred_language ?? 'en'],
    );
    res.json(body);
  });
  mount('/api/v1/participant/messaging', messaging);

  // 8.11 AI explanations opt-in (ADR-019): off until the participant switches it on; withdrawing is one tap.
  const aiOptIn = Router();
  aiOptIn.use(requireAuth, requireRole('participant'));

  aiOptIn.get('/', async (req, res) => {
    const database = needDb();
    const consent = await one<{ granted: boolean }>(
      database,
      "SELECT granted FROM consent_events WHERE user_id = $1 AND scope = 'ai_explanations' ORDER BY created_at DESC LIMIT 1",
      [me(req).id],
    );
    const flags = await currentFlags(database, config);
    res.json({
      ai: consent?.granted ?? false,
      available: flags.guideGenerative && generativeGuideAllowed(config),
    });
  });

  aiOptIn.put('/', async (req, res) => {
    const database = needDb();
    const body = AiPreference.parse(req.body);
    const user = await one<{ preferred_language: 'en' | 'rw' }>(
      database,
      'SELECT preferred_language FROM users WHERE id = $1',
      [me(req).id],
    );
    await database.query(
      `INSERT INTO consent_events (user_id, scope, granted, consent_doc_version, language)
       VALUES ($1, 'ai_explanations', $2, 'ai-guide-0.1.0', $3)`,
      [me(req).id, body.ai, user?.preferred_language ?? 'en'],
    );
    if (!body.ai) {
      await database.query(
        'DELETE FROM guide_answers WHERE assessment_id IN (SELECT id FROM assessments WHERE user_id = $1)',
        [me(req).id],
      );
    }
    res.json(body);
  });
  mount('/api/v1/participant/ai-explanations', aiOptIn);

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found.' } });
  });
  app.use(errorHandler(logger));
  return app;
}

export async function seed(
  db: Db,
  config: AppConfig,
): Promise<{ password: string; shown: boolean; accounts: string[] }> {
  if (config.APP_ENV === 'pilot')
    throw new Error('Refusing to seed: APP_ENV is pilot. The seed writes synthetic data only.');
  const password = config.SEED_PASSWORD ?? randomBytes(9).toString('base64url');
  const hash = await hashPassword(password);
  const accounts: Array<{ email: string; role: Role; name: string }> = [
    { email: 'admin@rinda.test', role: 'researcher_admin', name: 'Demo Admin' },
    { email: 'facilitator@rinda.test', role: 'facilitator', name: 'Demo Facilitator' },
    { email: 'reviewer@rinda.test', role: 'reviewer', name: 'Demo Clinical Reviewer' },
    { email: 'reviewer2@rinda.test', role: 'reviewer', name: 'Demo Language Reviewer' },
    { email: 'participant1@rinda.test', role: 'participant', name: 'Demo Participant 1' },
    { email: 'participant2@rinda.test', role: 'participant', name: 'Demo Participant 2' },
  ];
  const ids = new Map<string, string>();
  for (const a of accounts) {
    const row = await one<{ id: string }>(
      db,
      `INSERT INTO users (role, email, password_hash, display_name, order_assignment)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) WHERE email IS NOT NULL DO UPDATE SET password_hash = $3, role = $1, active = true
       RETURNING id`,
      [
        a.role,
        a.email,
        hash,
        a.name,
        a.role === 'participant' ? (a.email.endsWith('1@rinda.test') ? 'AB' : 'BA') : null,
      ],
    );
    if (!row) continue;
    ids.set(a.email, row.id);
    if (a.role === 'participant') {
      await db.query(
        `INSERT INTO participant_profiles (user_id, age_band, sex, district_band) VALUES ($1, '18-24', 'female', 'gasabo')
         ON CONFLICT (user_id) DO NOTHING`,
        [row.id],
      );
    }
  }
  const p1 = ids.get('participant1@rinda.test');
  if (p1) {
    const answers: CheckupSubmission['answers'] = {
      tobaccoUse: false,
      auditC: [1, 1, 0],
      moderateMinutes: 60,
      vigorousMinutes: 0,
      servingsPerDay: 3,
      addsSaltAtTable: true,
      heightCm: 165,
      weightKg: 62,
      waistCm: 78,
      systolic: 134,
      diastolic: 82,
      measurementSource: 'in_session',
    };
    const input = toAssessmentInput(answers, 'female');
    const results = scoreAssessment(input, ruleset);
    await db.query(
      `INSERT INTO assessments (user_id, idempotency_key, request_hash, ruleset_version, language, input, results, plan,
                                safety, started_at, submitted_at)
       VALUES ($1, '00000000-0000-4000-8000-000000000001', $2, $3, 'en', $4, $5, $6, $7, now(), now())
       ON CONFLICT (user_id, idempotency_key) DO NOTHING`,
      [
        p1,
        sha256('seed'),
        ruleset.version,
        input,
        results,
        planNextSteps(results, ruleset),
        assessSafety(input, results, ruleset),
      ],
    );
  }
  const adminId = ids.get('admin@rinda.test');
  await db.query(
    `INSERT INTO content_versions (type, key, version, language, body, body_hash, created_by)
     VALUES ('ruleset', 'ruleset', $1, '', $2, $3, $4) ON CONFLICT (type, key, version, language) DO NOTHING`,
    [ruleset.version, ruleset, sha256(normalise(ruleset)), adminId ?? null],
  );
  return {
    password,
    shown: !config.SEED_PASSWORD,
    accounts: accounts.map((a) => `${a.role.padEnd(16)} ${a.email}`),
  };
}

async function main() {
  let config: AppConfig;
  try {
    config = loadConfig();
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
  const command = process.argv[2] ?? 'serve';
  const logger = createLogger(config.LOG_LEVEL);

  if (command !== 'serve') {
    const url = directUrlOf(config);
    if (!url) {
      console.error(
        'No database configured. Set DATABASE_URL (and DIRECT_URL for Neon) in .env; see .env.example.',
      );
      process.exit(1);
    }
    const db = createPool(url, config.DB_SCHEMA);
    try {
      if (command === 'migrate') {
        const applied = await migrate(db, config.DB_SCHEMA);
        console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date.');
      } else if (command === 'seed') {
        await migrate(db, config.DB_SCHEMA);
        const result = await seed(db, config);
        console.log(`Synthetic accounts:\n  ${result.accounts.join('\n  ')}`);
        console.log(
          result.shown
            ? `Password for all of them: ${result.password}`
            : 'Password: the SEED_PASSWORD you set.',
        );
      } else if (command === 'db-check') {
        const row = await one<{ version: string; db: string }>(
          db,
          "SELECT current_setting('server_version') AS version, current_database() AS db",
        );
        const host = new URL(url).host;
        console.log(`ok   ${host} / ${row?.db} (PostgreSQL ${row?.version})`);
      } else {
        console.error(`Unknown command "${command}". Use serve, migrate, seed or db-check.`);
        process.exitCode = 1;
      }
    } catch (error) {
      console.error(`${command} failed: ${(error as Error).name}: ${(error as Error).message}`);
      process.exitCode = 1;
    } finally {
      await db.end();
    }
    return;
  }

  if (config.generatedSecret) logger.warn('dev_session_secret_generated_for_this_process');
  const db = config.DATABASE_URL ? createPool(config.DATABASE_URL, config.DB_SCHEMA) : null;
  if (!db) logger.warn('database_not_configured');
  const app = createApp({ config, logger, db });
  const server = app.listen(config.PORT, () => {
    logger.info(
      { port: config.PORT, env: config.APP_ENV, database: db ? 'configured' : 'none' },
      'api_listening',
    );
  });
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'api_shutdown');
    server.close(() => {
      void (db ? db.end() : Promise.resolve()).finally(() => process.exit(0));
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) void main();
