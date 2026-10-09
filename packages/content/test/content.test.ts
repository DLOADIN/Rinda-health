import { describe, expect, it } from 'vitest';
import rulesetJson from '../rulesets/v1.0.json' with { type: 'json' };
import { BUNDLED_CONTENT, parseRuleset, RULESET_V1 } from '../src/index.ts';

describe('ruleset v1.0', () => {
  it('parses and stays proposed until approved in the console (FR-20)', () => {
    expect(RULESET_V1.version).toBe('1.0.0');
    expect(RULESET_V1.status).toBe('proposed');
  });

  it('rejects unknown keys, unordered bands and missing severities', () => {
    expect(() => parseRuleset({ ...rulesetJson, extra: true })).toThrow();
    const unordered = structuredClone(rulesetJson);
    unordered.domains.bmi.bandsX10.reverse();
    expect(() => parseRuleset(unordered)).toThrow(/ascending/);
    const noSeverity = structuredClone(rulesetJson);
    delete (noSeverity.severity.bp as Record<string, string>).seek_care_today;
    expect(() => parseRuleset(noSeverity)).toThrow(/no severity for bp.seek_care_today/);
  });
});

describe('bundled content', () => {
  it('has the same keys in English and Kinyarwanda (FR-16)', () => {
    expect(Object.keys(BUNDLED_CONTENT.rw.text).sort()).toEqual(Object.keys(BUNDLED_CONTENT.en.text).sort());
    expect(BUNDLED_CONTENT.rw.referrals.entries.map((e) => e.id)).toEqual(
      BUNDLED_CONTENT.en.referrals.entries.map((e) => e.id),
    );
  });

  it('marks every unverified referral entry as unverified', () => {
    for (const entry of BUNDLED_CONTENT.en.referrals.entries) {
      if (entry.verifiedOn === null) expect(entry.verifiedBy).toBeNull();
    }
  });
});
