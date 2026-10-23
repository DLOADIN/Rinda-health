import type { Answer, Ruleset } from './types.ts';

export type WellnessForm =
  | 'declined'
  | { phq9: ReadonlyArray<number | null | undefined>; gad7: ReadonlyArray<number | null | undefined> }
  | undefined;

export function wellnessInput(
  form: WellnessForm,
  ruleset: Ruleset,
): { phq9: Answer<number>[]; gad7: Answer<number>[] } {
  const phqItems = ruleset.domains.phq9.variant === 'PHQ-8' ? 8 : 9;
  const gadItems = ruleset.domains.gad7.items;
  if (form === undefined || form === 'declined') {
    const declined = (n: number) =>
      Array.from({ length: n }, () => ({ missing: 'MODULE_DECLINED' as const }));
    return { phq9: declined(phqItems), gad7: declined(gadItems) };
  }
  const items = (answers: ReadonlyArray<number | null | undefined>, n: number): Answer<number>[] =>
    Array.from({ length: n }, (_, i) => {
      const v = answers[i];
      return v === null || v === undefined ? { missing: 'SKIPPED' } : { value: v };
    });
  return { phq9: items(form.phq9, phqItems), gad7: items(form.gad7, gadItems) };
}

export function susScore(items: ReadonlyArray<number | null | undefined>): number | null {
  if (items.length !== 10 || items.some((v) => v === null || v === undefined)) return null;
  const sum = (items as number[]).reduce((s, v, i) => s + (i % 2 === 0 ? v - 1 : 5 - v), 0);
  return sum * 2.5;
}
