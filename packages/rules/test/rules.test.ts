import { describe, expect, it } from 'vitest';
import {
  assessSafety,
  checkItem9,
  checkPlausibility,
  normalise,
  planNextSteps,
  scoreAssessment,
  scoreDomain,
  simulate,
  validateMeasurement,
  type Ruleset,
  type WhatIfChange,
} from '../src/index.ts';
import { buildInput, ruleset } from './helpers.ts';

const base = buildInput({
  sex: 'male',
  tobaccoUse: true,
  auditC: [2, 2, 1],
  moderateMinutes: 60,
  vigorousMinutes: 0,
  servingsPerDay: 2,
});

describe('scoreAssessment', () => {
  it('keeps NCD and mental-wellness results in separate lists (C-04)', () => {
    const result = scoreAssessment(base, ruleset);
    expect(result.ncd.map((r) => r.domain)).toEqual([
      'tobacco',
      'alcohol',
      'activity',
      'diet',
      'bmi',
      'waist',
      'bp',
    ]);
    expect(result.wellness.map((r) => r.domain)).toEqual(['phq9', 'gad7']);
    expect(result).not.toHaveProperty('total');
  });

  it('marks insufficient domains as unknown severity and never fills a default', () => {
    const bmi = scoreDomain('bmi', buildInput({ sex: 'female' }), ruleset);
    expect(bmi).toMatchObject({ band: 'insufficient', severity: 'unknown', value: null });
  });

  it('carries rule ID, source and ruleset version on every result', () => {
    const tobacco = scoreDomain('tobacco', base, ruleset);
    expect(tobacco).toMatchObject({
      ruleId: 'tobacco.current_use',
      source: 'WHO STEPS (2024)',
      rulesetVersion: '1.0.0',
    });
  });

  it('notes when vigorous minutes count double', () => {
    const r = scoreDomain(
      'activity',
      buildInput({ sex: 'female', moderateMinutes: 10, vigorousMinutes: 10 }),
      ruleset,
    );
    expect(r.contributingFactors).toEqual(['vigorous_counts_double', 'below_weekly_target']);
  });

  it('names the deciding blood-pressure value, or both when they tie', () => {
    const tie = scoreDomain('bp', buildInput({ sex: 'female', systolic: 140, diastolic: 90 }), ruleset);
    expect(tie.contributingFactors).toEqual(['systolic', 'diastolic']);
    const dia = scoreDomain('bp', buildInput({ sex: 'female', systolic: 120, diastolic: 95 }), ruleset);
    expect(dia.contributingFactors).toEqual(['diastolic']);
  });

  it('uses 8 items in the PHQ-8 variant and rejects the wrong item count', () => {
    const phq8: Ruleset = {
      ...ruleset,
      domains: { ...ruleset.domains, phq9: { ...ruleset.domains.phq9, variant: 'PHQ-8' } },
    };
    const input = { ...base, phq9: Array.from({ length: 8 }, () => ({ value: 1 })) };
    expect(scoreDomain('phq9', input, phq8)).toMatchObject({ band: 'mild', value: 8 });
    expect(() => scoreDomain('phq9', input, ruleset)).toThrow(RangeError);
  });

  it('refuses a value below the lowest band and a band with no severity', () => {
    expect(() => scoreDomain('waist', buildInput({ sex: 'male', waistCm: -1 }), ruleset)).toThrow(RangeError);
    const broken: Ruleset = { ...ruleset, severity: { ...ruleset.severity, tobacco: {} } };
    expect(() => scoreDomain('tobacco', base, broken)).toThrow(/no severity/);
  });
});

describe('safety', () => {
  it('checkItem9: above 0 is Tier 2, 0 is nothing, skipped prompts the facilitator', () => {
    expect(checkItem9({ value: 0 })).toBeNull();
    expect([1, 2, 3].map((value) => checkItem9({ value }))).toEqual(['tier2', 'tier2', 'tier2']);
    expect(checkItem9({ missing: 'SKIPPED' })).toBe('prompt_facilitator');
    expect(checkItem9({ missing: 'DONT_KNOW' })).toBe('prompt_facilitator');
    expect(checkItem9({ missing: 'MODULE_DECLINED' })).toBeNull();
  });

  it('a skipped item 9 never raises Tier 2 but asks the facilitator to check in', () => {
    const input = buildInput({ sex: 'female', phq9: [1, 1, 1, 1, 1, 1, 1, 1, null] });
    const safety = assessSafety(input, scoreAssessment(input, ruleset), ruleset);
    expect(safety).toEqual({ tier: null, triggerType: null, promptFacilitator: true });
  });

  it('PHQ-8 has no item 9 check; Tier 1 still applies', () => {
    const phq8: Ruleset = {
      ...ruleset,
      domains: { ...ruleset.domains, phq9: { ...ruleset.domains.phq9, variant: 'PHQ-8' } },
    };
    const input = { ...buildInput({ sex: 'female' }), phq9: Array.from({ length: 8 }, () => ({ value: 2 })) };
    expect(assessSafety(input, scoreAssessment(input, phq8), phq8)).toEqual({
      tier: 1,
      triggerType: 'score_threshold',
      promptFacilitator: false,
    });
  });
});

describe('planner', () => {
  it('ignores a domain missing from the result', () => {
    const plan = planNextSteps({ rulesetVersion: '1.0.0', ncd: [], wellness: [] }, ruleset);
    expect(plan).toMatchObject({ urgent: null, focus: [], keepGoingId: 'rec.plan.keep_going' });
  });

  it('never plans from mental-wellness results', () => {
    const input = buildInput({ sex: 'female', phq9: [3, 3, 3, 3, 3, 3, 3, 3, 0] });
    const plan = planNextSteps(scoreAssessment(input, ruleset), ruleset);
    expect(plan.focus.flatMap((f) => f.domains)).not.toContain('phq9');
  });

  it('lists results beyond the third under other results', () => {
    const many = buildInput({
      sex: 'male',
      tobaccoUse: true,
      auditC: [4, 4, 4],
      moderateMinutes: 0,
      vigorousMinutes: 0,
      servingsPerDay: 0,
      systolic: 150,
      diastolic: 95,
    });
    const plan = planNextSteps(scoreAssessment(many, ruleset), ruleset);
    expect(plan.focus.map((f) => f.id)).toEqual(['bp_confirm', 'tobacco', 'alcohol']);
    expect(plan.other.map((f) => f.id)).toEqual(['activity', 'diet']);
  });
});

describe('simulate', () => {
  const changes: Array<[WhatIfChange, string, string]> = [
    [{ domain: 'activity', moderateMinutes: 150, vigorousMinutes: 0 }, 'below', 'meets'],
    [{ domain: 'diet', servingsPerDay: 5 }, 'below', 'meets'],
    [{ domain: 'alcohol', auditC: [1, 0, 0] }, 'attention', 'lower_risk'],
    [{ domain: 'tobacco', tobaccoUse: false }, 'attention', 'no_reported_risk'],
  ];
  it.each(changes)('%o', (change, before, after) => {
    const r = simulate(change, base, ruleset);
    expect([r.before.band, r.after.band]).toEqual([before, after]);
  });

  it('refuses body and blood-pressure changes', () => {
    expect(() => simulate({ domain: 'bmi' } as unknown as WhatIfChange, base, ruleset)).toThrow(
      /does not simulate/,
    );
  });
});

describe('validateMeasurement', () => {
  it.each([
    ['height', 165, null],
    ['height', 1.65, 'height_in_metres'],
    ['height', 119, 'out_of_range'],
    ['weight', 251, 'weight_check'],
    ['weight', 29, 'out_of_range'],
    ['waist', 201, 'out_of_range'],
    ['diastolic', 39, 'out_of_range'],
    ['servingsPerDay', 21, 'out_of_range'],
    ['moderateMinutes', Number.NaN, 'out_of_range'],
  ] as const)('%s %d gives %s', (type, value, issue) => {
    expect(validateMeasurement(type, value, ruleset)).toBe(issue);
  });

  it('systolic must be greater than diastolic', () => {
    expect(validateMeasurement('systolic', 90, ruleset, { diastolic: 90 })).toBe(
      'systolic_not_above_diastolic',
    );
    expect(validateMeasurement('systolic', 120, ruleset, { diastolic: 80 })).toBeNull();
    expect(validateMeasurement('systolic', 120, ruleset)).toBeNull();
  });
});

describe('checkPlausibility', () => {
  it('flags narrow or wide pulse pressure', () => {
    expect(checkPlausibility({ systolic: 100, diastolic: 85 }, ruleset)).toEqual(['pulse_pressure']);
    expect(checkPlausibility({ systolic: 175, diastolic: 70 }, ruleset)).toEqual(['pulse_pressure']);
    expect(checkPlausibility({ systolic: 120, diastolic: 80 }, ruleset)).toEqual([]);
  });

  it('suggests a re-check for very high readings', () => {
    expect(checkPlausibility({ systolic: 180 }, ruleset)).toEqual(['bp_very_high']);
    expect(checkPlausibility({ diastolic: 110 }, ruleset)).toEqual(['bp_very_high']);
  });

  it('flags extreme BMI and a waist larger than height', () => {
    expect(checkPlausibility({ heightCm: 180, weightKg: 45 }, ruleset)).toEqual(['bmi_extreme']);
    expect(checkPlausibility({ heightCm: 150, weightKg: 120 }, ruleset)).toEqual(['bmi_extreme']);
    expect(checkPlausibility({ heightCm: 170, weightKg: 65, waistCm: 171 }, ruleset)).toEqual([
      'waist_exceeds_height',
    ]);
    expect(checkPlausibility({ heightCm: 170, waistCm: 80 }, ruleset)).toEqual([]);
  });
});

describe('normalise', () => {
  it('sorts keys at every depth so equal results compare equal', () => {
    expect(normalise({ b: 1, a: [{ d: null, c: 'x' }] })).toBe('{"a":[{"c":"x","d":null}],"b":1}');
    const r = scoreAssessment(base, ruleset);
    expect(normalise(r)).toBe(normalise(JSON.parse(JSON.stringify(r))));
  });
});
