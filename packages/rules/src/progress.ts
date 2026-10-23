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
  return Math.min(100, Math.floor((Math.max(0, result.value) * 100) / target));
}
