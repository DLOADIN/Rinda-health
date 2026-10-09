// Bundled by e2e/golden.spec.ts and run both in Node and in each browser engine: the same golden inputs must give
// byte-identical normalised results everywhere (FR-09, SRS Section 5.3).
import { assessSafety, normalise, planNextSteps, scoreAssessment } from '../../packages/rules/src/index.ts';
import { buildInput, ruleset, type FlatInput } from '../../packages/rules/test/helpers.ts';

export function run(flat: FlatInput): string {
  const input = buildInput(flat);
  const result = scoreAssessment(input, ruleset);
  return normalise({
    result,
    safety: assessSafety(input, result, ruleset),
    plan: planNextSteps(result, ruleset),
  });
}
