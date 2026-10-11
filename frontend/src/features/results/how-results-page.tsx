// "How results are calculated" (FR-23). Every number on this page is read from the ruleset in use, and the wording is
// approved content with slots, so the page always matches the rules that produced the person's results.
import { RULESET_V1 } from '@rinda/content';
import { fillSlots, type Ruleset } from '@rinda/rules';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useContent } from '@/lib/content';
import { formatNumber } from '@/lib/format';

type Slots = Record<string, string | number>;

const minOf = (bands: ReadonlyArray<{ band: string; min: number }>, band: string) =>
  bands.find((b) => b.band === band)?.min ?? 0;

/** The numbers each rule's sentence needs, taken from the ruleset. */
function slotsFor(r: Ruleset): Record<string, Slots> {
  const d = r.domains;
  const bp = (band: string) => d.bp.bands.find((b) => b.band === band) ?? { systolic: 0, diastolic: 0 };
  return {
    tobacco: {},
    alcohol: { male: d.alcohol.attentionAt.male, female: d.alcohol.attentionAt.female },
    activity: { multiplier: d.activity.vigorousMultiplier, meetsAt: d.activity.meetsAt },
    diet: { meetsAt: d.diet.meetsAt },
    bmi: {
      normal: formatNumber(minOf(d.bmi.bandsX10, 'normal') / 10),
      overweight: formatNumber(minOf(d.bmi.bandsX10, 'overweight') / 10),
      obesity: formatNumber(minOf(d.bmi.bandsX10, 'obesity') / 10),
    },
    waist: {
      m1: minOf(d.waist.bands.male, 'increased'),
      m2: minOf(d.waist.bands.male, 'substantially_increased'),
      f1: minOf(d.waist.bands.female, 'increased'),
      f2: minOf(d.waist.bands.female, 'substantially_increased'),
    },
    bp: {
      hnS: bp('high_normal').systolic,
      hnD: bp('high_normal').diastolic,
      htS: bp('hypertension_range').systolic,
      htD: bp('hypertension_range').diastolic,
      uS: bp('seek_care_today').systolic,
      uD: bp('seek_care_today').diastolic,
    },
    phq9: {
      mild: minOf(d.phq9.bands, 'mild'),
      moderate: minOf(d.phq9.bands, 'moderate'),
      ms: minOf(d.phq9.bands, 'moderately_severe'),
      severe: minOf(d.phq9.bands, 'severe'),
    },
    gad7: {
      mild: minOf(d.gad7.bands, 'mild'),
      moderate: minOf(d.gad7.bands, 'moderate'),
      severe: minOf(d.gad7.bands, 'severe'),
    },
  };
}

const NCD = ['tobacco', 'alcohol', 'activity', 'diet', 'bmi', 'waist', 'bp'] as const;
const WELLNESS = ['phq9', 'gad7'] as const;

export function HowResultsPage() {
  const { t } = useTranslation();
  const { text } = useContent();
  const ruleset = RULESET_V1;
  const slots = slotsFor(ruleset);
  const rule = (domain: (typeof NCD)[number] | (typeof WELLNESS)[number]) => (
    <Card key={domain} className="glass">
      <CardHeader>
        <CardTitle className="text-base">{t(`domains.${domain}`)}</CardTitle>
        <CardDescription className="text-base text-foreground">
          {fillSlots(text(`rules.${domain}`), slots[domain] ?? {})}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {fillSlots(text('rules.source'), { source: ruleset.domains[domain].source })}
      </CardContent>
    </Card>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('howResults.title')}
        description={fillSlots(text('rules.intro'), { version: ruleset.version })}
      />
      <p>{text('rules.skipped')}</p>
      <section className="flex flex-col gap-3" aria-labelledby="rules-ncd">
        <h2 id="rules-ncd" className="text-xl font-semibold">
          {t('howResults.ncd')}
        </h2>
        <div className="grid gap-3 md:grid-cols-2">{NCD.map(rule)}</div>
      </section>
      <section className="flex flex-col gap-3" aria-labelledby="rules-wellness">
        <h2 id="rules-wellness" className="text-xl font-semibold">
          {t('howResults.wellness')}
        </h2>
        <div className="grid gap-3 md:grid-cols-2">{WELLNESS.map(rule)}</div>
        <p>{fillSlots(text('rules.support'), { tier1: ruleset.safety.tier1At.phq9 })}</p>
      </section>
    </div>
  );
}
