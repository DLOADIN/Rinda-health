import { scoreDomain } from './score.ts';
import type { AssessmentInput, DomainResult, Ruleset } from './types.ts';

export type WhatIfChange =
  | { domain: 'activity'; moderateMinutes: number; vigorousMinutes: number }
  | { domain: 'diet'; servingsPerDay: number }
  | { domain: 'alcohol'; auditC: readonly [number, number, number] }
  | { domain: 'tobacco'; tobaccoUse: boolean };

export interface WhatIfResult {
  before: DomainResult;
  after: DomainResult;
}

function apply(change: WhatIfChange, base: AssessmentInput): AssessmentInput {
  switch (change.domain) {
    case 'activity':
      return {
        ...base,
        activity: {
          moderateMinutes: { value: change.moderateMinutes },
          vigorousMinutes: { value: change.vigorousMinutes },
        },
      };
    case 'diet':
      return { ...base, diet: { ...base.diet, servingsPerDay: { value: change.servingsPerDay } } };
    case 'alcohol':
      return {
        ...base,
        auditC: [{ value: change.auditC[0] }, { value: change.auditC[1] }, { value: change.auditC[2] }],
      };
    case 'tobacco':
      return { ...base, tobaccoUse: { value: change.tobaccoUse } };
    default:
      // Weight, BMI, waist and blood pressure are deliberately not simulated.
      throw new Error(`What-if does not simulate ${(change as { domain: string }).domain}`);
  }
}

export function simulate(change: WhatIfChange, base: AssessmentInput, ruleset: Ruleset): WhatIfResult {
  return {
    before: scoreDomain(change.domain, base, ruleset),
    after: scoreDomain(change.domain, apply(change, base), ruleset),
  };
}
