import { z } from 'zod';

export const LANGUAGES = ['en', 'rw'] as const;
export type Language = (typeof LANGUAGES)[number];

export const CONTENT_ID = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/;
export const TODO_MARKER = 'TODO(content)';

const header = {
  contentType: z.string().min(1),
  key: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  language: z.enum(LANGUAGES),
  status: z.enum(['draft', 'in_review', 'published', 'retired']),
  reviewers: z.array(
    z.enum(['supervisor', 'clinical', 'mental_health', 'language', 'community', 'researcher_admin']),
  ),
};

export const TextContentSchema = z.strictObject({
  ...header,
  entries: z.record(z.string().regex(CONTENT_ID), z.string().min(1)),
});
export type TextContent = z.infer<typeof TextContentSchema>;

export const ReferralEntrySchema = z.strictObject({
  id: z.string().regex(CONTENT_ID),
  phone: z.string().regex(/^\d{3,10}$/),
  type: z.enum([
    'emergency',
    'ambulance',
    'health_hotline',
    'support_line',
    'health_centre',
    'one_stop_centre',
    'counselling',
  ]),
  name: z.string().min(1),
  hours: z.string().min(1),
  verifiedOn: z.iso.date().nullable(),
  verifiedBy: z.string().nullable(),
});
export type ReferralEntry = z.infer<typeof ReferralEntrySchema>;

export const ReferralListSchema = z.strictObject({
  ...header,
  entries: z.array(ReferralEntrySchema).min(1),
});
export type ReferralList = z.infer<typeof ReferralListSchema>;
