// Safety events (FR-13, FR-41; docs/SAFETY.md). No answer, score, band or free-text field exists,
// and strictObject rejects any extra key, which is what keeps responses out of safety records.
import { z } from 'zod';

export const SafetyAction = z.enum([
  'safety_screen_shown',
  'referral_list_shown',
  'facilitator_checkin',
  'warm_handover_offered',
  'warm_handover_done',
  'called_912',
  'called_112',
  'oncall_contacted',
  'supervisor_informed',
]);

export const SafetyEvent = z.strictObject({
  id: z.uuid(), // generated on the phone (idempotent sync)
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  triggerType: z.enum(['item9', 'score_threshold', 'observed', 'disclosed']),
  actions: z.array(SafetyAction),
  occurredAt: z.iso.datetime(),
  recordedByRole: z.enum(['system', 'facilitator']),
  supervisorInformedAt: z.iso.datetime().optional(), // Tier 3
});
export type SafetyEvent = z.infer<typeof SafetyEvent>;
