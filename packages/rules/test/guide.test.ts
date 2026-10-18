import { BUNDLED_CONTENT } from '@rinda/content';
import { GUIDE_ANSWERS } from '@rinda/content/guide-answers';
import { describe, expect, it } from 'vitest';
import {
  allowedNumbers,
  composeGuideAnswer,
  fillSlots,
  planNextSteps,
  scoreAssessment,
} from '../src/index.ts';
import { buildInput, ruleset, type FlatInput } from './helpers.ts';

const text = (id: string) => BUNDLED_CONTENT.en.text[id] ?? GUIDE_ANSWERS.en[id] ?? id;
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
    expect(all(draft)).toContain('Physical activity: this needs your attention (Below recommended).');
    expect(all(draft)).toContain('Tobacco: this looks good (No reported risk).');
    expect(all(draft)).toContain('Good places to start: Physical activity, Fruit and vegetables.');
    expect(all(draft)).not.toMatch(/mood|stress|PHQ|GAD/i);
    expect(draft.followUpChipIds).toEqual(['first_step', 'plan_week']);
  });

  it('overview says plainly when an area was not answered', () => {
    expect(all(compose('overview', { ...ok, systolic: null }).draft)).toContain(
      'Blood pressure: you did not answer this part, so there is no result yet.',
    );
  });

  it('overview speaks to results that need a check or care, and falls back to the short line', () => {
    expect(all(compose('overview', { ...ok, systolic: 145, diastolic: 92 }).draft)).toContain(
      'Blood pressure: please have this checked again at a health centre',
    );
    expect(all(compose('overview', { ...ok, systolic: 185, diastolic: 100 }).draft)).toContain(
      'Blood pressure: please follow the advice at the top of this answer',
    );
    const result = scoreAssessment(buildInput(ok), ruleset);
    const short = composeGuideAnswer('overview', result, planNextSteps(result, ruleset), (id) =>
      id.startsWith('guide.tpl.area.') ? id : text(id),
    );
    expect(all(short)).toContain('Tobacco: No reported risk.');
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
    expect(compose('explain.activity', { ...ok, moderateMinutes: 60 }).draft.paragraphs[0]?.text).toBe(
      'Physical activity: your result is "Below recommended". It comes from a fixed rule (Bull et al. (2020)), ' +
        'not a diagnosis. The value used was 60 minutes a week.',
    );
    expect(all(compose('explain.tobacco', ok).draft)).not.toContain('The value used');
    expect(all(compose('explain.bp', { ...ok, systolic: null }).draft)).toContain(
      'This area was not answered',
    );
    const { result, plan } = compose('overview', ok);
    const missing = composeGuideAnswer('explain.bp', { ...result, ncd: [] }, plan, text);
    expect(all(missing)).toContain('This area was not answered');
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

  it('what can I do: gives why and what helps for each focus area, from the offline answer set', () => {
    const { draft } = compose('tips', { ...ok, moderateMinutes: 60, servingsPerDay: 3 });
    expect(draft.paragraphs[0]?.sourceIds).toEqual(['guide.tpl.tips.intro']);
    expect(all(draft)).toContain('Physical activity: Regular activity strengthens your heart');
    expect(all(draft)).toContain('Fruit and vegetables:');
    expect(draft.paragraphs.flatMap((p) => p.sourceIds)).toContain('ga.activity.below.tips');
    expect(all(draft)).not.toMatch(/mood|stress|PHQ|GAD|TODO|\bga\.[a-z]/i);
  });

  it('what can I do with nothing to work on: says keep going and lists what helps', () => {
    const { draft } = compose('tips', ok);
    expect(draft.paragraphs[0]?.sourceIds).toEqual(['guide.tpl.tips.none']);
    expect(draft.paragraphs.flatMap((p) => p.sourceIds)).toContain('ga.bp.normal.tips');
    expect(draft.paragraphs.flatMap((p) => p.sourceIds)).not.toContain('ga.bp.normal.why');
  });

  it('explaining an area adds why it matters and what helps', () => {
    const { draft } = compose('explain.bp', { ...ok, systolic: 135, diastolic: 86 });
    expect(draft.paragraphs[1]?.sourceIds).toEqual(['ga.bp.high_normal.why', 'ga.bp.high_normal.tips']);
    expect(draft.followUpChipIds).toEqual(['tips', 'first_step']);
  });

  it('adds nothing new where approved safety text already speaks, and never shows a raw ID', () => {
    const { draft } = compose('explain.bp', { ...ok, systolic: 185, diastolic: 100 });
    expect(draft.paragraphs[0]?.sourceIds).toEqual(['safety.bp.seek_care_today']);
    expect(draft.paragraphs.flatMap((p) => p.sourceIds).some((id) => id.startsWith('ga.bp'))).toBe(false);
    const bare = composeGuideAnswer(
      'tips',
      scoreAssessment(buildInput(ok), ruleset),
      planNextSteps(scoreAssessment(buildInput(ok), ruleset), ruleset),
      (id) => BUNDLED_CONTENT.en.text[id] ?? id,
    );
    expect(bare.paragraphs.map((p) => p.text).join(' ')).not.toMatch(/\bga\.[a-z]/);
  });

  it('what can I do skips an area with no result, and focus areas whose answer is missing', () => {
    const { draft } = compose('tips', { ...ok, systolic: null });
    expect(draft.paragraphs.flatMap((p) => p.sourceIds).some((id) => id.startsWith('ga.bp'))).toBe(false);
    const result = scoreAssessment(buildInput({ ...ok, moderateMinutes: 60 }), ruleset);
    const plan = planNextSteps(result, ruleset);
    const noAnswers = composeGuideAnswer('tips', result, plan, (id) => BUNDLED_CONTENT.en.text[id] ?? id);
    expect(noAnswers.paragraphs.map((p) => p.sourceIds)).toEqual([['guide.tpl.tips.intro']]);
  });

  it('never says all is well after the seek-care-today text, on any option', () => {
    for (const chip of ['overview', 'tips', 'first_step', 'plan_week', 'explain.bp']) {
      const { draft } = compose(chip, { ...ok, systolic: 185, diastolic: 100 });
      expect(draft.paragraphs[0]?.sourceIds).toEqual(['safety.bp.seek_care_today']);
      const ids = draft.paragraphs.flatMap((p) => p.sourceIds);
      for (const id of ['guide.tpl.overview.ok', 'guide.tpl.tips.none', 'guide.tpl.first_step.none'])
        expect(ids).not.toContain(id);
      expect(draft.paragraphs.length).toBeLessThanOrEqual(4);
    }
  });

  it('what can I do follows the planner order and stays within four paragraphs', () => {
    const { draft, plan } = compose('tips', {
      ...ok,
      systolic: 142,
      diastolic: 91,
      tobaccoUse: true,
      moderateMinutes: 100,
      vigorousMinutes: 10,
      servingsPerDay: 4,
    });
    const order = plan.focus.flatMap((f) => f.domains);
    const shown = [
      ...new Set(
        draft.paragraphs
          .flatMap((p) => p.sourceIds)
          .filter((id) => id.startsWith('ga.'))
          .map((id) => id.split('.')[1]),
      ),
    ];
    expect(shown).toEqual(order.filter((d) => shown.includes(d)));
    expect(shown[0]).toBe(order[0]);
    expect(draft.paragraphs.length).toBeLessThanOrEqual(4);
  });

  it('body size answers cover both areas and never show a number', () => {
    const { draft } = compose('tips', { ...ok, sex: 'female', weightKg: 89.6, waistCm: 90 });
    const ids = draft.paragraphs.flatMap((p) => p.sourceIds);
    expect(ids).toContain('ga.bmi.obesity.tips');
    expect(ids).toContain('ga.waist.substantially_increased.tips');
    expect(
      draft.paragraphs
        .slice(1)
        .map((p) => p.text)
        .join(' '),
    ).not.toMatch(/\d/);
  });

  it('no answer mentions mental wellness, a diagnosis or a number', () => {
    for (const [id, value] of Object.entries(GUIDE_ANSWERS.en)) {
      expect(id).not.toMatch(/^ga\.(phq9|gad7)\.|seek_care_today/);
      expect(value).not.toMatch(/\d|you have|mood|stress|depress|anxi/i);
    }
  });

  it('every answer exists in Kinyarwanda too', () => {
    expect(Object.keys(GUIDE_ANSWERS.rw).sort()).toEqual(Object.keys(GUIDE_ANSWERS.en).sort());
  });
});
