import { isValue } from './score.ts';
import type { Answer, AssessmentInput, AssessmentResult, Ruleset, WellnessDomain } from './types.ts';

export type Item9Check = 'tier2' | 'prompt_facilitator' | null;

export function checkItem9(answer: Answer<number>): Item9Check {
  if (isValue(answer)) return answer.value > 0 ? 'tier2' : null;
  return answer.missing === 'SKIPPED' || answer.missing === 'DONT_KNOW' ? 'prompt_facilitator' : null;
}

export interface SafetyAssessment {
  tier: 1 | 2 | null;
  triggerType: 'item9' | 'score_threshold' | null;
  promptFacilitator: boolean;
}

/**
 * Automatic tiers for a scored assessment. Tier 3 is facilitator-only and never automatic.
 * Tier 1 needs a complete PHQ-9 or GAD-7 total at or above the ruleset cut-off and no Tier 2.
 */
export function assessSafety(
  input: AssessmentInput,
  result: AssessmentResult,
  ruleset: Ruleset,
): SafetyAssessment {
  const item9 = ruleset.domains.phq9.variant === 'PHQ-9' ? input.phq9[8] : undefined;
  const check = item9 === undefined ? null : checkItem9(item9);
  if (check === 'tier2') return { tier: 2, triggerType: 'item9', promptFacilitator: false };
  const tier1 = result.wellness.some(
    (r) => r.value !== null && r.value >= ruleset.safety.tier1At[r.domain as WellnessDomain],
  );
  return {
    tier: tier1 ? 1 : null,
    triggerType: tier1 ? 'score_threshold' : null,
    promptFacilitator: check === 'prompt_facilitator',
  };
}
