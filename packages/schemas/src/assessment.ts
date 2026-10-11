import { z } from 'zod';
import { Domain, Language, Missingness, NcdDomain, OptionCode, Severity } from './common.ts';

export const QuestionCode = z.string().regex(/^q\.[a-z0-9_]+(\.[a-z0-9_]+)*$/);

export const ResponseItem = z.union([
  z.strictObject({
    questionCode: QuestionCode,
    value: z.union([z.number().finite(), z.boolean(), OptionCode]),
  }),
  z.strictObject({ questionCode: QuestionCode, missing: Missingness }),
]);

const UNITS = { height: 'cm', weight: 'kg', waist: 'cm', systolic: 'mmHg', diastolic: 'mmHg' } as const;

export const Measurement = z
  .strictObject({
    type: z.enum(['height', 'weight', 'waist', 'systolic', 'diastolic']),
    value: z.number().finite(),
    unit: z.enum(['cm', 'kg', 'mmHg']),
    source: z.enum(['in_session', 'recalled']),
    measuredOn: z.iso.date(),
    rechecked: z.boolean(),
  })
  .refine((m) => UNITS[m.type] === m.unit, {
    message: 'Unit does not match the measurement type',
    path: ['unit'],
  });

export const AssessmentSubmission = z
  .strictObject({
    questionnaireVersionId: z.uuid(),
    rulesetVersionId: z.uuid(),
    language: Language,
    startedAt: z.iso.datetime(),
    submittedAt: z.iso.datetime(),
    responses: z.array(ResponseItem).max(200),
    measurements: z.array(Measurement).max(5),
    clientResultHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .refine((a) => new Set(a.responses.map((r) => r.questionCode)).size === a.responses.length, {
    message: 'Each question appears once',
    path: ['responses'],
  })
  .refine((a) => new Set(a.measurements.map((m) => m.type)).size === a.measurements.length, {
    message: 'Each measurement type appears once',
    path: ['measurements'],
  });
export type AssessmentSubmission = z.infer<typeof AssessmentSubmission>;

export const DomainResult = z.strictObject({
  domain: Domain,
  band: z.string(),
  severity: Severity,
  value: z.number().nullable(),
  completeness: z.enum(['complete', 'partial', 'none']),
  contributingFactors: z.array(z.string()),
  ruleId: z.string(),
  source: z.string(),
  rulesetVersion: z.string(),
});

const PlanTarget = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('activity_split'), minutesPerDay: z.number(), days: z.number() }),
  z.strictObject({ kind: z.literal('activity_week'), minutes: z.number() }),
  z.strictObject({ kind: z.literal('diet_servings'), servings: z.number() }),
]);

const FocusArea = z.strictObject({
  id: z.string(),
  domains: z.array(NcdDomain),
  reasons: z.array(z.string()),
  recommendationId: z.string(),
  target: PlanTarget.nullable(),
});

export const Plan = z.strictObject({
  rulesetVersion: z.string(),
  urgent: z.strictObject({ domain: NcdDomain, contentId: z.string() }).nullable(),
  focus: z.array(FocusArea),
  other: z.array(FocusArea),
  keepGoingId: z.string().nullable(),
});

export const AssessmentSubmissionResponse = z.strictObject({
  assessmentId: z.uuid(),
  results: z.strictObject({ ncd: z.array(DomainResult), wellness: z.array(DomainResult) }),
  plan: Plan,
  rulesetVersion: z.string(),
  resultMismatch: z.boolean(),
});
export type AssessmentSubmissionResponse = z.infer<typeof AssessmentSubmissionResponse>;
