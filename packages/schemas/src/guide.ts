// Rinda Guide payloads (FR-36, docs/AI_GUIDE.md). Chips only, no text box (C-06).
import { NCD_DOMAINS } from '@rinda/rules';
import { z } from 'zod';
import { Language } from './common.ts';

const MEASURED = ['bp', 'waist', 'bmi'] as const;
export const CHIP_IDS = [
  'overview',
  'first_step',
  'plan_week',
  ...NCD_DOMAINS.map((d) => `explain.${d}` as const),
  ...NCD_DOMAINS.map((d) => `why_matters.${d}` as const),
  ...MEASURED.map((d) => `measure_better.${d}` as const),
] as const;
export const ChipId = z.enum(CHIP_IDS);
export type ChipId = z.infer<typeof ChipId>;

export const GuideExplainRequest = z.strictObject({
  assessmentId: z.uuid(),
  chipId: ChipId,
  language: Language,
});

/** Hand-written JSON Schema for structured output: every object needs additionalProperties: false. */
export const GUIDE_ANSWER_JSON_SCHEMA = {
  type: 'object',
  properties: {
    paragraphs: {
      type: 'array',
      items: {
        type: 'object',
        properties: { text: { type: 'string' }, sourceIds: { type: 'array', items: { type: 'string' } } },
        required: ['text', 'sourceIds'],
        additionalProperties: false,
      },
    },
    followUpChipIds: { type: 'array', items: { type: 'string', enum: CHIP_IDS } },
  },
  required: ['paragraphs', 'followUpChipIds'],
  additionalProperties: false,
} as const;

/** Zod twin for runtime checks the JSON Schema cannot express (lengths, counts). */
export const GuideAnswer = z.strictObject({
  paragraphs: z
    .array(z.strictObject({ text: z.string().max(600), sourceIds: z.array(z.string()).min(1) }))
    .min(1)
    .max(4),
  followUpChipIds: z.array(ChipId).max(3),
});
export type GuideAnswer = z.infer<typeof GuideAnswer>;

export const GuideExplainResponse = GuideAnswer.extend({ source: z.enum(['generated', 'template']) });
