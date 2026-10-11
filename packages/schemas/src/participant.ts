import { z } from 'zod';
import { Language, Pin, Sex, StudyCode } from './common.ts';

export const ParticipantSignInRequest = z.strictObject({ studyCode: StudyCode, pin: Pin });
export type ParticipantSignInRequest = z.infer<typeof ParticipantSignInRequest>;

export const ParticipantSignInResponse = z.strictObject({
  accessToken: z.string(),
  expiresInSeconds: z.number().int().positive(),
  participant: z.strictObject({ orderAssignment: z.enum(['AB', 'BA']), hasPin: z.literal(true) }),
});
export type ParticipantSignInResponse = z.infer<typeof ParticipantSignInResponse>;

export const AgeBand = z.enum(['18-24', '25-29', '30-35']);

export const ProfileRequest = z.strictObject({
  ageBand: AgeBand,
  sex: Sex,
  districtBand: z.string().regex(/^[a-z_]{2,40}$/),
  educationBand: z
    .string()
    .regex(/^[a-z_]{2,40}$/)
    .optional(),
  deviceType: z.enum(['study_phone', 'own_phone']).optional(),
  preferredLanguage: Language,
});
export type ProfileRequest = z.infer<typeof ProfileRequest>;

export const ConsentScope = z.enum(['core', 'mental_wellness', 'audio', 'follow_up', 'ai_explanations']);

export const ConsentEventRequest = z.strictObject({
  scope: ConsentScope,
  granted: z.boolean(),
  consentDocVersionId: z.uuid(),
  language: Language,
});

export const ConsentsRequest = z.strictObject({ events: z.array(ConsentEventRequest).min(1).max(5) });
export type ConsentsRequest = z.infer<typeof ConsentsRequest>;
