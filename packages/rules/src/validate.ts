import { bmiTimesTen } from './score.ts';
import type { MeasurementType, Ruleset } from './types.ts';

export type ValidationIssue =
  'out_of_range' | 'height_in_metres' | 'weight_check' | 'systolic_not_above_diastolic';

export function validateMeasurement(
  type: MeasurementType,
  value: number,
  ruleset: Ruleset,
  context: { diastolic?: number } = {},
): ValidationIssue | null {
  const range = ruleset.validation[type];
  const metres = ruleset.plausibility.heightMetres;
  if (type === 'height' && value >= metres.min && value <= metres.max) return 'height_in_metres';
  if (!(value >= range.min && value <= range.max)) {
    return type === 'weight' && value > range.max ? 'weight_check' : 'out_of_range';
  }
  if (type === 'systolic' && context.diastolic !== undefined && value <= context.diastolic) {
    return 'systolic_not_above_diastolic';
  }
  return null;
}

export type PlausibilityFlag = 'pulse_pressure' | 'bp_very_high' | 'bmi_extreme' | 'waist_exceeds_height';

export interface MeasurementInput {
  heightCm?: number;
  weightKg?: number;
  waistCm?: number;
  systolic?: number;
  diastolic?: number;
}

export function checkPlausibility(m: MeasurementInput, ruleset: Ruleset): PlausibilityFlag[] {
  const p = ruleset.plausibility;
  const flags: PlausibilityFlag[] = [];
  if (m.systolic !== undefined && m.diastolic !== undefined) {
    const pulse = m.systolic - m.diastolic;
    if (pulse < p.pulsePressure.min || pulse > p.pulsePressure.max) flags.push('pulse_pressure');
  }
  if ((m.systolic ?? 0) >= p.bpRecheck.systolic || (m.diastolic ?? 0) >= p.bpRecheck.diastolic) {
    flags.push('bp_very_high');
  }
  if (m.heightCm !== undefined && m.weightKg !== undefined) {
    const bmi10 = bmiTimesTen(m.heightCm, m.weightKg);
    if (bmi10 < p.bmi.min * 10 || bmi10 > p.bmi.max * 10) flags.push('bmi_extreme');
  }
  if (m.heightCm !== undefined && m.waistCm !== undefined && m.waistCm > m.heightCm) {
    flags.push('waist_exceeds_height');
  }
  return flags;
}
