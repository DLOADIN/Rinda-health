// Charts (shadcn Chart on Recharts), loaded on demand (NFR-17). Each chart is decorative to screen readers and is
// paired with a sentence carrying the same numbers (DESIGN_SYSTEM.md "Charts"). Colours come from theme tokens.
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import type { DayCount } from '@/lib/api';
import { formatNumber } from '@/lib/format';

const shortDate = (iso: string, lang: string) =>
  new Intl.DateTimeFormat(lang === 'rw' ? 'rw-RW' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(iso));

function ChartCard({
  title,
  description,
  alt,
  children,
}: {
  title: string;
  description?: string;
  alt: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="glass gap-3">
      <CardHeader>
        <CardTitle className="text-base font-medium">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        <div aria-hidden="true">{children}</div>
        <p className="sr-only">{alt}</p>
      </CardContent>
    </Card>
  );
}

/** A ring that fills towards the weekly activity target (like a step-count ring). */
export function ActivityRing({ minutes, target }: { minutes: number; target: number }) {
  const { t } = useTranslation();
  const config = {
    minutes: { label: t('charts.activityTitle'), color: 'var(--chart-1)' },
  } satisfies ChartConfig;
  const shown = Math.min(minutes, target);
  return (
    <ChartCard title={t('charts.activityTitle')} alt={t('charts.activityAlt', { value: minutes, target })}>
      <div className="relative mx-auto aspect-square w-full max-w-56">
        <ChartContainer config={config} className="aspect-square w-full">
          <RadialBarChart
            data={[{ name: 'minutes', minutes: shown }]}
            innerRadius="72%"
            outerRadius="100%"
            startAngle={220}
            endAngle={-40}
          >
            <PolarAngleAxis type="number" domain={[0, target]} tick={false} axisLine={false} />
            <RadialBar
              dataKey="minutes"
              cornerRadius={999}
              fill="var(--color-minutes)"
              background={{ fill: 'var(--muted)' }}
            />
          </RadialBarChart>
        </ChartContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-semibold tabular-nums">{formatNumber(minutes)}</span>
          <span className="text-sm text-muted-foreground">{t('charts.activityUnit', { target })}</span>
        </div>
      </div>
    </ChartCard>
  );
}

/** Blood pressure per check-up as capsules from the bottom number to the top number (like an HRV bar chart). */
export function BpHistoryChart({
  items,
}: {
  items: Array<{ date: string; systolic: number; diastolic: number }>;
}) {
  const { t, i18n } = useTranslation();
  const config = { range: { label: t('charts.bpTitle'), color: 'var(--chart-1)' } } satisfies ChartConfig;
  const data = items.map((i) => ({
    label: shortDate(i.date, i18n.language),
    range: [i.diastolic, i.systolic],
    ...i,
  }));
  const list = items.map((i) => `${i.systolic}/${i.diastolic}`).join(', ');
  return (
    <ChartCard
      title={t('charts.bpTitle')}
      description={t('checkup.units.mmHg')}
      alt={t('charts.bpAlt', { list })}
    >
      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('charts.bpEmpty')}</p>
      ) : (
        <ChartContainer config={config} className="h-56 w-full">
          <BarChart data={data} margin={{ left: 0, right: 8 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 6" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis domain={[50, 'dataMax + 10']} tickLine={false} axisLine={false} width={36} />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={(_v, _n, item) => {
                    const p = item.payload as { systolic: number; diastolic: number };
                    return `${p.systolic}/${p.diastolic} ${t('checkup.units.mmHg')}`;
                  }}
                />
              }
            />
            <Bar dataKey="range" fill="var(--color-range)" radius={999} maxBarSize={18} />
          </BarChart>
        </ChartContainer>
      )}
    </ChartCard>
  );
}

/** Fruit and vegetable servings per check-up against the daily target. */
export function DietTrendChart({
  items,
  target,
}: {
  items: Array<{ date: string; servings: number }>;
  target: number;
}) {
  const { t, i18n } = useTranslation();
  const config = { servings: { label: t('charts.servings'), color: 'var(--chart-3)' } } satisfies ChartConfig;
  const data = items.map((i) => ({ label: shortDate(i.date, i18n.language), servings: i.servings }));
  return (
    <ChartCard
      title={t('charts.dietTitle')}
      description={t('checkup.units.servings')}
      alt={t('charts.dietAlt', { list: items.map((i) => i.servings).join(', ') })}
    >
      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('charts.dietEmpty')}</p>
      ) : (
        <ChartContainer config={config} className="h-56 w-full">
          <BarChart data={data} margin={{ left: 0, right: 8 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 6" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis
              allowDecimals={false}
              domain={[0, (max: number) => Math.max(max, target) + 1]}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <ReferenceLine y={target} stroke="var(--brand-amber-strong)" strokeDasharray="4 4" />
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
            <Bar
              dataKey="servings"
              fill="var(--color-servings)"
              stroke="var(--brand-amber-strong)"
              radius={[10, 10, 4, 4]}
              maxBarSize={28}
            />
          </BarChart>
        </ChartContainer>
      )}
    </ChartCard>
  );
}

/** Daily counts for the last 14 days, as a soft gradient area (staff dashboards). */
export function DailyAreaChart({
  title,
  data,
  tone = 'chart-1',
}: {
  title: string;
  data: DayCount[];
  tone?: 'chart-1' | 'chart-2';
}) {
  const { t, i18n } = useTranslation();
  const config = { count: { label: t('charts.count'), color: `var(--${tone})` } } satisfies ChartConfig;
  const total = data.reduce((s, d) => s + d.count, 0);
  const gradientId = `fill-${tone}`;
  return (
    <ChartCard
      title={title}
      description={t('charts.seriesAlt', { total: formatNumber(total) })}
      alt={t('charts.seriesAlt', { total })}
    >
      <ChartContainer config={config} className="h-48 w-full">
        <AreaChart
          data={data.map((d) => ({ ...d, label: shortDate(d.day, i18n.language) }))}
          margin={{ left: 0, right: 8 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-count)" stopOpacity={0.45} />
              <stop offset="95%" stopColor="var(--color-count)" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 6" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
          <Area
            dataKey="count"
            type="monotone"
            stroke="var(--color-count)"
            strokeWidth={2}
            fill={`url(#${gradientId})`}
          />
        </AreaChart>
      </ChartContainer>
    </ChartCard>
  );
}
