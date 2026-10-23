import type { AssessmentResult, DomainResult, NcdDomain, Ruleset } from './types.ts';

export type PlanTarget =
  | { kind: 'activity_split'; minutesPerDay: number; days: number }
  | { kind: 'activity_week'; minutes: number }
  | { kind: 'diet_servings'; servings: number };

export interface FocusArea {
  id: string;
  domains: NcdDomain[];
  reasons: string[];
  recommendationId: string;
  target: PlanTarget | null;
}

export interface Plan {
  rulesetVersion: string;
  urgent: { domain: NcdDomain; contentId: string } | null;
  focus: FocusArea[];
  other: FocusArea[];
  keepGoingId: string | null;
}

const roundUpTo = (value: number, step: number): number => Math.ceil(value / step) * step;

function targetFor(domain: NcdDomain, result: DomainResult, ruleset: Ruleset): PlanTarget | null {
  if (domain === 'activity') {
    const cfg = ruleset.planner.targets.activity;
    const gap = ruleset.domains.activity.meetsAt - (result.value as number);
    const step = Math.min(roundUpTo(gap, cfg.roundTo), cfg.stepCap);
    return step >= cfg.splitAt
      ? {
          kind: 'activity_split',
          minutesPerDay: roundUpTo(step / cfg.splitDays, cfg.splitRoundTo),
          days: cfg.splitDays,
        }
      : { kind: 'activity_week', minutes: step };
  }
  if (domain === 'diet') {
    const gap = ruleset.domains.diet.meetsAt - (result.value as number);
    return { kind: 'diet_servings', servings: Math.min(gap, ruleset.planner.targets.diet.stepCap) };
  }
  return null;
}

export function planNextSteps(result: AssessmentResult, ruleset: Ruleset): Plan {
  const byDomain = new Map(result.ncd.map((r) => [r.domain as NcdDomain, r]));
  const { urgent, order, maxFocus, keepGoingId } = ruleset.planner;
  const urgentHit = byDomain.get(urgent.domain)?.band === urgent.band;

  const used = new Set<NcdDomain>();
  const matched: FocusArea[] = [];
  for (const entry of order) {
    const hits = entry.when.flatMap((w) => {
      const r = byDomain.get(w.domain);
      return r && !used.has(w.domain) && w.bands.includes(r.band) ? [r] : [];
    });
    if (hits.length === 0) continue;
    const domains = hits.map((r) => r.domain as NcdDomain);
    domains.forEach((d) => used.add(d));
    matched.push({
      id: entry.id,
      domains,
      reasons: hits.map((r) => `${r.domain}_${r.band}`),
      recommendationId: entry.recommendationId,
      target: targetFor(domains[0] as NcdDomain, hits[0] as DomainResult, ruleset),
    });
  }

  return {
    rulesetVersion: ruleset.version,
    urgent: urgentHit ? { domain: urgent.domain, contentId: urgent.contentId } : null,
    focus: matched.slice(0, maxFocus),
    other: matched.slice(maxFocus),
    keepGoingId: matched.length === 0 && !urgentHit ? keepGoingId : null,
  };
}
