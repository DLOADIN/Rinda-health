// Rinda Guide template composer: every chip, urgent results, missing data, and the numbers it may mention.
import { BUNDLED_CONTENT } from '@rinda/content';
import { describe, expect, it } from 'vitest';
import {
  allowedNumbers,
  composeGuideAnswer,
  fillSlots,
  planNextSteps,
  scoreAssessment,
} from '../src/index.ts';
import { buildInput, ruleset, type FlatInput } from './helpers.ts';

const text = (id: string) => BUNDLED_CONTENT.en.text[id] ?? id;
const ok: FlatInput = {
  sex: 'female',
  tobaccoUse: false,
  auditC: [1, 0, 0],
  moderateMinutes: 150,
  vigorousMinutes: 0,
  servingsPerDay: 5,
  heightCm: 170,
  weightKg: 65,
  waistCm: 75,
  systolic: 120,
  diastolic: 80,
};
const compose = (chip: string, flat: FlatInput) => {
  const result = scoreAssessment(buildInput(flat), ruleset);
  const plan = planNextSteps(result, ruleset);
  return { draft: composeGuideAnswer(chip, result, plan, text), result, plan };
};
const all = (d: { paragraphs: Array<{ text: string }> }) => d.paragraphs.map((p) => p.text).join(' ');

describe('composeGuideAnswer', () => {
  it('overview lists every NCD area with its band and the focus areas', () => {
    const { draft } = compose('overview', { ...ok, moderateMinutes: 60, servingsPerDay: 3 });
    expect(all(draft)).toContain('Physical activity: Below recommended.');
    expect(all(draft)).toContain('The areas to work on first are Physical activity; Fruit and vegetables.');
    expect(all(draft)).not.toMatch(/mood|stress|PHQ|GAD/i);
    expect(draft.followUpChipIds).toEqual(['first_step', 'plan_week']);
  });

  it('overview shows "not enough information" for an area with missing answers', () => {
    expect(all(compose('overview', { ...ok, systolic: null }).draft)).toContain(
      'Blood pressure: Not enough information.',
    );
  });

  it('allowedNumbers skips focus areas without a numeric target', () => {
    const { draft, result, plan } = compose('overview', { ...ok, tobaccoUse: true });
    expect(allowedNumbers(result, plan, draft)).not.toContain(NaN);
  });

  it('overview says keep going when nothing needs focus', () => {
    expect(all(compose('overview', ok).draft)).toContain(
      'All the areas you answered are in the recommended range.',
    );
  });

  it('first step uses the first focus area that has a target', () => {
    const { draft } = compose('first_step', { ...ok, tobaccoUse: true, moderateMinutes: 60 });
    expect(all(draft)).toBe(
      'One small step to start this week: about 20 more minutes of activity on 3 days.',
    );
  });

  it('first step without a target suggests talking to a health worker; none needed says keep going', () => {
    expect(all(compose('first_step', { ...ok, tobaccoUse: true }).draft)).toBe(
      'Tobacco: talk to a health worker if you are concerned.',
    );
    expect(all(compose('first_step', ok).draft)).toContain('You are doing well.');
  });

  it('plan for the week lists each focus area with its step', () => {
    const { draft } = compose('plan_week', {
      ...ok,
      tobaccoUse: true,
      moderateMinutes: 140,
      servingsPerDay: 4,
    });
    expect(all(draft)).toBe(
      'Here is a simple plan for this week. Tobacco: talk to a health worker if you are concerned. ' +
        'Physical activity: about 10 more minutes of activity this week. ' +
        'Fruit and vegetables: add 1 servings of fruit or vegetables a day.',
    );
    expect(all(compose('plan_week', ok).draft)).toContain(
      'All the areas you answered are in the recommended range.',
    );
  });

  it('explains one area with its value and source, or says there is not enough information', () => {
    expect(all(compose('explain.activity', { ...ok, moderateMinutes: 60 }).draft)).toBe(
      'Physical activity: your result is "Below recommended". It comes from a fixed rule (Bull et al. (2020)), ' +
        'not a diagnosis. The value used was 60 minutes a week.',
    );
    expect(all(compose('explain.tobacco', ok).draft)).not.toContain('The value used');
    expect(all(compose('explain.bp', { ...ok, systolic: null }).draft)).toContain(
      'We did not have enough information',
    );
    const { result, plan } = compose('overview', ok);
    const missing = composeGuideAnswer('explain.bp', { ...result, ncd: [] }, plan, text);
    expect(all(missing)).toContain('We did not have enough information');
  });

  it('puts the approved seek-care text first when blood pressure needs care today', () => {
    const { draft } = compose('overview', { ...ok, systolic: 185, diastolic: 100 });
    expect(draft.paragraphs[0]?.sourceIds).toEqual(['safety.bp.seek_care_today']);
  });

  it('every paragraph names the approved texts it used', () => {
    for (const chip of ['overview', 'first_step', 'plan_week', 'explain.bmi']) {
      for (const p of compose(chip, { ...ok, moderateMinutes: 60 }).draft.paragraphs) {
        expect(p.sourceIds.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('helpers', () => {
  it('fillSlots leaves unknown slots as they are', () => {
    expect(fillSlots('{a} and {b}', { a: 1 })).toBe('1 and {b}');
  });

  it('allowedNumbers collects values, targets and template numbers', () => {
    const { draft, result, plan } = compose('first_step', { ...ok, moderateMinutes: 60, servingsPerDay: 3 });
    const numbers = allowedNumbers(result, plan, draft, [150, 5]);
    for (const n of [60, 3, 20, 2, 150, 5]) expect(numbers).toContain(n);
  });
});
