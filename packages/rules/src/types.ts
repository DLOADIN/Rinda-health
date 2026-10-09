// Shapes shared by every rule. Thresholds never live here: they come from the ruleset JSON
// (packages/content/rulesets), so a threshold change is a new ruleset version (ADR-003).

export type Sex = 'female' | 'male' | 'not_stated';
export type Missingness = 'SKIPPED' | 'MODULE_DECLINED' | 'DONT_KNOW' | 'NOT_APPLICABLE';
export type Answer<T> = { value: T } | { missing: Missingness };

export const NCD_DOMAINS = ['tobacco', 'alcohol', 'activity', 'diet', 'bmi', 'waist', 'bp'] as const;
export const WELLNESS_DOMAINS = ['phq9', 'gad7'] as const;
export const DOMAINS = [...NCD_DOMAINS, ...WELLNESS_DOMAINS] as const;
export type NcdDomain = (typeof NCD_DOMAINS)[number];
export type WellnessDomain = (typeof WELLNESS_DOMAINS)[number];
export type Domain = (typeof DOMAINS)[number];

export const SEVERITIES = ['ok', 'attention', 'confirm', 'urgent', 'wellness', 'unknown'] as const;
export type Severity = (typeof SEVERITIES)[number];
export type Completeness = 'complete' | 'partial' | 'none';

export const INSUFFICIENT = 'insufficient';

export interface AssessmentInput {
  sex: Sex;
  tobaccoUse: Answer<boolean>;
  /** As you may be able to see here is that the AUDIT-C items is from 1 to 3, each 0 to 4. */
  auditC: readonly [Answer<number>, Answer<number>, Answer<number>];
  activity: { moderateMinutes: Answer<number>; vigorousMinutes: Answer<number> };
  diet: { servingsPerDay: Answer<number>; addsSaltAtTable: Answer<boolean> };
  body: { heightCm: Answer<number>; weightKg: Answer<number>; waistCm: Answer<number> };
  bp: { systolic: Answer<number>; diastolic: Answer<number> };
  /** PHQ-9 items in order (8 items when the ruleset uses the PHQ-8 variant). Declined module: every item MODULE_DECLINED. */
  phq9: readonly Answer<number>[];
  /** GAD-7 items in order. */
  gad7: readonly Answer<number>[];
}

export interface DomainResult {
  domain: Domain;
  band: string;
  severity: Severity;
  /** The scored value when the domain has one (BMI, total, minutes); null otherwise. */
  value: number | null;
  completeness: Completeness;
  contributingFactors: string[];
  ruleId: string;
  source: string;
  rulesetVersion: string;
}

export interface AssessmentResult {
  rulesetVersion: string;
  ncd: DomainResult[];
  wellness: DomainResult[];
}

export interface BandFrom {
  band: string;
  min: number;
}

export interface Ruleset {
  version: string;
  domains: {
    tobacco: { ruleId: string; source: string };
    alcohol: { ruleId: string; source: string; attentionAt: Record<Sex, number> };
    activity: { ruleId: string; source: string; vigorousMultiplier: number; meetsAt: number };
    diet: { ruleId: string; source: string; meetsAt: number };
    /** BMI cut-offs are stored ×10 so banding is integer-only (SCORING_RULES.md Section 4). */
    bmi: { ruleId: string; source: string; bandsX10: BandFrom[] };
    waist: { ruleId: string; source: string; bands: Record<Sex, BandFrom[]> };
    /** Ordered least to most severe; a reading takes the highest band either value reaches. */
    bp: {
      ruleId: string;
      source: string;
      bands: Array<{ band: string; systolic: number; diastolic: number }>;
    };
    phq9: { ruleId: string; source: string; variant: 'PHQ-9' | 'PHQ-8'; bands: BandFrom[] };
    gad7: { ruleId: string; source: string; items: number; bands: BandFrom[] };
  };
  safety: { tier1At: { phq9: number; gad7: number } };
  severity: Record<Domain, Record<string, Exclude<Severity, 'unknown'>>>;
  planner: {
    maxFocus: number;
    urgent: { domain: NcdDomain; band: string; contentId: string };
    order: Array<{
      id: string;
      when: Array<{ domain: NcdDomain; bands: string[] }>;
      recommendationId: string;
    }>;
    keepGoingId: string;
    targets: {
      activity: {
        stepCap: number;
        roundTo: number;
        splitAt: number;
        splitDays: number;
        splitRoundTo: number;
      };
      diet: { stepCap: number };
    };
  };
  validation: Record<MeasurementType, { unit: string; min: number; max: number }>;
  plausibility: {
    pulsePressure: { min: number; max: number };
    bpRecheck: { systolic: number; diastolic: number };
    bmi: { min: number; max: number };
    heightMetres: { min: number; max: number };
  };
}

export type MeasurementType =
  | 'height'
  | 'weight'
  | 'waist'
  | 'systolic'
  | 'diastolic'
  | 'moderateMinutes'
  | 'vigorousMinutes'
  | 'servingsPerDay';
