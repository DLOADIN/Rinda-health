// Safety events never hold answers or scores; the strict schema refuses any extra field.
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
  id: z.uuid(),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  triggerType: z.enum(['item9', 'score_threshold', 'observed', 'disclosed']),
  actions: z.array(SafetyAction),
  occurredAt: z.iso.datetime(),
  recordedByRole: z.enum(['system', 'facilitator']),
  supervisorInformedAt: z.iso.datetime().optional(),
});
export type SafetyEvent = z.infer<typeof SafetyEvent>;
