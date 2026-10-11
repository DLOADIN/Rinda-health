import { RULESET_V1 } from '@rinda/content';
import type { Answer, AssessmentInput, Missingness, Sex } from '../src/index.ts';

export const ruleset = RULESET_V1;

type Flat = number | boolean | string | null | undefined;
export interface FlatInput {
  sex: Sex;
  tobaccoUse?: boolean | null;
  auditC?: Flat[];
  moderateMinutes?: number | null;
  vigorousMinutes?: number | null;
  servingsPerDay?: number | null;
  addsSaltAtTable?: boolean | null;
  heightCm?: number | null;
  weightKg?: number | null;
  waistCm?: number | null;
  systolic?: number | null;
  diastolic?: number | null;
  phq9?: Flat[];
  gad7?: Flat[];
}

function answer<T>(value: Flat): Answer<T> {
  if (value === undefined || value === null) return { missing: 'SKIPPED' };
  if (typeof value === 'string') return { missing: value as Missingness };
  return { value: value as T };
}

const items = (values: Flat[] | undefined, n: number): Answer<number>[] =>
  Array.from({ length: n }, (_, i) => answer<number>(values?.[i]));

export function buildInput(flat: FlatInput): AssessmentInput {
  const [a1, a2, a3] = items(flat.auditC, 3) as [Answer<number>, Answer<number>, Answer<number>];
  return {
    sex: flat.sex,
    tobaccoUse: answer(flat.tobaccoUse),
    auditC: [a1, a2, a3],
    activity: {
      moderateMinutes: answer(flat.moderateMinutes),
      vigorousMinutes: answer(flat.vigorousMinutes),
    },
    diet: { servingsPerDay: answer(flat.servingsPerDay), addsSaltAtTable: answer(flat.addsSaltAtTable) },
    body: { heightCm: answer(flat.heightCm), weightKg: answer(flat.weightKg), waistCm: answer(flat.waistCm) },
    bp: { systolic: answer(flat.systolic), diastolic: answer(flat.diastolic) },
    phq9: items(flat.phq9, 9),
    gad7: items(flat.gad7, 7),
  };
}
