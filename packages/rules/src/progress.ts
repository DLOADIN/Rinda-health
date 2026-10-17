// This is how far a person is towards the healthy target, as a whole percentage. Only areas with a real target in
// the ruleset (weekly activity minutes, daily fruit and vegetable servings) get one; the others keep their band.
import type { DomainResult, Ruleset } from './types.ts';

export function targetPercent(result: DomainResult, ruleset: Ruleset): number | null {
  if (result.band === 'insufficient' || result.value === null) return null;
  const target =
    result.domain === 'activity'
      ? ruleset.domains.activity.meetsAt
      : result.domain === 'diet'
        ? ruleset.domains.diet.meetsAt
        : null;
  if (target === null || target <= 0) return null;
  // Integer arithmetic, rounded down, so 149 of 150 minutes never shows as 100%.
  return Math.min(100, Math.floor((Math.max(0, result.value) * 100) / target));
}
