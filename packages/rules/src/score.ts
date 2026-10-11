// This is where every result is worked out. Pure functions only, so the phone and the server always agree.
import {
  INSUFFICIENT,
  type Answer,
  type AssessmentInput,
  type AssessmentResult,
  type BandFrom,
  type Completeness,
  type Domain,
  type DomainResult,
  type Ruleset,
} from './types.ts';

export const isValue = <T>(answer: Answer<T>): answer is { value: T } => 'value' in answer;

function missingCompleteness(answers: readonly Answer<unknown>[]): Exclude<Completeness, 'complete'> {
  return answers.some(isValue) ? 'partial' : 'none';
}

function bandIndex<T>(bands: readonly T[], reaches: (band: T) => boolean): number {
  const index = bands.reduce((found, band, i) => (reaches(band) ? i : found), -1);
  if (index === -1) throw new RangeError('Value is below the lowest band in the ruleset');
  return index;
}

function bandFrom(bands: readonly BandFrom[], value: number): string {
  return (bands[bandIndex(bands, (b) => value >= b.min)] as BandFrom).band;
}

function result(
  domain: Domain,
  band: string,
  value: number | null,
  completeness: Completeness,
  contributingFactors: string[],
  ruleset: Ruleset,
): DomainResult {
  let severity: DomainResult['severity'] = 'unknown';
  if (band !== INSUFFICIENT) {
    const mapped = ruleset.severity[domain][band];
    if (mapped === undefined) throw new Error(`Ruleset has no severity for ${domain}.${band}`);
    severity = mapped;
  }
  const { ruleId, source } = ruleset.domains[domain];
  return {
    domain,
    band,
    severity,
    value,
    completeness,
    contributingFactors,
    ruleId,
    source,
    rulesetVersion: ruleset.version,
  };
}

const insufficient = (domain: Domain, completeness: Completeness, ruleset: Ruleset): DomainResult =>
  result(domain, INSUFFICIENT, null, completeness, [], ruleset);

export function bmiTimesTen(heightCm: number, weightKg: number): number {
  const w10 = Math.round(weightKg * 10);
  const h10 = Math.round(heightCm * 10);
  return Math.floor((2 * w10 * 1_000_000 + h10 * h10) / (2 * h10 * h10));
}

function scoreTobacco(input: AssessmentInput, ruleset: Ruleset): DomainResult {
  const use = input.tobaccoUse;
  if (!isValue(use)) return insufficient('tobacco', 'none', ruleset);
  return use.value
    ? result('tobacco', 'attention', null, 'complete', ['tobacco_use'], ruleset)
    : result('tobacco', 'no_reported_risk', null, 'complete', [], ruleset);
}

function scoreAlcohol(input: AssessmentInput, ruleset: Ruleset): DomainResult {
  const [item1, item2, item3] = input.auditC;
  let total: number;
  if (isValue(item1) && item1.value === 0) {
    total = 0;
  } else if (isValue(item1) && isValue(item2) && isValue(item3)) {
    total = item1.value + item2.value + item3.value;
  } else {
    return insufficient('alcohol', missingCompleteness(input.auditC), ruleset);
  }
  const attention = total >= ruleset.domains.alcohol.attentionAt[input.sex];
  return attention
    ? result(
        'alcohol',
        'attention',
        total,
        'complete',
        ['auditc_total_at_or_above_threshold', `sex_${input.sex}`],
        ruleset,
      )
    : result('alcohol', 'lower_risk', total, 'complete', [], ruleset);
}

function scoreActivity(input: AssessmentInput, ruleset: Ruleset): DomainResult {
  const { moderateMinutes, vigorousMinutes } = input.activity;
  if (!isValue(moderateMinutes) || !isValue(vigorousMinutes)) {
    return insufficient('activity', missingCompleteness([moderateMinutes, vigorousMinutes]), ruleset);
  }
  const { vigorousMultiplier, meetsAt } = ruleset.domains.activity;
  const equivalent = moderateMinutes.value + vigorousMultiplier * vigorousMinutes.value;
  const factors = vigorousMinutes.value > 0 ? ['vigorous_counts_double'] : [];
  return equivalent >= meetsAt
    ? result('activity', 'meets', equivalent, 'complete', factors, ruleset)
    : result('activity', 'below', equivalent, 'complete', [...factors, 'below_weekly_target'], ruleset);
}

function scoreDiet(input: AssessmentInput, ruleset: Ruleset): DomainResult {
  const { servingsPerDay, addsSaltAtTable } = input.diet;
  if (!isValue(servingsPerDay)) return insufficient('diet', 'none', ruleset);
  const factors = isValue(addsSaltAtTable) && addsSaltAtTable.value ? ['adds_salt_at_table'] : [];
  return servingsPerDay.value >= ruleset.domains.diet.meetsAt
    ? result('diet', 'meets', servingsPerDay.value, 'complete', factors, ruleset)
    : result('diet', 'below', servingsPerDay.value, 'complete', ['below_daily_target', ...factors], ruleset);
}

function scoreBmi(input: AssessmentInput, ruleset: Ruleset): DomainResult {
  const { heightCm, weightKg } = input.body;
  if (!isValue(heightCm) || !isValue(weightKg)) {
    return insufficient('bmi', missingCompleteness([heightCm, weightKg]), ruleset);
  }
  const bmi10 = bmiTimesTen(heightCm.value, weightKg.value);
  return result(
    'bmi',
    bandFrom(ruleset.domains.bmi.bandsX10, bmi10),
    bmi10 / 10,
    'complete',
    ['height', 'weight'],
    ruleset,
  );
}

function scoreWaist(input: AssessmentInput, ruleset: Ruleset): DomainResult {
  const { waistCm } = input.body;
  if (!isValue(waistCm)) return insufficient('waist', 'none', ruleset);
  const band = bandFrom(ruleset.domains.waist.bands[input.sex], waistCm.value);
  return result('waist', band, waistCm.value, 'complete', [`sex_${input.sex}`], ruleset);
}

function scoreBp(input: AssessmentInput, ruleset: Ruleset): DomainResult {
  const { systolic, diastolic } = input.bp;
  if (!isValue(systolic) || !isValue(diastolic)) {
    return insufficient('bp', missingCompleteness([systolic, diastolic]), ruleset);
  }
  const bands = ruleset.domains.bp.bands;
  const s = bandIndex(bands, (b) => systolic.value >= b.systolic);
  const d = bandIndex(bands, (b) => diastolic.value >= b.diastolic);
  const index = Math.max(s, d);
  const factors = [...(s === index ? ['systolic'] : []), ...(d === index ? ['diastolic'] : [])];
  const band = (bands[index] as (typeof bands)[number]).band;
  return result('bp', band, null, 'complete', factors, ruleset);
}

function scoreInstrument(
  domain: 'phq9' | 'gad7',
  items: readonly Answer<number>[],
  expected: number,
  bands: readonly BandFrom[],
  ruleset: Ruleset,
): DomainResult {
  if (items.length !== expected) {
    throw new RangeError(`${domain} needs exactly ${expected} items, received ${items.length}`);
  }
  if (!items.every(isValue)) return insufficient(domain, missingCompleteness(items), ruleset);
  const total = items.reduce((sum, item) => sum + (item as { value: number }).value, 0);
  return result(domain, bandFrom(bands, total), total, 'complete', [], ruleset);
}

const scorePhq9 = (input: AssessmentInput, ruleset: Ruleset): DomainResult => {
  const cfg = ruleset.domains.phq9;
  return scoreInstrument('phq9', input.phq9, cfg.variant === 'PHQ-8' ? 8 : 9, cfg.bands, ruleset);
};

const scoreGad7 = (input: AssessmentInput, ruleset: Ruleset): DomainResult =>
  scoreInstrument('gad7', input.gad7, ruleset.domains.gad7.items, ruleset.domains.gad7.bands, ruleset);

const SCORERS: Record<Domain, (input: AssessmentInput, ruleset: Ruleset) => DomainResult> = {
  tobacco: scoreTobacco,
  alcohol: scoreAlcohol,
  activity: scoreActivity,
  diet: scoreDiet,
  bmi: scoreBmi,
  waist: scoreWaist,
  bp: scoreBp,
  phq9: scorePhq9,
  gad7: scoreGad7,
};

export function scoreDomain(domain: Domain, input: AssessmentInput, ruleset: Ruleset): DomainResult {
  return SCORERS[domain](input, ruleset);
}

export function scoreAssessment(input: AssessmentInput, ruleset: Ruleset): AssessmentResult {
  return {
    rulesetVersion: ruleset.version,
    ncd: (['tobacco', 'alcohol', 'activity', 'diet', 'bmi', 'waist', 'bp'] as const).map((d) =>
      scoreDomain(d, input, ruleset),
    ),
    wellness: (['phq9', 'gad7'] as const).map((d) => scoreDomain(d, input, ruleset)),
  };
}
