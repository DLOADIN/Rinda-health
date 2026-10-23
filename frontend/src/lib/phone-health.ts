import {
  PHONE_HEALTH_RANGES,
  PHONE_HEALTH_TYPES,
  type PhoneHealthReading,
  type PhoneHealthType,
  type PhoneHealthUpload,
} from '@rinda/schemas';

export interface RawSample {
  value: number;
  unit: string;
  startDate: string;
  systolic?: number;
  diastolic?: number;
}

export interface RawAggregate {
  startDate: string;
  value: number;
  unit: string;
  values?: Partial<Record<'sum' | 'average' | 'min' | 'max', number>>;
}

const SUM: ReadonlySet<PhoneHealthType> = new Set([
  'steps',
  'distance',
  'calories',
  'exerciseTime',
  'flightsClimbed',
  'sleep',
]);
const AGGREGATE: Partial<Record<PhoneHealthType, Array<'sum' | 'average' | 'min' | 'max'>>> = {
  steps: ['sum'],
  distance: ['sum'],
  calories: ['sum'],
  heartRate: ['average', 'min', 'max'],
};

export const isNativeApp = (): boolean =>
  Boolean((window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());

const dayOf = (iso: string) => new Date(iso).toLocaleDateString('en-CA');
const round = (v: number) => Math.round(v * 100) / 100;
const plausible = (type: PhoneHealthType, v: number) =>
  Number.isFinite(v) && v >= PHONE_HEALTH_RANGES[type][0] && v <= PHONE_HEALTH_RANGES[type][1];

export function summariseSamples(type: PhoneHealthType, samples: readonly RawSample[]): PhoneHealthReading[] {
  const byDay = new Map<string, RawSample[]>();
  for (const s of samples) {
    const value = type === 'bloodPressure' ? (s.systolic ?? s.value) : s.value;
    if (!plausible(type, value)) continue;
    const day = dayOf(s.startDate);
    byDay.set(day, [...(byDay.get(day) ?? []), s]);
  }
  const out: PhoneHealthReading[] = [];
  for (const [day, list] of byDay) {
    const unit = list[0]?.unit ?? '';
    if (SUM.has(type)) {
      const total = list.reduce((a, s) => a + s.value, 0);
      if (plausible(type, total))
        out.push({ type, day, value: round(total), value2: null, min: null, max: null, unit });
      continue;
    }
    if (type === 'heartRate') {
      const values = list.map((s) => s.value);
      const avg = values.reduce((a, v) => a + v, 0) / values.length;
      out.push({
        type,
        day,
        value: round(avg),
        value2: null,
        min: Math.min(...values),
        max: Math.max(...values),
        unit,
      });
      continue;
    }
    const latest = [...list].sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
    if (!latest) continue;
    if (type === 'bloodPressure') {
      const sys = latest.systolic ?? latest.value;
      const dia = latest.diastolic ?? null;
      out.push({
        type,
        day,
        value: round(sys),
        value2: dia === null ? null : round(dia),
        min: null,
        max: null,
        unit: unit || 'mmHg',
      });
      continue;
    }
    out.push({ type, day, value: round(latest.value), value2: null, min: null, max: null, unit });
  }
  return out.sort((a, b) => a.day.localeCompare(b.day));
}

export function summariseAggregates(
  type: PhoneHealthType,
  buckets: readonly RawAggregate[],
): PhoneHealthReading[] {
  const out: PhoneHealthReading[] = [];
  for (const b of buckets) {
    const value = type === 'heartRate' ? (b.values?.average ?? b.value) : (b.values?.sum ?? b.value);
    if (!plausible(type, value) || (SUM.has(type) && value === 0)) continue;
    out.push({
      type,
      day: dayOf(b.startDate),
      value: round(value),
      value2: null,
      min: type === 'heartRate' ? (b.values?.min ?? null) : null,
      max: type === 'heartRate' ? (b.values?.max ?? null) : null,
      unit: b.unit,
    });
  }
  return out;
}

export async function readPhoneHealth(days = 30): Promise<PhoneHealthUpload> {
  const { Health } = await import('@capgo/capacitor-health');
  const availability = await Health.isAvailable();
  if (!availability.available) throw new Error(availability.reason ?? 'unavailable');
  const platform = availability.platform === 'ios' ? 'ios' : 'android';
  const types = PHONE_HEALTH_TYPES.filter((t) => platform === 'ios' || t !== 'exerciseTime');
  await Health.requestAuthorization({ read: [...types], write: [] });
  const endDate = new Date().toISOString();
  const startDate = new Date(Date.now() - days * 86_400_000).toISOString();
  const readings: PhoneHealthReading[] = [];
  for (const type of types) {
    try {
      const aggregation = AGGREGATE[type];
      if (aggregation) {
        const { samples } = await Health.queryAggregated({
          dataType: type,
          startDate,
          endDate,
          bucket: 'day',
          aggregation,
        });
        readings.push(...summariseAggregates(type, samples));
      } else {
        const { samples } = await Health.readSamples({ dataType: type, startDate, endDate, limit: 1_000 });
        readings.push(...summariseSamples(type, samples));
      }
    } catch {
      continue;
    }
  }
  return { platform, readings };
}

export async function openPhoneHealthSettings(): Promise<void> {
  const { Health } = await import('@capgo/capacitor-health');
  await Health.openHealthConnectSettings().catch(() => undefined);
}
