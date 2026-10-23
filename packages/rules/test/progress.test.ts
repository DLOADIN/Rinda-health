import { describe, expect, it } from 'vitest';
import { scoreAssessment, targetPercent, type DomainResult } from '../src/index.ts';
import { buildInput, ruleset, type FlatInput } from './helpers.ts';

const base: FlatInput = {
  sex: 'female',
  tobaccoUse: false,
  auditC: [1, 0, 0],
  moderateMinutes: 60,
  vigorousMinutes: 0,
  servingsPerDay: 3,
  heightCm: 170,
  weightKg: 65,
  waistCm: 75,
  systolic: 120,
  diastolic: 80,
};
const area = (flat: FlatInput, domain: string): DomainResult => {
  const r = scoreAssessment(buildInput(flat), ruleset).ncd.find((x) => x.domain === domain);
  if (!r) throw new Error(domain);
  return r;
};

describe('targetPercent', () => {
  it('shows activity and fruit and vegetables as a share of the ruleset target', () => {
    expect(targetPercent(area(base, 'activity'), ruleset)).toBe(40);
    expect(targetPercent(area(base, 'diet'), ruleset)).toBe(60);
  });

  it('counts vigorous minutes double, rounds down and stops at 100', () => {
    expect(targetPercent(area({ ...base, moderateMinutes: 149 }, 'activity'), ruleset)).toBe(99);
    expect(
      targetPercent(area({ ...base, moderateMinutes: 50, vigorousMinutes: 50 }, 'activity'), ruleset),
    ).toBe(100);
    expect(targetPercent(area({ ...base, servingsPerDay: 9 }, 'diet'), ruleset)).toBe(100);
  });

  it('gives no percentage to areas without a target, or to unanswered areas', () => {
    for (const d of ['tobacco', 'alcohol', 'bmi', 'waist', 'bp'])
      expect(targetPercent(area(base, d), ruleset)).toBeNull();
    expect(
      targetPercent(area({ ...base, moderateMinutes: null, vigorousMinutes: null }, 'activity'), ruleset),
    ).toBeNull();
    const zeroTarget = {
      ...ruleset,
      domains: { ...ruleset.domains, diet: { ...ruleset.domains.diet, meetsAt: 0 } },
    };
    expect(targetPercent(area(base, 'diet'), zeroTarget)).toBeNull();
    expect(targetPercent({ ...area(base, 'diet'), value: null, band: 'below' }, ruleset)).toBeNull();
  });
});
