// Home for every role. Participants get a glass hero ("glance"), metric cards, charts ("focus") and their latest
// areas ("explore"), following the Oura-style levels in health-ui-inspiration.md. Staff get metrics and 14-day charts.
import type { Me } from '@rinda/schemas';
import { ArrowRight, HeartPulse } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ApiError } from '@/components/api-error';
import { BandBadge } from '@/components/band-badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { Skeleton } from '@/components/ui/skeleton';
import { GuideButton } from '@/features/guide/guide-button';
import { ResultView, useBandLabel } from '@/features/results/result-view';
import { useAssessmentsQuery, useDashboardQuery, type Assessment, type Dashboard } from '@/lib/api';
import { formatDate, formatNumber } from '@/lib/format';
import { displayNameOf } from '@/lib/me';
import { useCached } from '@/lib/use-cached';
import { RULESET_V1 } from '@rinda/content';

const ActivityRing = lazy(() =>
  import('@/features/dashboard/charts').then((m) => ({ default: m.ActivityRing })),
);
const BpHistoryChart = lazy(() =>
  import('@/features/dashboard/charts').then((m) => ({ default: m.BpHistoryChart })),
);
const DietTrendChart = lazy(() =>
  import('@/features/dashboard/charts').then((m) => ({ default: m.DietTrendChart })),
);
const DailyAreaChart = lazy(() =>
  import('@/features/dashboard/charts').then((m) => ({ default: m.DailyAreaChart })),
);

const chartFallback = <Skeleton className="h-72 rounded-xl" />;

/** Glass section cards: label, large number and a one-line hint. */
function MetricCards({ data }: { data: Dashboard }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      {data.cards.map((c) => (
        <Card key={c.key} className="glass @container/card">
          <CardHeader>
            <CardDescription>{t(`dashboard.metrics.${c.key}`)}</CardDescription>
            <CardTitle className="text-3xl font-semibold tabular-nums @[250px]/card:text-4xl">
              {formatNumber(c.value)}
            </CardTitle>
          </CardHeader>
          <CardFooter className="text-sm text-muted-foreground">{t(`dashboard.hints.${c.key}`)}</CardFooter>
        </Card>
      ))}
    </div>
  );
}

function ListCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle className="text-xl">{title}</CardTitle>
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function EmptyNote({ text }: { text: string }) {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyDescription>{text}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function ViewAll({ to }: { to: string }) {
  const { t } = useTranslation();
  return (
    <Button asChild variant="outline" size="sm">
      <Link to={to}>
        {t('dashboard.viewAll')}
        <ArrowRight aria-hidden="true" data-icon="inline-end" />
      </Link>
    </Button>
  );
}

/** The participant hero: greeting, a calm call to action and the latest bands as floating glass chips. */
function ParticipantHero({ me, latest }: { me: Me; latest: Assessment | null }) {
  const { t } = useTranslation();
  const label = useBandLabel();
  const name = displayNameOf(me);
  const chips = latest ? latest.results.ncd.filter((r) => r.domain === 'activity' || r.domain === 'bp') : [];
  return (
    <Card className="glass-strong overflow-hidden">
      <CardContent className="grid items-center gap-6 md:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col gap-3">
          <p className="text-lg text-muted-foreground">
            {name ? t('dashboard.greeting', { name }) : t('dashboard.greetingNoName')}
          </p>
          <h1 className="text-3xl leading-tight font-semibold tracking-tight md:text-4xl">
            {t('home.heroTitle')}
          </h1>
          <p className="text-muted-foreground">
            {latest ? t('home.lastCheckup', { date: formatDate(latest.createdAt) }) : t('home.firstCheckup')}
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button asChild>
              <Link to="/app/checkup">{t('dashboard.startCheckup')}</Link>
            </Button>
            <GuideButton assessment={latest} />
          </div>
        </div>
        <div className="relative mx-auto flex aspect-square w-full max-w-64 items-center justify-center">
          <div className="hero-orb flex size-40 items-center justify-center rounded-full md:size-48">
            <HeartPulse
              aria-hidden="true"
              className="size-20 text-primary-foreground md:size-24"
              strokeWidth={1.5}
            />
          </div>
          {chips.map((r, i) => (
            <div
              key={r.domain}
              className={`glass-strong absolute flex flex-col gap-1 rounded-xl px-3 py-2 ${i === 0 ? 'top-2 -left-2' : '-right-2 bottom-4'}`}
            >
              <span className="text-xs text-muted-foreground">{t(`domains.${r.domain}`)}</span>
              <BandBadge severity={r.severity} label={label(r)} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ParticipantCharts({ me }: { me: Me }) {
  const { data: live, error } = useAssessmentsQuery();
  const { data } = useCached(`assessments:${me.id}`, live, error);
  const history = [...(data ?? [])].reverse(); // oldest first for charts
  const latest = data?.[0];
  const activity = latest?.results.ncd.find((r) => r.domain === 'activity')?.value ?? null;
  const bp = history.flatMap((a) =>
    a.values?.systolic != null && a.values.diastolic != null
      ? [{ date: a.createdAt, systolic: a.values.systolic, diastolic: a.values.diastolic }]
      : [],
  );
  const diet = history.flatMap((a) =>
    a.values?.servingsPerDay != null ? [{ date: a.createdAt, servings: a.values.servingsPerDay }] : [],
  );
  return (
    <div className="grid gap-4 @3xl/main:grid-cols-3">
      <Suspense fallback={chartFallback}>
        <ActivityRing minutes={activity ?? 0} target={RULESET_V1.domains.activity.meetsAt} />
      </Suspense>
      <Suspense fallback={chartFallback}>
        <BpHistoryChart items={bp.slice(-10)} />
      </Suspense>
      <Suspense fallback={chartFallback}>
        <DietTrendChart items={diet.slice(-10)} target={RULESET_V1.domains.diet.meetsAt} />
      </Suspense>
    </div>
  );
}

function RoleSections({ data, me }: { data: Dashboard; me: Me }) {
  const { t } = useTranslation();
  if (data.role === 'participant') {
    return (
      <>
        {data.deletionRequested ? (
          <Alert>
            <AlertDescription>{t('dashboard.deletionRequested')}</AlertDescription>
          </Alert>
        ) : null}
        <ParticipantCharts me={me} />
        <ListCard
          title={t('dashboard.latest')}
          action={
            data.latest ? (
              <Button asChild variant="outline" size="sm">
                <Link to={`/app/results/${data.latest.id}`}>{t('dashboard.viewResult')}</Link>
              </Button>
            ) : null
          }
        >
          {data.latest ? (
            <ResultView assessment={data.latest} compact />
          ) : (
            <EmptyNote text={t('dashboard.noCheckups')} />
          )}
        </ListCard>
      </>
    );
  }
  if (data.role === 'facilitator') {
    return (
      <div className="grid gap-4 @4xl/main:grid-cols-2">
        {data.sessionsByDay ? (
          <Suspense fallback={chartFallback}>
            <DailyAreaChart title={t('charts.sessionsTitle')} data={data.sessionsByDay} />
          </Suspense>
        ) : null}
        <ListCard title={t('dashboard.recentSessions')} action={<ViewAll to="/app/sessions" />}>
          {data.recentSessions?.length ? (
            <ItemGroup className="flex flex-col gap-2">
              {data.recentSessions.map((s) => (
                <Item key={s.id} variant="outline" asChild>
                  <Link to={`/app/sessions/${s.id}`}>
                    <ItemContent>
                      <ItemTitle>{s.participantLabel}</ItemTitle>
                      <ItemDescription>{formatDate(s.startedAt, true)}</ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <Badge variant="outline">{s.endedAt ? t('sessions.ended') : t('sessions.open')}</Badge>
                    </ItemActions>
                  </Link>
                </Item>
              ))}
            </ItemGroup>
          ) : (
            <EmptyNote text={t('dashboard.noSessions')} />
          )}
        </ListCard>
      </div>
    );
  }
  if (data.role === 'researcher_admin') {
    return (
      <>
        <div className="grid gap-4 @4xl/main:grid-cols-2">
          {data.checkupsByDay ? (
            <Suspense fallback={chartFallback}>
              <DailyAreaChart title={t('charts.checkupsTitle')} data={data.checkupsByDay} />
            </Suspense>
          ) : null}
          {data.signupsByDay ? (
            <Suspense fallback={chartFallback}>
              <DailyAreaChart title={t('charts.signupsTitle')} data={data.signupsByDay} tone="chart-2" />
            </Suspense>
          ) : null}
        </div>
        <div className="grid gap-4 @4xl/main:grid-cols-2">
          <ListCard title={t('dashboard.usersByRole')} action={<ViewAll to="/app/users" />}>
            <ItemGroup className="flex flex-col gap-2">
              {(data.usersByRole ?? []).map((r) => (
                <Item key={r.role} variant="outline" size="sm">
                  <ItemContent>
                    <ItemTitle>{t(`auth.roles.${r.role}`)}</ItemTitle>
                  </ItemContent>
                  <ItemActions className="text-lg font-semibold">{formatNumber(r.count)}</ItemActions>
                </Item>
              ))}
            </ItemGroup>
          </ListCard>
          <ListCard title={t('dashboard.safetyByTier')} action={<ViewAll to="/app/safety" />}>
            {data.safetyByTier?.length ? (
              <ItemGroup className="flex flex-col gap-2">
                {data.safetyByTier.map((r) => (
                  <Item key={r.tier} variant="outline" size="sm">
                    <ItemContent>
                      <ItemTitle>{t('dashboard.tier', { tier: r.tier })}</ItemTitle>
                    </ItemContent>
                    <ItemActions className="text-lg font-semibold">{formatNumber(r.count)}</ItemActions>
                  </Item>
                ))}
              </ItemGroup>
            ) : (
              <EmptyNote text={t('dashboard.noSafety')} />
            )}
          </ListCard>
        </div>
      </>
    );
  }
  return (
    <ListCard title={t('dashboard.waitingReviews')} action={<ViewAll to="/app/content" />}>
      {data.waiting?.length ? (
        <ItemGroup className="flex flex-col gap-2">
          {data.waiting.map((c) => (
            <Item key={c.id} variant="outline" asChild>
              <Link to="/app/content">
                <ItemContent>
                  <ItemTitle>
                    {c.key} · {c.version}
                  </ItemTitle>
                  <ItemDescription>
                    {c.type} {c.language ? `· ${c.language.toUpperCase()}` : ''}
                  </ItemDescription>
                </ItemContent>
              </Link>
            </Item>
          ))}
        </ItemGroup>
      ) : (
        <EmptyNote text={t('dashboard.nothingWaiting')} />
      )}
    </ListCard>
  );
}

export function HomePage({ me }: { me: Me }) {
  const { t } = useTranslation();
  const { data: live, isLoading, error } = useDashboardQuery();
  const { data, fromCache } = useCached(`dashboard:${me.id}`, live, error);
  const name = displayNameOf(me);
  const isParticipant = me.role === 'participant';
  return (
    <div className="flex flex-col gap-6">
      {isParticipant ? (
        <ParticipantHero me={me} latest={data?.latest ?? null} />
      ) : (
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold">
            {name ? t('dashboard.greeting', { name }) : t('dashboard.greetingNoName')}
          </h1>
          <p className="text-muted-foreground">{t(`dashboard.subtitle.${me.role}`)}</p>
        </div>
      )}
      {fromCache ? null : <ApiError error={error} />}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : null}
      {data ? (
        <>
          <MetricCards data={data} />
          <RoleSections data={data} me={me} />
        </>
      ) : null}
    </div>
  );
}
