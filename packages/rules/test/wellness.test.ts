import { describe, expect, it } from 'vitest';
import { susScore, wellnessInput } from '../src/index.ts';
import { ruleset } from './helpers.ts';

describe('wellnessInput', () => {
  it('a declined or absent module is MODULE_DECLINED for every item, never 0', () => {
    for (const form of ['declined', undefined] as const) {
      const input = wellnessInput(form, ruleset);
      expect(input.phq9).toHaveLength(9);
      expect(input.gad7).toHaveLength(7);
      expect(
        [...input.phq9, ...input.gad7].every((a) => 'missing' in a && a.missing === 'MODULE_DECLINED'),
      ).toBe(true);
    }
  });

  it('keeps answered items and marks skipped ones SKIPPED', () => {
    const input = wellnessInput(
      { phq9: [0, 1, null, 3, undefined, 2, 0, 0, 0], gad7: [1, 1, 1, null, 0, 0, 3] },
      ruleset,
    );
    expect(input.phq9[0]).toEqual({ value: 0 });
    expect(input.phq9[2]).toEqual({ missing: 'SKIPPED' });
    expect(input.phq9[4]).toEqual({ missing: 'SKIPPED' });
    expect(input.gad7[3]).toEqual({ missing: 'SKIPPED' });
    expect(input.gad7[6]).toEqual({ value: 3 });
  });

  it('the PHQ-8 variant never takes item 9', () => {
    const phq8 = {
      ...ruleset,
      domains: { ...ruleset.domains, phq9: { ...ruleset.domains.phq9, variant: 'PHQ-8' as const } },
    };
    const input = wellnessInput({ phq9: [0, 0, 0, 0, 0, 0, 0, 0, 3], gad7: [0, 0, 0, 0, 0, 0, 0] }, phq8);
    expect(input.phq9).toHaveLength(8);
    expect(wellnessInput('declined', phq8).phq9).toHaveLength(8);
  });
});

describe('susScore', () => {
  it('scores the standard range 0 to 100', () => {
    expect(susScore([5, 1, 5, 1, 5, 1, 5, 1, 5, 1])).toBe(100);
    expect(susScore([1, 5, 1, 5, 1, 5, 1, 5, 1, 5])).toBe(0);
    expect(susScore([3, 3, 3, 3, 3, 3, 3, 3, 3, 3])).toBe(50);
    expect(susScore([4, 2, 4, 2, 4, 2, 4, 2, 4, 2])).toBe(75);
  });

  it('has no score when an item is skipped or the form is the wrong length', () => {
    expect(susScore([5, 1, 5, 1, null, 1, 5, 1, 5, 1])).toBeNull();
    expect(susScore([5, 1, 5, 1, 5, 1, 5, 1, 5, undefined])).toBeNull();
    expect(susScore([5, 1, 5])).toBeNull();
  });
});
