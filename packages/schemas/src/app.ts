// Request and response shapes for accounts, dashboards and CRUD (SRS v1.4, ADR-016). Shared by frontend and backend.
import { z } from 'zod';
import { Language, Sex } from './common.ts';
import { SafetyAction } from './safety.ts';

export const ROLES = ['participant', 'facilitator', 'researcher_admin', 'reviewer'] as const;
export const Role = z.enum(ROLES);
export type Role = z.infer<typeof Role>;
export const STAFF_ROLES = ['facilitator', 'researcher_admin', 'reviewer'] as const satisfies readonly Role[];

/** Turns "0788 123 456", "250788123456" or "+250788123456" into E.164 (+250788123456). Rwanda by default. */
export function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/[\s\-().]/g, '');
  let e164 = digits;
  if (/^0\d{9}$/.test(digits)) e164 = `+250${digits.slice(1)}`;
  else if (/^250\d{9}$/.test(digits)) e164 = `+${digits}`;
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}

export type Identifier = { kind: 'email'; value: string } | { kind: 'phone'; value: string };

/** An email address or a phone number, as typed on the sign-in and sign-up forms. */
export function parseIdentifier(raw: string): Identifier | null {
  const value = raw.trim();
  if (value.includes('@')) {
    const email = value.toLowerCase();
    return z.email().safeParse(email).success ? { kind: 'email', value: email } : null;
  }
  const phone = normalisePhone(value);
  return phone ? { kind: 'phone', value: phone } : null;
}

export const IdentifierInput = z
  .string()
  .trim()
  .min(3)
  .max(120)
  .refine((v) => parseIdentifier(v) !== null, { message: 'identifier' });

export const Password = z.string().min(8, 'password_short').max(128);
const DisplayName = z.string().trim().min(1).max(80);

export const SignupRequest = z.strictObject({
  role: Role,
  identifier: IdentifierInput,
  password: Password,
  displayName: DisplayName.optional(),
  preferredLanguage: Language,
});
export type SignupRequest = z.infer<typeof SignupRequest>;

export const LoginRequest = z.strictObject({
  identifier: IdentifierInput,
  password: z.string().min(1).max(128),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export const Me = z.strictObject({
  id: z.uuid(),
  role: Role,
  email: z.string().nullable(),
  phone: z.string().nullable(),
  displayName: z.string().nullable(),
  preferredLanguage: Language,
  hasPassword: z.boolean(),
  hasGoogle: z.boolean(),
  createdAt: z.string(),
});
export type Me = z.infer<typeof Me>;

export const UpdateMeRequest = z.strictObject({
  displayName: DisplayName.nullable().optional(),
  email: z.email().nullable().optional(),
  phone: z
    .string()
    .refine((v) => normalisePhone(v) !== null, { message: 'phone' })
    .nullable()
    .optional(),
  preferredLanguage: Language.optional(),
});
export type UpdateMeRequest = z.infer<typeof UpdateMeRequest>;

export const ChangePasswordRequest = z.strictObject({
  currentPassword: z.string().max(128).optional(),
  newPassword: Password,
});

export const ParticipantProfile = z.strictObject({
  ageBand: z.enum(['18-24', '25-29', '30-35']).nullable(),
  sex: Sex,
  districtBand: z
    .string()
    .regex(/^[a-z_]{2,40}$/)
    .nullable(),
});
export type ParticipantProfile = z.infer<typeof ParticipantProfile>;

const maybe = <T extends z.ZodType>(schema: T) => schema.nullable().optional();

/** A check-up as the form sends it. Null or absent means "skipped" (FR-05). Ranges are checked by @rinda/rules. */
export const CheckupAnswers = z.strictObject({
  tobaccoUse: maybe(z.boolean()),
  auditC: z.tuple([
    maybe(z.number().int().min(0).max(4)),
    maybe(z.number().int().min(0).max(4)),
    maybe(z.number().int().min(0).max(4)),
  ]),
  moderateMinutes: maybe(z.number().finite()),
  vigorousMinutes: maybe(z.number().finite()),
  servingsPerDay: maybe(z.number().finite()),
  addsSaltAtTable: maybe(z.boolean()),
  heightCm: maybe(z.number().finite()),
  weightKg: maybe(z.number().finite()),
  waistCm: maybe(z.number().finite()),
  systolic: maybe(z.number().finite()),
  diastolic: maybe(z.number().finite()),
  measurementSource: z.enum(['in_session', 'recalled']),
});
export type CheckupAnswers = z.infer<typeof CheckupAnswers>;

export const CheckupSubmission = z.strictObject({
  language: Language,
  startedAt: z.iso.datetime(),
  answers: CheckupAnswers,
});
export type CheckupSubmission = z.infer<typeof CheckupSubmission>;

export const SessionCreateRequest = z.strictObject({
  participantId: z.uuid(),
  deviceLabel: z.string().trim().max(40).optional(),
});

export const TASK_CODES = [
  'signin',
  'consent',
  'questionnaire',
  'measurements',
  'results',
  'get_help',
] as const;
export const TaskResultRequest = z.strictObject({
  outcome: z.enum(['completed', 'completed_with_help', 'not_completed']),
  durationSeconds: z.number().int().min(0).max(86_400),
});

export const FacilitatorSafetyEventRequest = z.strictObject({
  participantId: z.uuid(),
  tier: z.union([z.literal(2), z.literal(3)]),
  triggerType: z.enum(['observed', 'disclosed']),
  actions: z.array(SafetyAction).max(9),
  supervisorInformedAt: z.iso.datetime().optional(),
});

export const AdminCreateUserRequest = z.strictObject({
  role: Role,
  identifier: IdentifierInput,
  password: Password,
  displayName: DisplayName.optional(),
});

export const AdminUpdateUserRequest = z.strictObject({
  role: Role.optional(),
  active: z.boolean().optional(),
  displayName: DisplayName.nullable().optional(),
});

export const CONTENT_TYPES = [
  'questionnaire',
  'ruleset',
  'recommendation',
  'referral_list',
  'consent_doc',
  'feedback_form',
  'guide_chips',
  'band_labels',
  'safety',
  'general',
] as const;

export const ContentCreateRequest = z.strictObject({
  type: z.enum(CONTENT_TYPES),
  key: z.string().regex(/^[a-z0-9-]{1,60}$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  language: z.enum(['', 'en', 'rw']),
  body: z.record(z.string(), z.unknown()),
});

export const ContentUpdateRequest = z.strictObject({
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/)
    .optional(),
  body: z.record(z.string(), z.unknown()).optional(),
});

export const ApprovalRequest = z.strictObject({
  decision: z.enum(['approved', 'changes_requested']),
  notes: z.string().trim().max(500).optional(),
});

/** "Was this helpful?" for a guide answer: two buttons, no free text (AI_GUIDE.md). */
export const GuideFeedbackRequest = z.strictObject({ requestId: z.uuid(), helpful: z.boolean() });

/** Opt-in for WhatsApp notices that a check-up summary is ready. The message never contains results (ADR-020). */
export const MessagingPreference = z.strictObject({ whatsapp: z.boolean() });
export type MessagingPreference = z.infer<typeof MessagingPreference>;

/** Separate opt-in for AI-written explanations (consent scope ai_explanations, ADR-019). */
export const AiPreference = z.strictObject({ ai: z.boolean() });
export type AiPreference = z.infer<typeof AiPreference>;
