import { describe, expect, it } from 'vitest';
import { summariseAggregates, summariseSamples } from '@/lib/phone-health';

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
