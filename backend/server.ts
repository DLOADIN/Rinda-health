// This is the whole Rinda API in one file: settings, logging, the database, sign-in, every route, and the
// migrate, seed and db-check commands at the bottom.
import {
  createDecipheriv,
  createECDH,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  randomInt,
  timingSafeEqual,
  type ECDH,
} from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { BUNDLED_CONTENT, RULESET_V1 } from '@rinda/content';
import { GUIDE_ANSWERS } from '@rinda/content/guide-answers';
import {
  allowedNumbers,
  assessSafety,
  composeGuideAnswer,
  fillSlots,
  targetPercent,
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
  susScore,
  wellnessInput,
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
  ConsentChange,
  ConsentSubmission,
  EmailReportPreference,
  SafetyEvent,
  SusSubmission,
  EmailReportSend,
  SessionProgressRequest,
  HandoverEnvelope,
  HandoverPayload,
  DeviceClaimRequest,
  WhatsAppPreference,
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

// This is where every setting from .env is checked when the server starts, so a typo stops us early.
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
    GEMINI_PAID_TIER: z.preprocess(emptyAsUndefined, z.enum(['true', 'false']).default('false')),
    BREVO_API_KEY: optionalText,
    EMAIL_FROM: optionalText,
    EMAIL_FROM_NAME: z.string().default('Rinda Health'),
    MESSAGING_APPROVAL_REF: optionalText,
    WHATSAPP_TOKEN: optionalText,
    WHATSAPP_PHONE_NUMBER_ID: optionalText,
    WHATSAPP_TEMPLATE: z.string().default('rinda_summary_ready'),
    WHATSAPP_TEMPLATE_LANGUAGE_EN: z.string().default('en'),
    WHATSAPP_TEMPLATE_LANGUAGE_RW: z.string().default('en'),
    WHATSAPP_API_VERSION: z.string().default('v21.0'),
    SEED_PASSWORD: optionalText,
    HANDOVER_SECRET: z.string().min(32, 'must be at least 32 characters').optional(),
    HANDOVER_SECRET_PREVIOUS: z.string().min(32, 'must be at least 32 characters').optional(),
  })
  .superRefine((env, ctx) => {
    if (env.APP_ENV !== 'development' && env.APP_ENV !== 'test' && !env.DATABASE_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: `is required when APP_ENV=${env.APP_ENV}`,
      });
    }
    // The offline hand-over key must be its own secret in the pilot, so the session secret can rotate on its own.
    if (env.APP_ENV === 'pilot' && !env.HANDOVER_SECRET) {
      ctx.addIssue({ code: 'custom', path: ['HANDOVER_SECRET'], message: 'is required when APP_ENV=pilot' });
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
  // On Vercel the site's own address is known, so Google sign-in, cookies and email links point there even when
  // PUBLIC_URL was not set. On a PC it stays http://localhost:5173.
  if (!input['PUBLIC_URL'] && env['VERCEL_PROJECT_PRODUCTION_URL']) {
    input['PUBLIC_URL'] = `https://${env['VERCEL_PROJECT_PRODUCTION_URL']}`;
  }
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
// The AI guide only switches on with an ethics reference and a key, and in the pilot also needs a paid Gemini tier.
const generativeGuideAllowed = (c: AppConfig) =>
  Boolean(c.ETHICS_AMENDMENT_REF && c.GEMINI_API_KEY) &&
  (c.APP_ENV !== 'pilot' || c.GEMINI_PAID_TIER === 'true');
const emailConfigured = (c: AppConfig) => Boolean(c.BREVO_API_KEY && c.EMAIL_FROM);
const whatsappConfigured = (c: AppConfig) => Boolean(c.WHATSAPP_TOKEN && c.WHATSAPP_PHONE_NUMBER_ID);

// Anything on this list is blanked out of the logs, so answers, results and passwords never end up there.
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
  'wellness',
  'phq9',
  'gad7',
  'items',
  'consents',
  'score',
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

// This is the key that seals offline hand-overs, made from HANDOVER_SECRET (required in the pilot). Each key has a
// short id, and the previous secret is kept during a rotation so packages already in the field can still be opened.
export interface HandoverKey {
  ecdh: ECDH;
  publicKey: string;
  kid: string;
  secret: string;
}
export function handoverKey(secret: string): HandoverKey {
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), 'rinda-handover-key-v1', 32)));
  const publicKey = ecdh.getPublicKey().toString('base64url');
  return { ecdh, publicKey, kid: sha256(publicKey).slice(0, 8), secret };
}

const HANDOVER_TOKEN_DAYS = 30;
export const CHECKUPS_PER_DAY = 5;

/** A per-person proof sealed inside each hand-over, so nobody can send check-ups in someone else's name. It expires. */
export function handoverToken(
  secret: string,
  userId: string,
  issued = Math.floor(Date.now() / 1000),
): string {
  const key = Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), 'rinda-handover-token-v1', 32));
  return `${issued}.${createHmac('sha256', key).update(`${userId}|${issued}`).digest('base64url')}`;
}

export function handoverTokenValid(
  secrets: readonly string[],
  userId: string,
  token: string,
  now = Date.now(),
) {
  const issued = Number(token.split('.')[0]);
  const age = now / 1000 - issued;
  if (!Number.isInteger(issued) || age > HANDOVER_TOKEN_DAYS * 86_400 || age < -86_400) return false;
  return secrets.some((secret) => {
    const expected = Buffer.from(handoverToken(secret, userId, issued));
    const given = Buffer.from(token);
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
}

/** Opens a sealed hand-over: ECDH P-256, HKDF-SHA-256, then AES-256-GCM, optionally gzipped inside. */
export function openHandover(ecdh: ECDH, env: HandoverEnvelope): unknown {
  const shared = ecdh.computeSecret(Buffer.from(env.epk, 'base64url'));
  const key = Buffer.from(hkdfSync('sha256', shared, Buffer.alloc(0), 'rinda-handover-v1', 32));
  const data = Buffer.from(env.ct, 'base64url');
  if (data.length < 17) throw new Error('short');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(env.iv, 'base64url'));
  decipher.setAuthTag(data.subarray(data.length - 16));
  const plain = Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]);
  const json = env.gz ? gunzipSync(plain, { maxOutputLength: 2_000_000 }) : plain;
  return JSON.parse(json.toString('utf8'));
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

// This is where we connect to PostgreSQL on Neon. All SQL below is plain SQL with $1-style parameters.
export function createPool(connectionString: string, schema?: string): Db {
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

// This is where the numbered files in db/migrations are applied, once each, in order.
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
    if (file === '001_init.sql' && done.size === 0) {
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

// Sessions live in an HttpOnly cookie; the database only keeps a hash of the token.
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

export function numbersIn(text: string): number[] {
  return [
    ...[...text.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => Number(m[0].replace(',', '.'))),
    ...[...text.toLowerCase().matchAll(/\b[a-z]+\b/g)].flatMap((m) =>
      m[0] in NUMBER_WORDS ? [NUMBER_WORDS[m[0]] as number] : [],
    ),
  ];
}

// This is where we double-check Gemini's answer. If it changes a number or wanders off topic, we show the
// approved template instead.
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

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );

// This is where the report email is put together, only from approved wording. Mood and stress results
// are never emailed.
export function composeReportEmail(
  language: 'en' | 'rw',
  results: AssessmentResult,
  plan: Plan,
  link: string,
  // The guide's explanation of these results: Gemini's when it was allowed and prepared, otherwise approved text.
  explanation: { paragraphs: string[]; generated: boolean } | null = null,
): { subject: string; text: string; html: string } {
  const content = BUNDLED_CONTENT[language];
  const lookup = (id: string) => content.text[id] ?? GUIDE_ANSWERS[language][id] ?? id;
  const area = (domain: string) => lookup(`guide.area.${domain}`);
  const answered = results.ncd.filter((r) => r.band !== 'insufficient');
  const missing = results.ncd.filter((r) => r.band === 'insufficient').map((r) => area(r.domain));
  const rowsOf = answered.map((r) => {
    const percent = targetPercent(r, RULESET_V1);
    const band = lookup(`band.${r.domain}.${r.band}`);
    return {
      area: area(r.domain),
      band: percent === null ? band : `${band} · ${fillSlots(lookup('email.report.percent'), { percent })}`,
      r,
    };
  });
  const explained =
    explanation ??
    (() => {
      const tips = composeGuideAnswer('tips', results, plan, lookup).paragraphs.map((p) => p.text);
      return tips.length ? { paragraphs: tips, generated: false } : null;
    })();
  const steps = [
    ...new Set(composeGuideAnswer('first_step', results, plan, lookup).paragraphs.map((p) => p.text)),
  ];
  const greeting = lookup('email.report.greeting');
  const disclaimer = lookup('email.report.disclaimer');
  const open = lookup('email.report.open');
  const optOut = lookup('email.report.optout');
  const missingLine = missing.length ? `${lookup('band.insufficient')}: ${missing.join(', ')}` : null;

  const explanationTitle = lookup('email.report.explanation');
  const generatedNote = explained?.generated
    ? `${lookup('guide.label.generated')}. ${lookup('guide.label.disclaimer')}`
    : null;
  const text = [
    greeting,
    rowsOf.map((x) => `- ${x.area}: ${x.band}`).join('\n'),
    missingLine,
    ...steps,
    explained ? [explanationTitle, ...explained.paragraphs].join('\n\n') : null,
    generatedNote,
    disclaimer,
    `${open}: ${link}`,
    optOut,
  ]
    .filter((p): p is string => Boolean(p))
    .join('\n\n');

  const tone: Record<string, string> = {
    ok: '#2F6B4F',
    attention: '#A87C14',
    confirm: '#C24A63',
    urgent: '#C2330E',
    wellness: '#B26F7E',
    unknown: '#665C54',
  };
  const e = escapeHtml;
  const row = (x: (typeof rowsOf)[number]) =>
    `<tr><td style="padding:10px 0;border-bottom:1px solid #EBE9E1;color:#2B1D16">${e(x.area)}</td>` +
    `<td style="padding:10px 0;border-bottom:1px solid #EBE9E1;text-align:right;font-weight:600;color:${tone[x.r.severity] ?? '#2B1D16'}">${e(x.band)}</td></tr>`;
  const html = [
    '<div style="background:#EBE9E1;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#2B1D16">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto">',
    '<tr><td style="padding:0 4px 16px;font-size:20px;font-weight:700;color:#C2330E">Rinda Health</td></tr>',
    '<tr><td style="background:#F7F6F3;border:1px solid #D3CEC3;border-radius:16px;padding:24px">',
    `<p style="margin:0 0 16px;font-size:16px;line-height:1.5">${e(greeting)}</p>`,
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px">',
    rowsOf.map(row).join(''),
    '</table>',
    missingLine ? `<p style="margin:12px 0 0;font-size:13px;color:#665C54">${e(missingLine)}</p>` : '',
    '<div style="margin:20px 0 0;padding:16px;background:#FBEECD;border-radius:12px">',
    ...steps.map((p) => `<p style="margin:0 0 8px;font-size:15px;line-height:1.5">${e(p)}</p>`),
    '</div>',
    explained
      ? [
          `<h2 style="margin:24px 0 8px;font-size:17px;color:#2B1D16">${e(explanationTitle)}</h2>`,
          ...explained.paragraphs.map(
            (p) => `<p style="margin:0 0 10px;font-size:15px;line-height:1.6">${e(p)}</p>`,
          ),
          generatedNote
            ? `<p style="margin:8px 0 0;font-size:12px;line-height:1.5;color:#665C54">${e(generatedNote)}</p>`
            : '',
        ].join('')
      : '',
    `<p style="margin:24px 0 0"><a href="${e(link)}" style="display:inline-block;background:#D4380F;color:#FFFFFF;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">${e(open)}</a></p>`,
    `<p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#665C54">${e(disclaimer)}</p>`,
    '</td></tr>',
    `<tr><td style="padding:16px 4px 0;font-size:12px;line-height:1.5;color:#665C54">${e(optOut)}</td></tr>`,
    '</table></div>',
  ].join('');
  return { subject: lookup('email.report.subject'), text, html };
}

// This sends the WhatsApp "your summary is ready" notice. It is an approved Meta template with no
// parameters, so no result can ever be put into the message.
async function sendWhatsAppNotice(
  db: Db,
  config: AppConfig,
  logger: Logger,
  fetchFn: typeof fetch,
  userId: string,
): Promise<'sent' | 'failed' | 'skipped'> {
  if (!whatsappConfigured(config) || !(await currentFlags(db, config)).messaging) return 'skipped';
  const consent = await one<{ granted: boolean }>(
    db,
    "SELECT granted FROM consent_events WHERE user_id = $1 AND scope = 'whatsapp_notices' ORDER BY created_at DESC LIMIT 1",
    [userId],
  );
  if (!consent?.granted) return 'skipped';
  const user = await one<{ phone: string | null; preferred_language: 'en' | 'rw' }>(
    db,
    'SELECT phone, preferred_language FROM users WHERE id = $1 AND active AND deleted_at IS NULL',
    [userId],
  );
  const record = async (status: 'sent' | 'failed' | 'skipped', errorCode: string | null) => {
    await db.query(
      'INSERT INTO message_events (user_id, channel, template, status, error_code) VALUES ($1, $2, $3, $4, $5)',
      [userId, 'whatsapp', config.WHATSAPP_TEMPLATE, status, errorCode],
    );
    return status;
  };
  if (!user?.phone) return record('skipped', 'no_phone');
  let res: globalThis.Response;
  try {
    res = await fetchFn(
      `https://graph.facebook.com/${config.WHATSAPP_API_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.WHATSAPP_TOKEN ?? ''}`,
        },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: user.phone.replace(/^\+/, ''),
          type: 'template',
          template: {
            name: config.WHATSAPP_TEMPLATE,
            language: {
              code:
                user.preferred_language === 'rw'
                  ? config.WHATSAPP_TEMPLATE_LANGUAGE_RW
                  : config.WHATSAPP_TEMPLATE_LANGUAGE_EN,
            },
          },
        }),
      },
    );
  } catch {
    logger.warn({ event: 'whatsapp_notice', status: 'failed' }, 'message');
    return record('failed', 'network');
  }
  logger.info(
    { event: 'whatsapp_notice', status: res.ok ? 'sent' : 'failed', httpStatus: res.status },
    'message',
  );
  return record(res.ok ? 'sent' : 'failed', res.ok ? null : `http_${res.status}`);
}

// The latest complete SUS form per person (FR-17); a form with a skipped item has no score.
async function susScores(db: Db): Promise<number[]> {
  const list = await rows<{ user_id: string; created_at: Date; item_code: string; value: number }>(
    db,
    "SELECT user_id, created_at, item_code, value FROM feedback_responses WHERE form_version = 'sus-1.0'",
  );
  const latest = new Map<string, { at: number; items: Array<number | null> }>();
  for (const r of list) {
    const at = r.created_at.getTime();
    const current = latest.get(r.user_id);
    if (!current || at > current.at) latest.set(r.user_id, { at, items: Array(10).fill(null) });
    const form = latest.get(r.user_id);
    const index = Number(r.item_code.replace('sus.', '')) - 1;
    if (form && form.at === at && index >= 0 && index < 10) form.items[index] = r.value;
  }
  return [...latest.values()].map((f) => susScore(f.items)).filter((v): v is number => v !== null);
}

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[mid] ?? null) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
};

type EmailOutcome = 'sent' | 'failed' | 'skipped';

// Emails go out only when messaging is on, Brevo is set up and the person opted in.
async function sendReportEmail(
  db: Db,
  config: AppConfig,
  logger: Logger,
  fetchFn: typeof fetch,
  userId: string,
  assessmentId: string,
): Promise<EmailOutcome> {
  if (!emailConfigured(config) || !(await currentFlags(db, config)).messaging) return 'skipped';
  const consent = await one<{ granted: boolean }>(
    db,
    "SELECT granted FROM consent_events WHERE user_id = $1 AND scope = 'email_reports' ORDER BY created_at DESC LIMIT 1",
    [userId],
  );
  if (!consent?.granted) return 'skipped';
  const user = await one<{ email: string | null; preferred_language: 'en' | 'rw' }>(
    db,
    'SELECT email, preferred_language FROM users WHERE id = $1 AND active AND deleted_at IS NULL',
    [userId],
  );
  const row = await one<{ results: AssessmentResult; plan: Plan }>(
    db,
    'SELECT results, plan FROM assessments WHERE id = $1 AND user_id = $2',
    [assessmentId, userId],
  );
  const record = async (status: EmailOutcome, errorCode: string | null) => {
    await db.query(
      'INSERT INTO message_events (user_id, channel, template, status, error_code) VALUES ($1, $2, $3, $4, $5)',
      [userId, 'email', 'email.report', status, errorCode],
    );
    return status;
  };
  if (!user?.email) return record('skipped', 'no_email');
  if (!row) return record('skipped', 'no_checkup');
  // Gemini's overview is only here if it was allowed and prepared for this person; otherwise approved text is used.
  const prepared = await one<{ paragraphs: Array<{ text: string }> }>(
    db,
    "SELECT paragraphs FROM guide_answers WHERE assessment_id = $1 AND chip_id = 'overview' AND language = $2",
    [assessmentId, user.preferred_language],
  );
  const email = composeReportEmail(
    user.preferred_language,
    row.results,
    row.plan,
    `${config.PUBLIC_URL}/app/results/${assessmentId}`,
    prepared ? { paragraphs: prepared.paragraphs.map((p) => p.text), generated: true } : null,
  );
  let res: globalThis.Response;
  try {
    res = await fetchFn('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': config.BREVO_API_KEY ?? '',
        accept: 'application/json',
        'content-type': 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        sender: { name: config.EMAIL_FROM_NAME, email: config.EMAIL_FROM },
        to: [{ email: user.email }],
        subject: email.subject,
        textContent: email.text,
        htmlContent: email.html,
        tags: ['rinda-report'],
      }),
    });
  } catch {
    logger.warn({ event: 'email_report', status: 'failed' }, 'message');
    return record('failed', 'network');
  }
  logger.info(
    { event: 'email_report', status: res.ok ? 'sent' : 'failed', httpStatus: res.status },
    'message',
  );
  return record(res.ok ? 'sent' : 'failed', res.ok ? null : `http_${res.status}`);
}

const requestId = (): RequestHandler => (req, res, next) => {
  req.id = randomBytes(12).toString('hex');
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
  guideGenerative: true,
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
  messaging: true,
};
const PILOT_FLAGS: Flags = {
  ...DEVELOPMENT_FLAGS,
  guideGenerative: false,
  careGeolocation: false,
  readAloud: false,
  usabilityEvents: false,
  messaging: false,
};
// This is where each feature starts on or off. Email reports stay off in the pilot until the ethics committee agrees.
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
  flags.messaging = flags.messaging && (config.APP_ENV !== 'pilot' || Boolean(config.MESSAGING_APPROVAL_REF));
  return flags;
}

export interface AppDeps {
  config: AppConfig;
  logger: Logger;
  db: Db | null;
  fetchFn?: typeof fetch;
}

const ruleset = RULESET_V1;

const DELETION_DUE_HOURS = 72;
const CONSENT_DOC_VERSION = 'consent-0.1.0';

// This is where we look up each person's most recent consent choice for every scope.
async function latestConsents(db: Db, userId: string): Promise<Record<string, boolean>> {
  const list = await rows<{ scope: string; granted: boolean }>(
    db,
    `SELECT DISTINCT ON (scope) scope, granted FROM consent_events WHERE user_id = $1
      ORDER BY scope, created_at DESC`,
    [userId],
  );
  return Object.fromEntries(list.map((c) => [c.scope, c.granted]));
}

// Skipped answers stay "skipped" here and are never counted as 0.
function toAssessmentInput(a: CheckupSubmission['answers'], sex: Sex): AssessmentInput {
  const ans = <T>(v: T | null | undefined): Answer<T> =>
    v === null || v === undefined ? { missing: 'SKIPPED' } : { value: v };
  return {
    sex,
    tobaccoUse: ans(a.tobaccoUse),
    auditC: [ans(a.auditC[0]), ans(a.auditC[1]), ans(a.auditC[2])],
    activity: { moderateMinutes: ans(a.moderateMinutes), vigorousMinutes: ans(a.vigorousMinutes) },
    diet: { servingsPerDay: ans(a.servingsPerDay), addsSaltAtTable: ans(a.addsSaltAtTable) },
    body: { heightCm: ans(a.heightCm), weightKg: ans(a.weightKg), waistCm: ans(a.waistCm) },
    bp: { systolic: ans(a.systolic), diastolic: ans(a.diastolic) },
    ...wellnessInput(a.wellness, ruleset),
  };
}

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

// This is where the Express app and all its routes are built.
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

  const handover = handoverKey(config.HANDOVER_SECRET ?? config.SESSION_SECRET);
  const handoverKeys = [
    handover,
    ...(config.HANDOVER_SECRET_PREVIOUS ? [handoverKey(config.HANDOVER_SECRET_PREVIOUS)] : []),
  ];
  const needDb = (): Db => {
    if (!db) throw new AppError(503, 'DB_UNAVAILABLE', 'The database is not connected yet.');
    return db;
  };

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

  // This is how a study phone joins a session from the QR code, learns when to wipe itself, and confirms the wipe.
  const devices = Router();
  const deviceRow = async (req: Request) => {
    const token = req.get('x-device-token');
    if (!token || !/^[A-Za-z0-9_-]{20,80}$/.test(token)) return null;
    return one<{ id: string; wipe_requested_at: Date | null; session_ended: boolean }>(
      needDb(),
      `SELECT d.id, d.wipe_requested_at, s.ended_at IS NOT NULL AS session_ended
         FROM session_devices d JOIN facilitator_sessions s ON s.id = d.session_id WHERE d.device_token_hash = $1`,
      [sha256(token)],
    );
  };

  devices.post('/claim', authLimiter, async (req, res) => {
    const database = needDb();
    const body = DeviceClaimRequest.parse(req.body);
    const token = randomBytes(32).toString('base64url');
    const row = await one<{ language: 'en' | 'rw'; device_label: string | null }>(
      database,
      `UPDATE session_devices d SET device_token_hash = $2, claimed_at = now()
         FROM facilitator_sessions s JOIN users u ON u.id = s.participant_id
        WHERE d.code_hash = $1 AND d.session_id = s.id AND d.claimed_at IS NULL AND d.expires_at > now()
          AND s.ended_at IS NULL
        RETURNING u.preferred_language AS language, s.device_label`,
      [sha256(body.code), sha256(token)],
    );
    if (!row) throw new AppError(404, 'NOT_FOUND', 'This set-up code has expired or was already used.');
    res.json({ deviceToken: token, language: row.language, deviceLabel: row.device_label });
  });

  devices.get('/status', async (req, res) => {
    const row = await deviceRow(req);
    // An unknown token (for example a deleted session) also means: clear this phone.
    res.json({ wipe: !row || Boolean(row.wipe_requested_at) });
  });

  devices.post('/wiped', async (req, res) => {
    const row = await deviceRow(req);
    if (row) await needDb().query('UPDATE session_devices SET wiped_at = now() WHERE id = $1', [row.id]);
    res.status(204).end();
  });
  mount('/api/v1/devices', devices);

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
      sameSite: 'lax',
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
    await database.query(
      'UPDATE user_sessions SET revoked_at = now() WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL',
      [user.id, me(req).sessionId],
    );
    res.status(204).end();
  });
  mount('/api/v1/me', account);

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

  // This is where a check-up is checked, scored and stored, whether it comes straight from the phone or through an
  // offline hand-over. The same idempotency key always gives the same stored check-up.
  const saveCheckup = async (
    database: Db,
    userId: string,
    key: { data: string },
    body: CheckupSubmission,
    reqId: unknown,
  ): Promise<
    { issues: ReturnType<typeof measurementIssues> } | { status: 200 | 201; row: AssessmentRow }
  > => {
    const issues = measurementIssues(body.answers);
    if (issues.length > 0) return { issues };
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
      return { status: 200, row: existing };
    }
    // Up to five new check-ups a day per person, which also keeps the guide's AI use in check.
    const today = await one<{ n: number }>(
      database,
      "SELECT count(*)::int AS n FROM assessments WHERE user_id = $1 AND created_at > now() - interval '24 hours'",
      [userId],
    );
    if ((today?.n ?? 0) >= CHECKUPS_PER_DAY) {
      throw new AppError(429, 'DAILY_LIMIT', 'You have reached the limit of check-ups for today.');
    }
    const consents = await latestConsents(database, userId);
    // Nobody can send a check-up before agreeing to take part.
    if (!consents['core']) {
      throw new AppError(403, 'CONSENT_REQUIRED', 'Please agree to take part before a check-up.');
    }
    const profile = await one<{ sex: Sex }>(
      database,
      'SELECT sex FROM participant_profiles WHERE user_id = $1',
      [userId],
    );
    const answers = consents['mental_wellness']
      ? body.answers
      : { ...body.answers, wellness: 'declined' as const };
    const input = toAssessmentInput(answers, profile?.sex ?? 'not_stated');
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
    // A mood or stress score of 10 or more is noted as a Tier 1 safety event, without any answers or scores.
    if (inserted && safety.tier === 1) {
      await database.query(
        `INSERT INTO safety_events (participant_id, tier, trigger_type, actions, occurred_at, recorded_by_role)
         VALUES ($1, 1, 'score_threshold', ARRAY['referral_list_shown'], now(), 'system')`,
        [userId],
      );
    }
    if (inserted) {
      void sendWhatsAppNotice(database, config, logger, fetchFn, userId).catch(() =>
        logger.warn({ reqId, event: 'whatsapp_notice_error' }, 'message'),
      );
      // The guide's overview is prepared first (only if Gemini is allowed for this person), so it is ready in the
      // app and can go into the report email.
      const language = body.language;
      void (async () => {
        await answerGuide(
          database,
          userId,
          { assessmentId: row.id, chipId: 'overview', language },
          reqId,
          true,
        ).catch(() => null);
        await sendReportEmail(database, config, logger, fetchFn, userId, row.id);
      })().catch(() => logger.warn({ reqId, event: 'email_report_error' }, 'message'));
    }
    return { status: inserted ? 201 : 200, row };
  };

  participant.post('/assessments', async (req, res) => {
    const key = z.uuid().safeParse(req.get('idempotency-key'));
    if (!key.success)
      throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'An Idempotency-Key header (UUID) is required.');
    const body = CheckupSubmission.parse(req.body);
    const saved = await saveCheckup(needDb(), me(req).id, key, body, req.id);
    if ('issues' in saved) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Please check the highlighted readings.',
          details: saved.issues,
        },
      });
      return;
    }
    res.status(saved.status).json(toAssessment(saved.row));
  });

  // The phone keeps this so it can seal a hand-over while offline: the server's public key and its own proof.
  participant.get('/handover-pass', (req, res) => {
    res.set('cache-control', 'no-store');
    res.json({
      publicKey: handover.publicKey,
      kid: handover.kid,
      token: handoverToken(handover.secret, me(req).id),
    });
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
            dueAt: new Date(row.requested_at.getTime() + DELETION_DUE_HOURS * 3_600_000).toISOString(),
            completedAt: row.completed_at?.toISOString() ?? null,
          }
        : null,
    );
  });

  participant.get('/consents', async (req, res) => {
    const consents = await latestConsents(needDb(), me(req).id);
    res.json({
      decided: 'core' in consents,
      core: consents['core'] ?? false,
      mental_wellness: consents['mental_wellness'] ?? false,
      audio: consents['audio'] ?? false,
      follow_up: consents['follow_up'] ?? false,
    });
  });

  participant.post('/consents', async (req, res) => {
    const body = ConsentSubmission.parse(req.body);
    await tx(needDb(), async (client) => {
      for (const scope of ['core', 'mental_wellness', 'audio', 'follow_up'] as const) {
        await client.query(
          `INSERT INTO consent_events (user_id, scope, granted, consent_doc_version, language)
           VALUES ($1, $2, $3, $4, $5)`,
          [me(req).id, scope, body.consents[scope], CONSENT_DOC_VERSION, body.language],
        );
      }
    });
    res.status(201).json(body.consents);
  });

  participant.put('/consents', async (req, res) => {
    const database = needDb();
    const body = ConsentChange.parse(req.body);
    const user = await one<{ preferred_language: 'en' | 'rw' }>(
      database,
      'SELECT preferred_language FROM users WHERE id = $1',
      [me(req).id],
    );
    await database.query(
      `INSERT INTO consent_events (user_id, scope, granted, consent_doc_version, language)
       VALUES ($1, $2, $3, $4, $5)`,
      [me(req).id, body.scope, body.granted, CONSENT_DOC_VERSION, user?.preferred_language ?? 'en'],
    );
    res.json(body);
  });

  // The phone sends item 9 safety events here. Each has its own ID, so a resend is only stored once.
  // An item 9 event from the phone, sent directly or through a hand-over.
  const saveItem9Event = async (database: Db, userId: string, body: SafetyEvent) => {
    if (body.tier !== 2 || body.triggerType !== 'item9' || body.recordedByRole !== 'system') {
      throw new AppError(400, 'VALIDATION_FAILED', 'Only item 9 safety events can be sent from the app.');
    }
    const row = await one<{ id: string }>(
      database,
      `INSERT INTO safety_events (id, participant_id, tier, trigger_type, actions, occurred_at, recorded_by_role)
       VALUES ($1, $2, 2, 'item9', $3, $4, 'system') ON CONFLICT (id) DO NOTHING RETURNING id`,
      [body.id, userId, body.actions, body.occurredAt],
    );
    return Boolean(row);
  };

  participant.post('/safety-events', async (req, res) => {
    const body = SafetyEvent.parse(req.body);
    const created = await saveItem9Event(needDb(), me(req).id, body);
    res.status(created ? 201 : 200).json({ id: body.id });
  });

  participant.get('/feedback', async (req, res) => {
    const row = await one<{ n: number }>(
      needDb(),
      "SELECT count(*)::int AS n FROM feedback_responses WHERE user_id = $1 AND form_version = 'sus-1.0'",
      [me(req).id],
    );
    res.json({ submitted: (row?.n ?? 0) > 0 });
  });

  participant.post('/feedback', async (req, res) => {
    const body = SusSubmission.parse(req.body);
    await tx(needDb(), async (client) => {
      const at = new Date();
      for (const [i, value] of body.items.entries()) {
        if (value === null || value === undefined) continue;
        await client.query(
          `INSERT INTO feedback_responses (user_id, form_version, condition, item_code, value, created_at)
           VALUES ($1, $2, 'post_session', $3, $4, $5)`,
          [me(req).id, body.formVersion, `sus.${i + 1}`, value, at],
        );
      }
    });
    res.status(201).json({ score: susScore(body.items) });
  });
  // The participant's app says which study step it is on while a facilitated session is open. Step names only.
  participant.post('/session-progress', async (req, res) => {
    const database = needDb();
    const body = SessionProgressRequest.parse(req.body);
    const session = await one<{ id: string }>(
      database,
      `SELECT id FROM facilitator_sessions WHERE participant_id = $1 AND ended_at IS NULL
         AND started_at > now() - interval '12 hours' ORDER BY started_at DESC LIMIT 1`,
      [me(req).id],
    );
    if (!session) {
      res.status(204).end();
      return;
    }
    await tx(database, async (client) => {
      const last = (
        await client.query<{ id: string; step: string }>(
          'SELECT id, step FROM session_progress WHERE session_id = $1 AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1 FOR UPDATE',
          [session.id],
        )
      ).rows[0];
      if (!last || last.step !== body.step) {
        if (last) await client.query('UPDATE session_progress SET ended_at = now() WHERE id = $1', [last.id]);
        await client.query('INSERT INTO session_progress (session_id, step) VALUES ($1, $2)', [
          session.id,
          body.step,
        ]);
      }
      await client.query('UPDATE facilitator_sessions SET last_seen_at = now() WHERE id = $1', [session.id]);
    });
    res.json({ tracking: true });
  });
  mount('/api/v1/participant', participant);

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
    await needDb().query(
      'UPDATE session_progress SET ended_at = now() WHERE session_id = $1 AND ended_at IS NULL',
      [session.id],
    );
    await audit(needDb(), me(req), 'session.end', { type: 'facilitator_session', id: session.id });
    res.json(toSession(await ownSession(req)));
  });

  // This is the live session console: the step the participant is on, the timeline so far, and any safety
  // alert since the session started. Never answers, scores or results.
  facilitator.get('/sessions/:id/live', requireRole('facilitator'), async (req, res) => {
    const database = needDb();
    const session = await ownSession(req);
    const steps = await rows<{ step: string; started_at: Date; ended_at: Date | null }>(
      database,
      'SELECT step, started_at, ended_at FROM session_progress WHERE session_id = $1 ORDER BY started_at',
      [session.id],
    );
    const seen = await one<{ last_seen_at: Date | null }>(
      database,
      'SELECT last_seen_at FROM facilitator_sessions WHERE id = $1',
      [session.id],
    );
    const alerts = await rows<{ tier: number; trigger_type: string; occurred_at: Date }>(
      database,
      'SELECT tier, trigger_type, occurred_at FROM safety_events WHERE participant_id = $1 AND occurred_at >= $2 ORDER BY occurred_at',
      [session.participant_id, session.started_at],
    );
    const device = await one<{
      claimed_at: Date | null;
      wipe_requested_at: Date | null;
      wiped_at: Date | null;
    }>(
      database,
      'SELECT claimed_at, wipe_requested_at, wiped_at FROM session_devices WHERE session_id = $1 ORDER BY claimed_at DESC NULLS LAST, created_at DESC LIMIT 1',
      [session.id],
    );
    const now = Date.now();
    const timeline = steps.map((st) => ({
      step: st.step,
      startedAt: st.started_at.toISOString(),
      endedAt: st.ended_at?.toISOString() ?? null,
      seconds: Math.max(0, Math.round(((st.ended_at?.getTime() ?? now) - st.started_at.getTime()) / 1000)),
    }));
    const totals: Record<string, number> = {};
    for (const item of timeline) totals[item.step] = (totals[item.step] ?? 0) + item.seconds;
    const open = timeline.at(-1);
    const lastSeen = seen?.last_seen_at?.getTime() ?? null;
    res.json({
      ended: Boolean(session.ended_at),
      online: lastSeen !== null && now - lastSeen < 45_000,
      lastSeenAt: seen?.last_seen_at?.toISOString() ?? null,
      current: open && !open.endedAt ? { step: open.step, startedAt: open.startedAt } : null,
      timeline,
      totals,
      device: {
        linked: Boolean(device?.claimed_at),
        wipeRequested: Boolean(device?.wipe_requested_at),
        wipedAt: device?.wiped_at?.toISOString() ?? null,
      },
      alerts: alerts.map((al) => ({
        tier: al.tier,
        triggerType: al.trigger_type,
        occurredAt: al.occurred_at.toISOString(),
      })),
    });
  });

  // This is where the facilitator's laptop uploads sealed hand-overs collected from study phones without internet.
  // The laptop never sees inside; the server opens each one, checks the person's proof and stores it as usual.
  facilitator.post('/handover', requireRole('facilitator'), async (req, res) => {
    const database = needDb();
    const envelope = HandoverEnvelope.parse(req.body);
    const key = handoverKeys.find((k) => k.kid === envelope.kid);
    let payload: HandoverPayload;
    try {
      if (!key) throw new Error('unknown key');
      payload = HandoverPayload.parse(openHandover(key.ecdh, envelope));
    } catch {
      throw new AppError(400, 'VALIDATION_FAILED', 'This hand-over could not be opened.');
    }
    const refused = () =>
      new AppError(403, 'FORBIDDEN', 'This hand-over cannot be accepted from this account.');
    if (
      !handoverTokenValid(
        handoverKeys.map((k) => k.secret),
        payload.userId,
        payload.token,
      )
    )
      throw refused();
    const linked = await one<{ id: string }>(
      database,
      `SELECT s.id FROM facilitator_sessions s JOIN users u ON u.id = s.participant_id
        WHERE s.participant_id = $1 AND s.facilitator_id = $2 AND u.role = 'participant' AND u.active
          AND s.started_at > now() - interval '14 days' LIMIT 1`,
      [payload.userId, me(req).id],
    );
    if (!linked) throw refused();
    let saved = 0;
    let already = 0;
    let invalid = 0;
    // Safety events first, so an item 9 answer reaches the safety queue even if a check-up cannot be stored.
    for (const event of payload.safetyEvents) {
      const created = await saveItem9Event(database, payload.userId, event).catch((e: unknown) => {
        if (e instanceof AppError) return null;
        throw e;
      });
      if (created === null) invalid++;
      else if (created) saved++;
      else already++;
    }
    for (const item of payload.checkups) {
      const result = await saveCheckup(database, payload.userId, { data: item.key }, item.body, req.id).catch(
        (e: unknown) => {
          if (e instanceof AppError) return null;
          throw e;
        },
      );
      if (!result || 'issues' in result) invalid++;
      else if (result.status === 201) saved++;
      else already++;
    }
    await audit(
      database,
      me(req),
      'handover.upload',
      { type: 'user', id: payload.userId },
      {
        checkups: payload.checkups.length,
        safetyEvents: payload.safetyEvents.length,
        saved,
        invalid,
      },
    );
    res.json({ saved, already, invalid });
  });

  // QR set-up: a one-time link (15 minutes) that ties a study phone to this session.
  facilitator.post('/sessions/:id/device-link', requireRole('facilitator'), async (req, res) => {
    const database = needDb();
    const session = await ownSession(req);
    if (session.ended_at) throw new AppError(409, 'CONFLICT', 'This session has ended.');
    const code = randomBytes(18).toString('base64url');
    const expires = new Date(Date.now() + 15 * 60_000);
    await database.query(
      'INSERT INTO session_devices (session_id, code_hash, expires_at) VALUES ($1, $2, $3)',
      [session.id, sha256(code), expires],
    );
    await audit(database, me(req), 'device.link', { type: 'facilitator_session', id: session.id });
    res.status(201).json({ url: `${config.PUBLIC_URL}/setup/${code}`, expiresAt: expires.toISOString() });
  });

  // End the session and ask every linked study phone to wipe itself.
  facilitator.post('/sessions/:id/wipe', requireRole('facilitator'), async (req, res) => {
    const database = needDb();
    const session = await ownSession(req);
    await database.query(
      'UPDATE session_devices SET wipe_requested_at = coalesce(wipe_requested_at, now()) WHERE session_id = $1 AND claimed_at IS NOT NULL',
      [session.id],
    );
    await database.query(
      'UPDATE facilitator_sessions SET ended_at = coalesce(ended_at, now()) WHERE id = $1',
      [session.id],
    );
    await database.query(
      'UPDATE session_progress SET ended_at = now() WHERE session_id = $1 AND ended_at IS NULL',
      [session.id],
    );
    await audit(database, me(req), 'device.wipe', { type: 'facilitator_session', id: session.id });
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
        dueAt: new Date(d.requested_at.getTime() + DELETION_DUE_HOURS * 3_600_000).toISOString(),
        participantLabel: maskIdentifier(d.email, d.phone),
      })),
    );
  });

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

  // This is the one-click research report: aggregate, de-identified numbers for the study write-up.
  admin.get('/research-report', async (req, res) => {
    const database = needDb();
    const count = async (sql: string, params: unknown[] = []) =>
      (await one<{ n: number }>(database, sql, params))?.n ?? 0;
    const latestConsent = (scope: string) =>
      count(
        `SELECT count(*)::int AS n FROM (SELECT DISTINCT ON (user_id) granted FROM consent_events
              WHERE scope = $1 ORDER BY user_id, created_at DESC) c WHERE granted`,
        [scope],
      );

    const taskRows = await rows<{ task_code: string; outcome: string; duration_seconds: number }>(
      database,
      'SELECT task_code, outcome, duration_seconds FROM task_results',
    );
    const tasks = TASK_CODES.map((code) => {
      const list = taskRows.filter((r) => r.task_code === code);
      return {
        task: code,
        recorded: list.length,
        completed: list.filter((r) => r.outcome === 'completed').length,
        withHelp: list.filter((r) => r.outcome === 'completed_with_help').length,
        notCompleted: list.filter((r) => r.outcome === 'not_completed').length,
        medianSeconds: median(list.map((r) => r.duration_seconds)),
      };
    });

    const scores = await susScores(database);
    const susBands = [
      { band: 'below_50', min: 0, max: 50 },
      { band: '50_to_67', min: 50, max: 68 },
      { band: '68_to_79', min: 68, max: 80 },
      { band: '80_plus', min: 80, max: 101 },
    ].map((b) => ({ band: b.band, count: scores.filter((v) => v >= b.min && v < b.max).length }));

    const latest = await rows<{ results: AssessmentResult }>(
      database,
      'SELECT DISTINCT ON (user_id) results FROM assessments ORDER BY user_id, created_at DESC',
    );
    const bands: Record<string, Record<string, number>> = {};
    let wellnessDone = 0;
    for (const { results } of latest) {
      for (const r of results.ncd) {
        const domain = (bands[r.domain] ??= {});
        domain[r.band] = (domain[r.band] ?? 0) + 1;
      }
      if (results.wellness.some((r) => r.band !== 'insufficient')) wellnessDone++;
    }

    const safety = await rows<{ tier: number; n: number }>(
      database,
      'SELECT tier, count(*)::int AS n FROM safety_events GROUP BY tier ORDER BY tier',
    );
    const languages = await rows<{ language: string; n: number }>(
      database,
      `SELECT preferred_language AS language, count(*)::int AS n FROM users
        WHERE role = 'participant' AND deleted_at IS NULL GROUP BY preferred_language ORDER BY 1`,
    );
    await audit(database, me(req), 'report.view', { type: 'research_report', id: 'all' });
    res.json({
      generatedAt: new Date().toISOString(),
      rulesetVersion: ruleset.version,
      participants: {
        total: await count(
          "SELECT count(*)::int AS n FROM users WHERE role = 'participant' AND deleted_at IS NULL",
        ),
        consented: await latestConsent('core'),
        wellnessConsent: await latestConsent('mental_wellness'),
        withCheckup: latest.length,
        wellnessCompleted: wellnessDone,
      },
      checkups: await count('SELECT count(*)::int AS n FROM assessments'),
      sessions: {
        total: await count('SELECT count(*)::int AS n FROM facilitator_sessions'),
        ended: await count('SELECT count(*)::int AS n FROM facilitator_sessions WHERE ended_at IS NOT NULL'),
      },
      tasks,
      sus: {
        responses: scores.length,
        mean: scores.length
          ? Math.round((scores.reduce((x, y) => x + y, 0) / scores.length) * 10) / 10
          : null,
        median: median(scores),
        min: scores.length ? Math.min(...scores) : null,
        max: scores.length ? Math.max(...scores) : null,
        bands: susBands,
      },
      bands,
      safety: safety.map((r) => ({ tier: r.tier, count: r.n })),
      languages: languages.map((r) => ({ language: r.language, count: r.n })),
    });
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
        'Email reports cannot be turned on in the pilot without an ethics approval reference.',
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
      const susScoresList = await susScores(database);
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
          { key: 'sus_responses', value: susScoresList.length },
          {
            key: 'sus_average',
            value: susScoresList.length
              ? Math.round(susScoresList.reduce((a, b) => a + b, 0) / susScoresList.length)
              : 0,
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

  const guide = Router();
  guide.use(requireAuth, requireRole('participant'));
  const generatedToday = new Map<string, { day: string; count: number }>();
  const GUIDE_DAILY_LIMIT = 20;

  // This is where a guide answer is made: the approved template first, then Gemini only when every gate allows it.
  // With prepare set, it runs right after a check-up so the answer is ready when the person opens the guide; it
  // does nothing (and logs nothing) when Gemini is not allowed for this person.
  const answerGuide = async (
    database: Db,
    userId: string,
    body: { assessmentId: string; chipId: string; language: 'en' | 'rw' },
    reqId: unknown,
    prepare = false,
  ) => {
    const started = Date.now();
    const row = await one<{ results: AssessmentResult; plan: Plan; safety: SafetyAssessment }>(
      database,
      'SELECT results, plan, safety FROM assessments WHERE id = $1 AND user_id = $2',
      [body.assessmentId, userId],
    );
    if (!row) throw notFound();
    const chipId = (GUIDE_CHIPS as readonly string[]).includes(body.chipId) ? body.chipId : 'overview';
    const content = BUNDLED_CONTENT[body.language];
    const answers = GUIDE_ANSWERS[body.language];
    const lookup = (id: string) => content.text[id] ?? answers[id] ?? id;
    const ownAnswers = new Set(
      row.results.ncd.flatMap((r) => [`ga.${r.domain}.${r.band}.why`, `ga.${r.domain}.${r.band}.tips`]),
    );
    const draft = composeGuideAnswer(chipId, row.results, row.plan, lookup);
    const allowed = allowedNumbers(row.results, row.plan, draft, [
      ruleset.domains.activity.meetsAt,
      ruleset.domains.diet.meetsAt,
      ...numbersIn(draft.paragraphs.map((p) => p.text).join(' ')),
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const usage = generatedToday.get(userId);
    const used = usage?.day === today ? usage.count : 0;
    const flags = await currentFlags(database, config);
    const aiConsent = await one<{ granted: boolean }>(
      database,
      "SELECT granted FROM consent_events WHERE user_id = $1 AND scope = 'ai_explanations' ORDER BY created_at DESC LIMIT 1",
      [userId],
    );
    const templatesOnly =
      !flags.guideGenerative ||
      !generativeGuideAllowed(config) ||
      aiConsent?.granted !== true ||
      row.plan.urgent !== null ||
      row.safety.tier !== null ||
      body.language === 'rw' ||
      used >= GUIDE_DAILY_LIMIT;
    if (prepare && templatesOnly) return null;

    let answer: GuideAnswer = draft as GuideAnswer;
    let source: 'generated' | 'template' = 'template';
    let outcome: string = templatesOnly ? 'templates_only' : 'error';
    let tokens: { inputTokens: number | null; outputTokens: number | null } = {
      inputTokens: null,
      outputTokens: null,
    };
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
        Object.entries({ ...content.text, ...answers }).filter(
          ([id]) =>
            ((id.startsWith('guide.') || id.startsWith('band.')) && !/^band\.(phq9|gad7)\./.test(id)) ||
            // Only the answers for this person's own results, so a generated answer cannot borrow another band's.
            ownAnswers.has(id),
        ),
      );
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
      generatedToday.set(userId, { day: today, count: used + 1 });
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
        logger.warn({ reqId, event: 'guide_error' }, 'guide');
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
    return {
      requestId: logRow?.id,
      source,
      paragraphs: answer.paragraphs,
      followUpChipIds: answer.followUpChipIds,
    };
  };

  guide.post('/explain', async (req, res) => {
    const body = GuideExplainRequest.parse(req.body);
    res.json(await answerGuide(needDb(), me(req).id, body, req.id));
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

  const emailReports = Router();
  emailReports.use(requireAuth, requireRole('participant'));
  const emailedToday = new Map<string, { day: string; count: number }>();
  const EMAIL_DAILY_LIMIT = 5;

  emailReports.get('/', async (req, res) => {
    const database = needDb();
    const consent = await one<{ granted: boolean }>(
      database,
      "SELECT granted FROM consent_events WHERE user_id = $1 AND scope = 'email_reports' ORDER BY created_at DESC LIMIT 1",
      [me(req).id],
    );
    const user = await one<{ email: string | null }>(database, 'SELECT email FROM users WHERE id = $1', [
      me(req).id,
    ]);
    const flags = await currentFlags(database, config);
    res.json({
      email: consent?.granted ?? false,
      available: flags.messaging && emailConfigured(config),
      hasEmail: Boolean(user?.email),
    });
  });

  emailReports.put('/', async (req, res) => {
    const database = needDb();
    const body = EmailReportPreference.parse(req.body);
    const user = await one<{ preferred_language: 'en' | 'rw'; email: string | null }>(
      database,
      'SELECT preferred_language, email FROM users WHERE id = $1',
      [me(req).id],
    );
    const flags = await currentFlags(database, config);
    if (body.email && !(flags.messaging && emailConfigured(config) && user?.email)) {
      throw new AppError(409, 'CONFLICT', 'Email reports are not available.');
    }
    await database.query(
      `INSERT INTO consent_events (user_id, scope, granted, consent_doc_version, language)
       VALUES ($1, 'email_reports', $2, 'email-reports-0.1.0', $3)`,
      [me(req).id, body.email, user?.preferred_language ?? 'en'],
    );
    res.json(body);
  });

  emailReports.post('/send', async (req, res) => {
    const database = needDb();
    const body = EmailReportSend.parse(req.body);
    const today = new Date().toISOString().slice(0, 10);
    const usage = emailedToday.get(me(req).id);
    const used = usage?.day === today ? usage.count : 0;
    if (used >= EMAIL_DAILY_LIMIT) throw new AppError(429, 'RATE_LIMITED', 'Too many emails today.');
    const status = await sendReportEmail(database, config, logger, fetchFn, me(req).id, body.assessmentId);
    if (status !== 'skipped') emailedToday.set(me(req).id, { day: today, count: used + 1 });
    if (status === 'skipped') throw new AppError(409, 'CONFLICT', 'Email reports are not available.');
    res.json({ status });
  });
  mount('/api/v1/participant/email-reports', emailReports);

  // This is where a participant switches WhatsApp notices on or off. The notice never holds results.
  const whatsapp = Router();
  whatsapp.use(requireAuth, requireRole('participant'));

  whatsapp.get('/', async (req, res) => {
    const database = needDb();
    const consent = await one<{ granted: boolean }>(
      database,
      "SELECT granted FROM consent_events WHERE user_id = $1 AND scope = 'whatsapp_notices' ORDER BY created_at DESC LIMIT 1",
      [me(req).id],
    );
    const user = await one<{ phone: string | null }>(database, 'SELECT phone FROM users WHERE id = $1', [
      me(req).id,
    ]);
    const flags = await currentFlags(database, config);
    res.json({
      whatsapp: consent?.granted ?? false,
      available: flags.messaging && whatsappConfigured(config),
      hasPhone: Boolean(user?.phone),
    });
  });

  whatsapp.put('/', async (req, res) => {
    const database = needDb();
    const body = WhatsAppPreference.parse(req.body);
    const user = await one<{ preferred_language: 'en' | 'rw'; phone: string | null }>(
      database,
      'SELECT preferred_language, phone FROM users WHERE id = $1',
      [me(req).id],
    );
    const flags = await currentFlags(database, config);
    if (body.whatsapp && !(flags.messaging && whatsappConfigured(config) && user?.phone)) {
      throw new AppError(409, 'CONFLICT', 'WhatsApp notices are not available.');
    }
    await database.query(
      `INSERT INTO consent_events (user_id, scope, granted, consent_doc_version, language)
       VALUES ($1, 'whatsapp_notices', $2, 'whatsapp-0.1.0', $3)`,
      [me(req).id, body.whatsapp, user?.preferred_language ?? 'en'],
    );
    res.json(body);
  });
  mount('/api/v1/participant/whatsapp', whatsapp);

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

// This is where the made-up demo accounts are created. It refuses to run in the pilot.
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

// This is where the command line starts: serve, migrate, seed or db-check.
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
