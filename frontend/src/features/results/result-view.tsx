// One check-up result: purpose statement, any urgent message first, next steps from the planner, then one glass card
// per NCD area with the band word, icon and value; tapping a card opens its details (FR-01, FR-10, FR-32, FR-33,
// FR-37). Never a combined score (C-04).
import type { DomainResult, FocusArea, Plan } from '@rinda/rules';
import { ChevronRight, CircleAlert, CloudOff, Hospital } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BandBadge } from '@/components/band-badge';
import { GetHelp } from '@/components/get-help';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { Separator } from '@/components/ui/separator';
import { GuideButton } from '@/features/guide/guide-button';
import type { Assessment } from '@/lib/api';
import { useContent } from '@/lib/content';
import { formatNumber } from '@/lib/format';

const VALUE_DOMAINS = ['activity', 'diet', 'bmi', 'waist', 'alcohol'];

export function useBandLabel() {
  const { text } = useContent();
  return (r: Pick<DomainResult, 'domain' | 'band'>) =>
    r.band === 'insufficient' ? text('band.insufficient') : text(`band.${r.domain}.${r.band}`);
}

function useValueText() {
  const { t } = useTranslation();
  return (r: DomainResult, assessment: Assessment) => {
    if (r.domain === 'bp' && assessment.values?.systolic != null && assessment.values.diastolic != null) {
      return `${assessment.values.systolic}/${assessment.values.diastolic} ${t('checkup.units.mmHg')}`;
    }
    return r.value !== null && VALUE_DOMAINS.includes(r.domain)
      ? t(`results.value.${r.domain}`, { value: formatNumber(r.value) })
      : null;
  };
}

function FocusItem({ area, results }: { area: FocusArea; results: DomainResult[] }) {
  const { t } = useTranslation();
  const label = useBandLabel();
  const first = results.find((r) => r.domain === area.domains[0]);
  return (
    <Item variant="outline" className="glass">
      <ItemContent>
        <ItemTitle className="flex flex-wrap items-center gap-2">
          {area.domains.map((d) => t(`domains.${d}`)).join(' · ')}
          {first ? <BandBadge severity={first.severity} label={label(first)} /> : null}
        </ItemTitle>
        {area.target ? (
          <ItemDescription>{t(`results.targets.${area.target.kind}`, area.target)}</ItemDescription>
        ) : null}
      </ItemContent>
    </Item>
  );
}

function stepFor(plan: Plan, domain: string) {
  return (
    [...plan.focus, ...plan.other].find((f) => f.domains.includes(domain as FocusArea['domains'][number])) ??
    null
  );
}

export function DomainCard({ result, assessment }: { result: DomainResult; assessment: Assessment }) {
  const { t } = useTranslation();
  const label = useBandLabel();
  const valueText = useValueText();
  const value = valueText(result, assessment);
  const step = stepFor(assessment.plan, result.domain);
  const area = t(`domains.${result.domain}`);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={t('results.open', { area })}
          className="group text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-xl"
        >
          <Card
            className={`glass h-full transition-transform group-hover:-translate-y-0.5 ${result.severity === 'unknown' ? 'border-dashed' : ''}`}
          >
            <CardHeader className="flex flex-row items-start justify-between gap-2">
              <CardTitle className="text-base">{area}</CardTitle>
              <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <BandBadge severity={result.severity} label={label(result)} />
              {value ? <p className="text-xl font-semibold tabular-nums">{value}</p> : null}
            </CardContent>
          </Card>
        </button>
      </DialogTrigger>
      <DialogContent className="glass-strong">
        <DialogHeader>
          <DialogTitle>{area}</DialogTitle>
          <DialogDescription>{t('results.educational')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <BandBadge severity={result.severity} label={label(result)} className="self-start" />
          {value ? (
            <div>
              <p className="text-sm text-muted-foreground">{t('results.yourValue')}</p>
              <p className="text-2xl font-semibold tabular-nums">{value}</p>
            </div>
          ) : null}
          <Separator />
          <div>
            <p className="text-sm text-muted-foreground">{t('results.rule')}</p>
            <p>{result.source}</p>
            <p className="text-sm text-muted-foreground">
              {t('results.rulesetVersion', { version: result.rulesetVersion })}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t('results.nextStep')}</p>
            <p>
              {step?.target ? t(`results.targets.${step.target.kind}`, step.target) : t('results.noStep')}
            </p>
          </div>
        </div>
        <DialogFooter>
          <GuideButton
            assessment={assessment}
            chip={`explain.${result.domain}`}
            label={t('results.askAbout')}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ResultView({ assessment, compact = false }: { assessment: Assessment; compact?: boolean }) {
  const { t } = useTranslation();
  const label = useBandLabel();
  const { results, plan } = assessment;

  if (compact) {
    return (
      <ItemGroup className="grid gap-2 sm:grid-cols-2">
        {results.ncd.map((r) => (
          <Item key={r.domain} variant="outline" size="sm" className="bg-card/60">
            <ItemContent>
              <ItemTitle>{t(`domains.${r.domain}`)}</ItemTitle>
            </ItemContent>
            <BandBadge severity={r.severity} label={label(r)} />
          </Item>
        ))}
      </ItemGroup>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {assessment.provisional ? (
        <Alert className="glass">
          <CloudOff aria-hidden="true" />
          <AlertTitle>{t('offline.provisionalTitle')}</AlertTitle>
          <AlertDescription>{t('offline.provisionalBody')}</AlertDescription>
        </Alert>
      ) : null}
      <Alert className="glass">
        <CircleAlert aria-hidden="true" />
        <AlertDescription>{t('results.educational')}</AlertDescription>
      </Alert>

      {plan.urgent ? (
        <Alert className="border-band-urgent">
          <Hospital aria-hidden="true" />
          <AlertTitle>{label({ domain: 'bp', band: 'seek_care_today' })}</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            {t('results.urgent')}
            <GetHelp />
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="flex flex-col gap-3" aria-labelledby="next-steps">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="next-steps" className="text-xl font-semibold">
            {t('results.nextSteps')}
          </h2>
          <GuideButton assessment={assessment} chip="plan_week" />
        </div>
        {plan.keepGoingId ? <p>{t('results.keepGoing')}</p> : null}
        <ItemGroup className="flex flex-col gap-2">
          {plan.focus.map((area) => (
            <FocusItem key={area.id} area={area} results={results.ncd} />
          ))}
        </ItemGroup>
        {plan.other.length > 0 ? (
          <>
            <h3 className="font-semibold">{t('results.otherResults')}</h3>
            <ItemGroup className="flex flex-col gap-2">
              {plan.other.map((area) => (
                <FocusItem key={area.id} area={area} results={results.ncd} />
              ))}
            </ItemGroup>
          </>
        ) : null}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="areas">
        <div className="flex items-center gap-2">
          <h2 id="areas" className="text-xl font-semibold">
            {t('results.areas')}
          </h2>
          {assessment.provisional ? <Badge variant="outline">{t('offline.savedOnPhone')}</Badge> : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {results.ncd.map((r) => (
            <DomainCard key={r.domain} result={r} assessment={assessment} />
          ))}
        </div>
      </section>
    </div>
  );
}
