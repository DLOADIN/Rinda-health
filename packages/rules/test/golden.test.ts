// Golden fixtures (FR-09, FR-25, FR-33; SRS Section 5.3; docs/SCORING_RULES.md Sections 6 and 7).
// The same files run against the production web bundle in e2e, so client and server must agree.
import { describe, expect, it } from 'vitest';
import { assessSafety, planNextSteps, scoreAssessment, type Domain } from '../src/index.ts';
import golden from './golden/v1.0.json' with { type: 'json' };
import plannerGolden from './golden/planner-v1.0.json' with { type: 'json' };
import { buildInput, ruleset, type FlatInput } from './helpers.ts';

interface Expected {
  band: string;
  value?: number | null;
  completeness?: string;
  tier?: 1 | 2 | null;
  factors?: string[];
}

describe('golden fixtures v1.0', () => {
  it('targets the ruleset version under test', () => {
    expect(golden.ruleset).toBe(ruleset.version);
    expect(plannerGolden.ruleset).toBe(ruleset.version);
  });

  it.each(golden.cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    const input = buildInput(c.input as FlatInput);
    const result = scoreAssessment(input, ruleset);
    const expected = c.expected as Expected;
    const domain = [...result.ncd, ...result.wellness].find((r) => r.domain === (c.domain as Domain));
    expect(domain?.band).toBe(expected.band);
    if ('value' in expected) expect(domain?.value).toBe(expected.value);
    if (expected.completeness) expect(domain?.completeness).toBe(expected.completeness);
    if (expected.factors) expect(domain?.contributingFactors).toEqual(expected.factors);
    if ('tier' in expected) expect(assessSafety(input, result, ruleset).tier).toBe(expected.tier);
  });
});

describe('planner golden fixtures v1.0', () => {
  it.each(plannerGolden.cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    const plan = planNextSteps(scoreAssessment(buildInput(c.input as FlatInput), ruleset), ruleset);
    expect(plan.urgent !== null).toBe(c.expected.urgent);
    expect(plan.keepGoingId !== null).toBe(c.expected.keepGoing);
    expect(plan.focus.map((f) => f.id)).toEqual(c.expected.focus.map((f) => f.id));
    expect(plan.other.map((f) => f.id)).toEqual(c.expected.other.map((f) => f.id));
    c.expected.focus.forEach((f, i) => {
      if ('target' in f) expect(plan.focus[i]?.target).toEqual(f.target);
      if ('domains' in f) expect(plan.focus[i]?.domains).toEqual(f.domains);
    });
    // Body-size focus areas never carry a weight target.
    plan.focus.filter((f) => f.id.startsWith('body_')).forEach((f) => expect(f.target).toBeNull());
  });
});
