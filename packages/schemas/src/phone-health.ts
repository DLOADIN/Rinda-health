import { z } from 'zod';

export const PHONE_HEALTH_TYPES = [
  'steps',
  'distance',
  'calories',
  'exerciseTime',
  'flightsClimbed',
  'heartRate',
  'restingHeartRate',
  'heartRateVariability',
  'bloodPressure',
  'oxygenSaturation',
  'respiratoryRate',
  'weight',
  'height',
  'bodyFat',
  'bodyTemperature',
  'bloodGlucose',
  'sleep',
] as const;
export const PhoneHealthType = z.enum(PHONE_HEALTH_TYPES);
export type PhoneHealthType = z.infer<typeof PhoneHealthType>;

export const PHONE_HEALTH_RANGES: Record<PhoneHealthType, readonly [number, number]> = {
  steps: [0, 100_000],
  distance: [0, 200_000],
  calories: [0, 20_000],
  exerciseTime: [0, 1_440],
  flightsClimbed: [0, 1_000],
  heartRate: [20, 250],
  restingHeartRate: [20, 200],
  heartRateVariability: [1, 500],
  bloodPressure: [50, 300],
  oxygenSaturation: [50, 100],
  respiratoryRate: [4, 80],
  weight: [20, 400],
  height: [80, 250],
  bodyFat: [1, 80],
  bodyTemperature: [30, 45],
  bloodGlucose: [20, 900],
  sleep: [0, 1_440],
};

const finite = z.number().finite();

export const PhoneHealthReading = z
  .strictObject({
    type: PhoneHealthType,
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    value: finite,
    value2: finite.nullable(),
    min: finite.nullable(),
    max: finite.nullable(),
    unit: z.string().min(1).max(20),
  })
  .refine((r) => r.value >= PHONE_HEALTH_RANGES[r.type][0] && r.value <= PHONE_HEALTH_RANGES[r.type][1], {
    message: 'Value outside the plausible range',
  });
export type PhoneHealthReading = z.infer<typeof PhoneHealthReading>;

export const PhoneHealthUpload = z.strictObject({
  platform: z.enum(['ios', 'android']),
  readings: z.array(PhoneHealthReading).max(1_000),
});
export type PhoneHealthUpload = z.infer<typeof PhoneHealthUpload>;

export const PhoneHealthShare = z.strictObject({ share: z.boolean() });
export type PhoneHealthShare = z.infer<typeof PhoneHealthShare>;

export interface PhoneHealthStatus {
  available: boolean;
  share: boolean;
  lastSync: string | null;
  readings: Array<PhoneHealthReading & { platform: 'ios' | 'android' }>;
}
