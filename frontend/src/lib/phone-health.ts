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

// Workouts the WHO activity guidance treats as vigorous. Everything else counts as moderate,
// except the calm ones below, which are not counted as exercise at all.
const VIGOROUS: ReadonlySet<string> = new Set([
  'running',
  'runningTreadmill',
  'highIntensityIntervalTraining',
  'soccer',
  'basketball',
  'rugby',
  'americanFootball',
  'australianFootball',
  'handball',
  'hockey',
  'iceHockey',
  'lacrosse',
  'tennis',
  'squash',
  'racquetball',
  'boxing',
  'kickboxing',
  'martialArts',
  'jumpRope',
  'rowing',
  'rowingMachine',
  'swimming',
  'swimmingPool',
  'swimmingOpenWater',
  'waterPolo',
  'stairClimbing',
  'stairClimbingMachine',
  'stairs',
  'crossCountrySkiing',
  'burpee',
  'bootCamp',
]);
const NOT_EXERCISE: ReadonlySet<string> = new Set([
  'meditation',
  'guidedBreathing',
  'mindAndBody',
  'preparationAndRecovery',
  'transition',
  'cooldown',
  'fishing',
  'hunting',
  'sailing',
]);

export interface PhoneWorkout {
  workoutType: string;
  duration: number;
}

export interface PhoneActivity {
  moderate: number;
  vigorous: number;
  sessions: number;
}

export function summariseWorkouts(workouts: readonly PhoneWorkout[]): PhoneActivity {
  let moderate = 0;
  let vigorous = 0;
  let sessions = 0;
  for (const w of workouts) {
    const minutes = w.duration / 60;
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1_440 || NOT_EXERCISE.has(w.workoutType))
      continue;
    sessions += 1;
    if (VIGOROUS.has(w.workoutType)) vigorous += minutes;
    else moderate += minutes;
  }
  return { moderate: Math.round(moderate), vigorous: Math.round(vigorous), sessions };
}

interface Dated {
  value: number;
  day: string;
}

export interface PhoneCheckup {
  bloodPressure: { systolic: number; diastolic: number | null; day: string } | null;
  weight: Dated | null;
  height: Dated | null;
  restingHeartRate: Dated | null;
  activity: PhoneActivity | null;
  steps: number | null;
}

export interface PhoneFill {
  answers: {
    systolic?: number;
    diastolic?: number | null;
    weightKg?: number;
    heightCm?: number;
    moderateMinutes?: number;
    vigorousMinutes?: number;
    measurementSource?: 'recalled';
  };
  filled: number;
}

// This is where readings from the phone become check-up answers. Exercise is only filled when
// the phone has at least one session, because "no sessions" usually means nothing was logged.
export function phoneAnswers(data: PhoneCheckup, today: string): PhoneFill {
  const answers: PhoneFill['answers'] = {};
  const bp = data.bloodPressure;
  if (bp) {
    answers.systolic = Math.round(bp.systolic);
    answers.diastolic = bp.diastolic === null ? null : Math.round(bp.diastolic);
  }
  if (data.weight) answers.weightKg = Math.round(data.weight.value * 10) / 10;
  if (data.height) answers.heightCm = Math.round(data.height.value * 10) / 10;
  if (data.activity && data.activity.sessions > 0) {
    answers.moderateMinutes = data.activity.moderate;
    answers.vigorousMinutes = data.activity.vigorous;
  }
  const measured = [bp?.day, data.weight?.day, data.height?.day].filter((d): d is string => Boolean(d));
  if (measured.some((d) => d !== today)) answers.measurementSource = 'recalled';
  const filled = Object.keys(answers).filter((k) => k !== 'measurementSource').length;
  return { answers, filled };
}

const latestOf = (readings: PhoneHealthReading[]) => readings.at(-1) ?? null;

export async function readCheckupFromPhone(): Promise<PhoneCheckup> {
  const { Health } = await import('@capgo/capacitor-health');
  const availability = await Health.isAvailable();
  if (!availability.available) throw new Error(availability.reason ?? 'unavailable');
  const platform = availability.platform === 'ios' ? 'ios' : 'android';
  const types = PHONE_HEALTH_TYPES.filter((t) => platform === 'ios' || t !== 'exerciseTime');
  // One permission screen covers this fill and the daily summaries saved afterwards.
  await Health.requestAuthorization({ read: [...types, 'workouts'], write: [] });
  const now = Date.now();
  const endDate = new Date(now).toISOString();
  const monthAgo = new Date(now - 30 * 86_400_000).toISOString();
  const weekAgo = new Date(now - 7 * 86_400_000).toISOString();

  const latest = async (type: PhoneHealthType) => {
    try {
      const { samples } = await Health.readSamples({
        dataType: type,
        startDate: monthAgo,
        endDate,
        limit: 500,
      });
      return latestOf(summariseSamples(type, samples));
    } catch {
      return null;
    }
  };

  const [bp, weight, height, resting] = await Promise.all([
    latest('bloodPressure'),
    latest('weight'),
    latest('height'),
    latest('restingHeartRate'),
  ]);

  let activity: PhoneActivity | null = null;
  try {
    const { workouts } = await Health.queryWorkouts({ startDate: weekAgo, endDate, limit: 200 });
    activity = summariseWorkouts(workouts);
  } catch {
    activity = null;
  }

  let steps: number | null = null;
  try {
    const { samples } = await Health.queryAggregated({
      dataType: 'steps',
      startDate: weekAgo,
      endDate,
      bucket: 'day',
      aggregation: ['sum'],
    });
    const total = samples.reduce((sum, s) => sum + (s.values?.sum ?? s.value ?? 0), 0);
    steps = total > 0 ? Math.round(total) : null;
  } catch {
    steps = null;
  }

  return {
    bloodPressure: bp ? { systolic: bp.value, diastolic: bp.value2, day: bp.day } : null,
    weight: weight ? { value: weight.value, day: weight.day } : null,
    height: height ? { value: height.value, day: height.day } : null,
    restingHeartRate: resting ? { value: resting.value, day: resting.day } : null,
    activity,
    steps,
  };
}

export async function openPhoneHealthSettings(): Promise<void> {
  const { Health } = await import('@capgo/capacitor-health');
  await Health.openHealthConnectSettings().catch(() => undefined);
}
