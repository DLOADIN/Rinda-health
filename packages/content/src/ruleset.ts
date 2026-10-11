import type { Ruleset } from '@rinda/rules';
import { z } from 'zod';

const sexes = <T extends z.ZodType>(item: T) =>
  z.strictObject({ male: item, female: item, not_stated: item });
const bandFrom = z.strictObject({ band: z.string().min(1), min: z.number().nonnegative() });
const ascending = (bands: Array<{ min: number }>) =>
  bands.every((b, i) => i === 0 || b.min > (bands[i - 1]?.min ?? 0));
const bandList = z.array(bandFrom).min(2).refine(ascending, 'Bands must be in ascending order of min');
const rule = { ruleId: z.string().min(1), source: z.string().min(1) };
const range = z.strictObject({ unit: z.string(), min: z.number(), max: z.number() });
const ncdDomain = z.enum(['tobacco', 'alcohol', 'activity', 'diet', 'bmi', 'waist', 'bp']);
const severity = z.enum(['ok', 'attention', 'confirm', 'urgent', 'wellness']);
const severityMap = z.record(z.string(), severity);

export const RulesetSchema = z.strictObject({
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  status: z.enum(['proposed', 'approved']),
  statusNote: z.string().optional(),
  domains: z.strictObject({
    tobacco: z.strictObject(rule),
    alcohol: z.strictObject({ ...rule, attentionAt: sexes(z.number().int().min(0).max(12)) }),
    activity: z.strictObject({
      ...rule,
      vigorousMultiplier: z.number().positive(),
      meetsAt: z.number().positive(),
    }),
    diet: z.strictObject({ ...rule, meetsAt: z.number().positive() }),
    bmi: z.strictObject({ ...rule, bandsX10: bandList }),
    waist: z.strictObject({ ...rule, bands: sexes(bandList) }),
    bp: z.strictObject({
      ...rule,
      bands: z
        .array(z.strictObject({ band: z.string(), systolic: z.number(), diastolic: z.number() }))
        .min(2),
    }),
    phq9: z.strictObject({ ...rule, variant: z.enum(['PHQ-9', 'PHQ-8']), bands: bandList }),
    gad7: z.strictObject({ ...rule, items: z.literal(7), bands: bandList }),
  }),
  safety: z.strictObject({ tier1At: z.strictObject({ phq9: z.number().int(), gad7: z.number().int() }) }),
  severity: z.strictObject({
    tobacco: severityMap,
    alcohol: severityMap,
    activity: severityMap,
    diet: severityMap,
    bmi: severityMap,
    waist: severityMap,
    bp: severityMap,
    phq9: severityMap,
    gad7: severityMap,
  }),
  planner: z.strictObject({
    maxFocus: z.number().int().positive(),
    urgent: z.strictObject({ domain: ncdDomain, band: z.string(), contentId: z.string() }),
    order: z
      .array(
        z.strictObject({
          id: z.string(),
          when: z.array(z.strictObject({ domain: ncdDomain, bands: z.array(z.string()).min(1) })).min(1),
          recommendationId: z.string(),
        }),
      )
      .min(1),
    keepGoingId: z.string(),
    targets: z.strictObject({
      activity: z.strictObject({
        stepCap: z.number().positive(),
        roundTo: z.number().positive(),
        splitAt: z.number().positive(),
        splitDays: z.number().int().positive(),
        splitRoundTo: z.number().positive(),
      }),
      diet: z.strictObject({ stepCap: z.number().positive() }),
    }),
  }),
  validation: z.strictObject({
    height: range,
    weight: range,
    waist: range,
    systolic: range,
    diastolic: range,
    moderateMinutes: range,
    vigorousMinutes: range,
    servingsPerDay: range,
  }),
  plausibility: z.strictObject({
    pulsePressure: z.strictObject({ min: z.number(), max: z.number() }),
    bpRecheck: z.strictObject({ systolic: z.number(), diastolic: z.number() }),
    bmi: z.strictObject({ min: z.number(), max: z.number() }),
    heightMetres: z.strictObject({ min: z.number(), max: z.number() }),
  }),
});

export type RulesetBody = z.infer<typeof RulesetSchema>;

export function parseRuleset(body: unknown): Ruleset & Pick<RulesetBody, 'status'> {
  const parsed = RulesetSchema.parse(body);
  const d = parsed.domains;
  const bands: Record<string, string[]> = {
    tobacco: ['no_reported_risk', 'attention'],
    alcohol: ['lower_risk', 'attention'],
    activity: ['meets', 'below'],
    diet: ['meets', 'below'],
    bmi: d.bmi.bandsX10.map((b) => b.band),
    waist: [...new Set(Object.values(d.waist.bands).flatMap((list) => list.map((b) => b.band)))],
    bp: d.bp.bands.map((b) => b.band),
    phq9: d.phq9.bands.map((b) => b.band),
    gad7: d.gad7.bands.map((b) => b.band),
  };
  for (const [domain, list] of Object.entries(bands)) {
    for (const band of list) {
      if (!(band in parsed.severity[domain as keyof typeof parsed.severity])) {
        throw new Error(`Ruleset ${parsed.version}: no severity for ${domain}.${band}`);
      }
    }
  }
  return parsed;
}
