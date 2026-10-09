// Feature flags (FR-50; docs/FEATURES.md "Pilot profile"). GET /api/v1/flags returns only these booleans.
import { z } from 'zod';

export const FLAG_KEYS = [
  'offlineSync',
  'guideDeterministic',
  'guideGenerative',
  'measurementCoach',
  'progressTrends',
  'whatIf',
  'careNavigator',
  'careGeolocation',
  'clinicCard',
  'sharedDeviceMode',
  'readAloud',
  'usabilityEvents',
  'pilotInsights',
  'messaging',
] as const;
export const FlagKey = z.enum(FLAG_KEYS);
export type FlagKey = z.infer<typeof FlagKey>;

export const FlagsResponse = z.strictObject(
  Object.fromEntries(FLAG_KEYS.map((k) => [k, z.boolean()])) as Record<FlagKey, z.ZodBoolean>,
);
export type Flags = z.infer<typeof FlagsResponse>;

export const FlagUpdateRequest = z.strictObject({ enabled: z.boolean() });
