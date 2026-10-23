import type { Severity } from '@rinda/rules';
import { Footprints } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BandBadge } from '@/components/band-badge';
import { useContent } from '@/lib/content';

const SAMPLE: Array<{ domain: string; band: string; severity: Severity }> = [
  { domain: 'bp', band: 'normal', severity: 'ok' },
  { domain: 'activity', band: 'below', severity: 'attention' },
  { domain: 'diet', band: 'below', severity: 'attention' },
  { domain: 'tobacco', band: 'no_reported_risk', severity: 'ok' },
];

function Ring({ value, max }: { value: number; max: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 80 80" className="size-20 -rotate-90" aria-hidden="true">
      <circle cx="40" cy="40" r={r} className="fill-none stroke-muted" strokeWidth="8" />
      <circle
        cx="40"
        cy="40"
        r={r}
        className="fill-none stroke-primary"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value / max)}
      />
    </svg>
  );
}

export function PhoneMockup() {
  const { t } = useTranslation();
  const { text } = useContent();
  return (
    <div
      aria-hidden="true"
      data-keep-round
      className="relative mx-auto w-[17.5rem] rounded-[2.75rem] border-[10px] border-foreground bg-foreground shadow-2xl shadow-foreground/30 sm:w-[19rem]"
    >
      <div className="absolute top-2 left-1/2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-foreground" />
      <div className="bg-mesh flex flex-col gap-3 overflow-hidden rounded-[2.1rem] px-4 pt-9 pb-5">
        <div>
          <p className="text-xs text-muted-foreground">{t('landing.phone.greeting')}</p>
          <p className="text-lg font-semibold">{t('landing.phone.latest')}</p>
        </div>
        <div className="glass flex items-center gap-3 rounded-2xl p-3">
          <div className="relative grid place-items-center">
            <Ring value={120} max={150} />
            <span className="absolute text-sm font-semibold tabular-nums">120</span>
          </div>
          <div className="text-xs">
            <p className="flex items-center gap-1 font-medium">
              <Footprints aria-hidden="true" className="size-3.5 text-brand-ember-strong" />
              {t('domains.activity')}
            </p>
            <p className="text-muted-foreground">{t('landing.phone.minutes', { value: 120, target: 150 })}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {SAMPLE.map((s) => (
            <div
              key={s.domain}
              className="glass flex items-center justify-between gap-2 rounded-xl px-3 py-2"
            >
              <span className="text-xs font-medium">{t(`domains.${s.domain}`)}</span>
              <BandBadge
                severity={s.severity}
                label={text(`band.${s.domain}.${s.band}`)}
                className="text-[0.7rem]"
              />
            </div>
          ))}
        </div>
        <div className="rounded-2xl bg-primary p-3 text-primary-foreground">
          <p className="text-[0.7rem] font-medium">{t('landing.phone.nextStep')}</p>
          <p className="text-sm font-semibold">{t('landing.phone.step')}</p>
        </div>
      </div>
    </div>
  );
}
