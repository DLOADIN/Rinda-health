import { Download, Printer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '@/components/api-error';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useResearchReportQuery, type ResearchReport } from '@/lib/api';
import { useContent } from '@/lib/content';
import { formatDate, formatNumber } from '@/lib/format';

const BAND_ORDER: Record<string, string[]> = {
  tobacco: ['no_reported_risk', 'attention'],
  alcohol: ['lower_risk', 'attention'],
  activity: ['meets', 'below'],
  diet: ['meets', 'below'],
  bmi: ['underweight', 'normal', 'overweight', 'obesity'],
  waist: ['not_increased', 'increased', 'substantially_increased'],
  bp: ['normal', 'high_normal', 'hypertension_range', 'seek_care_today'],
};

function Bar({
  value,
  total,
  className = 'bg-primary',
}: {
  value: number;
  total: number;
  className?: string;
}) {
  const width = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <div className={`h-full rounded-full ${className}`} style={{ width: `${width}%` }} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="glass">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl font-semibold tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

const seconds = (s: number | null) =>
  s === null ? '—' : s < 60 ? `${s} s` : `${Math.round((s / 60) * 10) / 10} min`;

function toCsv(
  report: ResearchReport,
  label: (domain: string, band: string) => string,
  task: (code: string) => string,
) {
  const lines: string[][] = [
    ['section', 'item', 'value'],
    ['generated', 'at', report.generatedAt],
    ['generated', 'ruleset', report.rulesetVersion],
    ...Object.entries(report.participants).map(([k, v]) => ['participants', k, String(v)]),
    ['checkups', 'total', String(report.checkups)],
    ['sessions', 'total', String(report.sessions.total)],
    ['sessions', 'ended', String(report.sessions.ended)],
    ...report.tasks.flatMap((x) => [
      ['task', `${task(x.task)} recorded`, String(x.recorded)],
      ['task', `${task(x.task)} completed`, String(x.completed)],
      ['task', `${task(x.task)} completed with help`, String(x.withHelp)],
      ['task', `${task(x.task)} not completed`, String(x.notCompleted)],
      ['task', `${task(x.task)} median seconds`, x.medianSeconds === null ? '' : String(x.medianSeconds)],
    ]),
    ['sus', 'responses', String(report.sus.responses)],
    ['sus', 'mean', report.sus.mean === null ? '' : String(report.sus.mean)],
    ['sus', 'median', report.sus.median === null ? '' : String(report.sus.median)],
    ['sus', 'min', report.sus.min === null ? '' : String(report.sus.min)],
    ['sus', 'max', report.sus.max === null ? '' : String(report.sus.max)],
    ...report.sus.bands.map((b) => ['sus band', b.band, String(b.count)]),
    ...Object.entries(report.bands).flatMap(([domain, bands]) =>
      Object.entries(bands).map(([band, n]) => ['result', `${domain}: ${label(domain, band)}`, String(n)]),
    ),
    ...report.safety.map((s) => ['safety', `tier ${s.tier}`, String(s.count)]),
    ...report.languages.map((l) => ['language', l.language, String(l.count)]),
  ];
  return lines.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\r\n');
}

export function ResearchPage() {
  const { t } = useTranslation();
  const { text } = useContent();
  const { data, isLoading, error } = useResearchReportQuery(undefined, { refetchOnMountOrArgChange: true });
  const bandLabel = (domain: string, band: string) =>
    band === 'insufficient' ? text('band.insufficient') : text(`band.${domain}.${band}`);
  const taskName = (code: string) => t(`sessions.task.${code}`);

  const download = () => {
    if (!data) return;
    const blob = new Blob([`${String.fromCharCode(0xfeff)}${toCsv(data, bandLabel, taskName)}`], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rinda-research-report-${data.generatedAt.slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div id="research-report" className="flex flex-col gap-6">
      <PageHeader
        title={t('research.title')}
        description={
          data
            ? t('research.generated', {
                date: formatDate(data.generatedAt, true),
                version: data.rulesetVersion,
              })
            : t('research.intro')
        }
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button variant="outline" onClick={download} disabled={!data}>
              <Download aria-hidden="true" data-icon="inline-start" />
              {t('research.csv')}
            </Button>
            <Button onClick={() => window.print()} disabled={!data}>
              <Printer aria-hidden="true" data-icon="inline-start" />
              {t('research.print')}
            </Button>
          </div>
        }
      />
      <ApiError error={error} />
      {isLoading ? <Skeleton className="h-96" /> : null}
      {data ? (
        <>
          <p className="text-sm text-muted-foreground">{t('research.privacy')}</p>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label={t('research.participants')} value={data.participants.total} />
            <Stat label={t('research.consented')} value={data.participants.consented} />
            <Stat label={t('research.checkups')} value={data.checkups} />
            <Stat
              label={t('research.susMean')}
              value={data.sus.mean === null ? '—' : formatNumber(data.sus.mean)}
            />
          </div>

          <Card className="glass">
            <CardHeader>
              <CardTitle className="text-xl">{t('research.tasksTitle')}</CardTitle>
              <CardDescription>
                {t('research.tasksBody', { sessions: data.sessions.total, ended: data.sessions.ended })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('research.task')}</TableHead>
                    <TableHead className="text-right">{t('sessions.outcomes.completed')}</TableHead>
                    <TableHead className="text-right">{t('sessions.outcomes.completed_with_help')}</TableHead>
                    <TableHead className="text-right">{t('sessions.outcomes.not_completed')}</TableHead>
                    <TableHead className="text-right">{t('research.medianTime')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.tasks.map((x) => (
                    <TableRow key={x.task}>
                      <TableCell className="min-w-40 whitespace-normal">
                        <span className="font-medium">{taskName(x.task)}</span>
                        <Bar value={x.completed + x.withHelp} total={x.recorded} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{x.completed}</TableCell>
                      <TableCell className="text-right tabular-nums">{x.withHelp}</TableCell>
                      <TableCell className="text-right tabular-nums">{x.notCompleted}</TableCell>
                      <TableCell className="text-right tabular-nums">{seconds(x.medianSeconds)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="glass">
              <CardHeader>
                <CardTitle className="text-xl">{t('research.susTitle')}</CardTitle>
                <CardDescription>
                  {t('research.susBody', {
                    n: data.sus.responses,
                    median: data.sus.median ?? '—',
                    min: data.sus.min ?? '—',
                    max: data.sus.max ?? '—',
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {data.sus.bands.map((b) => (
                  <div key={b.band} className="flex flex-col gap-1">
                    <div className="flex justify-between text-sm">
                      <span>{t(`research.susBands.${b.band}`)}</span>
                      <span className="tabular-nums">{b.count}</span>
                    </div>
                    <Bar value={b.count} total={data.sus.responses} className="bg-chart-2" />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="glass">
              <CardHeader>
                <CardTitle className="text-xl">{t('research.othersTitle')}</CardTitle>
                <CardDescription>
                  {t('research.othersBody', {
                    withCheckup: data.participants.withCheckup,
                    wellness: data.participants.wellnessCompleted,
                    wellnessConsent: data.participants.wellnessConsent,
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 text-sm">
                <div>
                  <p className="mb-1 font-medium">{t('research.safety')}</p>
                  {data.safety.length === 0 ? (
                    <p className="text-muted-foreground">{t('research.none')}</p>
                  ) : (
                    data.safety.map((s) => (
                      <p key={s.tier} className="tabular-nums">
                        {t('research.tier', { tier: s.tier, count: s.count })}
                      </p>
                    ))
                  )}
                </div>
                <div>
                  <p className="mb-1 font-medium">{t('research.languages')}</p>
                  {data.languages.map((l) => (
                    <p key={l.language} className="tabular-nums">
                      {t(`language.${l.language}`, { defaultValue: l.language })}: {l.count}
                    </p>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="glass">
            <CardHeader>
              <CardTitle className="text-xl">{t('research.bandsTitle')}</CardTitle>
              <CardDescription>{t('research.bandsBody')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              {Object.entries(BAND_ORDER).map(([domain, order]) => {
                const counts = data.bands[domain] ?? {};
                const total = Object.values(counts).reduce((x, y) => x + y, 0);
                const bands = [...order, ...(counts['insufficient'] ? ['insufficient'] : [])];
                return (
                  <div key={domain} className="flex flex-col gap-2">
                    <p className="font-medium">{t(`domains.${domain}`)}</p>
                    {bands.map((band) => (
                      <div key={band} className="flex flex-col gap-1">
                        <div className="flex justify-between gap-2 text-sm">
                          <span>{bandLabel(domain, band)}</span>
                          <span className="tabular-nums">{counts[band] ?? 0}</span>
                        </div>
                        <Bar value={counts[band] ?? 0} total={total} className="bg-chart-1" />
                      </div>
                    ))}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
