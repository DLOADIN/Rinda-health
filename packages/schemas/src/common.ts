import { DOMAINS, NCD_DOMAINS, SEVERITIES } from '@rinda/rules';
import { z } from 'zod';

export const Language = z.enum(['en', 'rw']);
export const Sex = z.enum(['female', 'male', 'not_stated']);
export const Missingness = z.enum(['SKIPPED', 'MODULE_DECLINED', 'DONT_KNOW', 'NOT_APPLICABLE']);
export const Domain = z.enum(DOMAINS);
export const NcdDomain = z.enum(NCD_DOMAINS);
export const Severity = z.enum(SEVERITIES);

/** Unambiguous characters only (no 0/O, 1/I/L): FR-26. Synthetic codes start with DEMO- (docs/TESTING.md). */
export const STUDY_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const StudyCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(new RegExp(`^(DEMO-)?[${STUDY_CODE_ALPHABET}]{8,12}$`), 'Study code format');

export const Pin = z.string().regex(/^\d{4,6}$/, 'PIN is 4 to 6 digits');

/** Option codes are short machine codes, never display text, so no free text can reach the server (C-06). */
export const OptionCode = z.string().regex(/^[a-z0-9_]{1,40}$/);

export const ErrorCode = z.enum([
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'RATE_LIMITED',
  'LOCKED',
  'IDEMPOTENCY_KEY_REQUIRED',
  'IDEMPOTENCY_MISMATCH',
  'CONFLICT',
  'CONSENT_REQUIRED',
  'FLAG_GUARD',
  'INVALID_CREDENTIALS',
  'ALREADY_EXISTS',
  'DB_UNAVAILABLE',
  'NOT_CONFIGURED',
  'INTERNAL',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

/** Error envelope. `message` is plain words and never echoes a submitted value. */
export const ErrorResponse = z.strictObject({
  error: z.strictObject({
    code: ErrorCode,
    message: z.string(),
    details: z.array(z.strictObject({ path: z.string(), issue: z.string() })).optional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponse>;

export const HealthResponse = z.strictObject({ status: z.literal('ok'), version: z.string() });
