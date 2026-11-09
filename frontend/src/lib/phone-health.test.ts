import { describe, expect, it } from 'vitest';
import {
  phoneAnswers,
  summariseAggregates,
  summariseSamples,
  summariseWorkouts,
  type PhoneCheckup,
} from '@/lib/phone-health';

const at = (day: string, hour: number) =>
  new Date(`${day}T${String(hour).padStart(2, '0')}:00:00`).toISOString();

describe('summariseSamples', () => {
  it('adds up running totals per day', () => {
    const r = summariseSamples('sleep', [
      { value: 300, unit: 'minute', startDate: at('2026-10-20', 1) },
      { value: 120, unit: 'minute', startDate: at('2026-10-20', 7) },
      { value: 400, unit: 'minute', startDate: at('2026-10-21', 1) },
    ]);
    expect(r.map((x) => [x.day, x.value])).toEqual([
      ['2026-10-20', 420],
      ['2026-10-21', 400],
    ]);
  });

  it('keeps the day average, lowest and highest heart rate', () => {
    const [r] = summariseSamples('heartRate', [
      { value: 60, unit: 'bpm', startDate: at('2026-10-20', 6) },
      { value: 90, unit: 'bpm', startDate: at('2026-10-20', 12) },
      { value: 120, unit: 'bpm', startDate: at('2026-10-20', 18) },
    ]);
    expect(r).toMatchObject({ value: 90, min: 60, max: 120, unit: 'bpm' });
  });

  it('keeps the latest blood pressure of the day as systolic over diastolic', () => {
    const [r] = summariseSamples('bloodPressure', [
      { value: 0, systolic: 130, diastolic: 85, unit: 'mmHg', startDate: at('2026-10-20', 8) },
      { value: 0, systolic: 118, diastolic: 76, unit: 'mmHg', startDate: at('2026-10-20', 20) },
    ]);
    expect(r).toMatchObject({ value: 118, value2: 76, unit: 'mmHg' });
  });

  it('drops values no real reading could have', () => {
    expect(
      summariseSamples('weight', [{ value: 4000, unit: 'kilogram', startDate: at('2026-10-20', 8) }]),
    ).toEqual([]);
  });
});

describe('summariseAggregates', () => {
  it('uses the phone’s own daily totals and averages, and skips empty days', () => {
    const steps = summariseAggregates('steps', [
      { startDate: at('2026-10-20', 0), value: 6400, unit: 'count', values: { sum: 6400 } },
      { startDate: at('2026-10-21', 0), value: 0, unit: 'count', values: { sum: 0 } },
    ]);
    expect(steps).toHaveLength(1);
    const [hr] = summariseAggregates('heartRate', [
      {
        startDate: at('2026-10-20', 0),
        value: 71,
        unit: 'bpm',
        values: { average: 71.456, min: 52, max: 140 },
      },
    ]);
    expect(hr).toMatchObject({ value: 71.46, min: 52, max: 140 });
  });
});

describe('summariseWorkouts', () => {
  it('sorts a week of workouts into moderate and vigorous minutes', () => {
    expect(
      summariseWorkouts([
        { workoutType: 'walking', duration: 40 * 60 },
        { workoutType: 'running', duration: 30 * 60 },
        { workoutType: 'soccer', duration: 45 * 60 },
        { workoutType: 'yoga', duration: 20 * 60 },
      ]),
    ).toEqual({ moderate: 60, vigorous: 75, sessions: 4 });
  });

  it('leaves out calm sessions and impossible durations', () => {
    expect(
      summariseWorkouts([
        { workoutType: 'meditation', duration: 15 * 60 },
        { workoutType: 'walking', duration: -5 },
        { workoutType: 'cycling', duration: 2 * 24 * 3600 },
      ]),
    ).toEqual({ moderate: 0, vigorous: 0, sessions: 0 });
  });
});

describe('phoneAnswers', () => {
  const empty: PhoneCheckup = {
    bloodPressure: null,
    weight: null,
    height: null,
    restingHeartRate: null,
    activity: null,
    steps: null,
  };

  it('fills blood pressure, body size and exercise from the phone', () => {
    const r = phoneAnswers(
      {
        ...empty,
        bloodPressure: { systolic: 128, diastolic: 82, day: '2026-11-09' },
        weight: { value: 72.04, day: '2026-11-09' },
        height: { value: 175, day: '2026-11-09' },
        activity: { moderate: 40, vigorous: 75, sessions: 3 },
      },
      '2026-11-09',
    );
    expect(r.answers).toEqual({
      systolic: 128,
      diastolic: 82,
      weightKg: 72,
      heightCm: 175,
      moderateMinutes: 40,
      vigorousMinutes: 75,
    });
    expect(r.filled).toBe(6);
  });

  it('marks older measurements as remembered, not taken today', () => {
    const r = phoneAnswers({ ...empty, weight: { value: 70, day: '2026-11-01' } }, '2026-11-09');
    expect(r.answers).toEqual({ weightKg: 70, measurementSource: 'recalled' });
  });

  it('does not turn a week with no logged workouts into zero minutes', () => {
    const r = phoneAnswers(
      { ...empty, activity: { moderate: 0, vigorous: 0, sessions: 0 }, steps: 30_000 },
      '2026-11-09',
    );
    expect(r.answers).toEqual({});
    expect(r.filled).toBe(0);
  });
});
