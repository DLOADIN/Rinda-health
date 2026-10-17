// This is the split sign-in and sign-up layout: the form on one side, and a large photo panel with a short message
// on the other. The photos change slowly on their own (never for people who prefer reduced motion).
import '@/features/landing/landing-strings';
import { ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { RindaLogo } from '@/features/landing/public-shell';

const SLIDES = [
  { image: '/images/landing/woman-phone.webp', key: 's1' },
  { image: '/images/landing/celebrate.webp', key: 's2' },
  { image: '/images/landing/friends.webp', key: 's3' },
] as const;

function PhotoPanel({ start }: { start: number }) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(start);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), 6000);
    return () => window.clearInterval(id);
  }, []);
  const slide = SLIDES[index] ?? SLIDES[0];
  const go = (step: number) => setIndex((i) => (i + step + SLIDES.length) % SLIDES.length);
  return (
    <div className="relative hidden min-h-[36rem] overflow-hidden rounded-[2rem] bg-foreground lg:block">
      {SLIDES.map((s, i) => (
        <img
          key={s.key}
          src={s.image}
          alt=""
          decoding="async"
          loading={i === start ? 'eager' : 'lazy'}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${i === index ? 'opacity-100' : 'opacity-0'}`}
        />
      ))}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-linear-to-t from-foreground/90 via-foreground/35 to-foreground/10"
      />
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col gap-5 p-10 text-background"
        aria-live="polite"
      >
        <p className="text-sm tracking-widest uppercase opacity-80">{t('app.name')}</p>
        <h2 className="max-w-md text-4xl leading-tight font-semibold tracking-tight">
          {t(`authPanel.${slide.key}.title`)}
        </h2>
        <div className="glass-strong max-w-md rounded-3xl p-5 text-foreground">
          <p className="flex items-start gap-2">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand-ember-strong" />
            {t(`authPanel.${slide.key}.body`)}
          </p>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm tabular-nums opacity-80">{`0${index + 1} / 0${SLIDES.length}`}</span>
          <div className="flex gap-2">
            <Button
              type="button"
              size="icon-touch"
              variant="outline"
              className="rounded-full border-background/40 bg-background/10 text-background backdrop-blur hover:bg-background/20"
              onClick={() => go(-1)}
              aria-label={t('authPanel.previous')}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="icon-touch"
              variant="outline"
              className="rounded-full border-background/40 bg-background/10 text-background backdrop-blur hover:bg-background/20"
              onClick={() => go(1)}
              aria-label={t('authPanel.next')}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AuthFrame({
  heading,
  children,
  slide = 0,
}: {
  heading: string;
  children: ReactNode;
  slide?: number;
}) {
  const { t } = useTranslation();
  return (
    <section className="relative isolate px-4 pt-6 pb-24 lg:pt-10">
      <div aria-hidden="true" className="bg-mesh absolute inset-0 -z-10" />
      <div className="mx-auto grid max-w-6xl items-stretch gap-8 lg:grid-cols-2 lg:gap-12">
        <div className="flex flex-col justify-center gap-6 py-4">
          <img
            src={SLIDES[slide]?.image}
            alt=""
            decoding="async"
            className="h-36 w-full rounded-3xl object-cover lg:hidden"
          />
          {/* The menu bar already shows the logo on phones, so this copy appears on large screens only. */}
          <RindaLogo className="hidden self-start rounded-full lg:block" />
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{heading}</h1>
            <p className="text-muted-foreground">{t('landing.educational')}</p>
          </div>
          {children}
        </div>
        <PhotoPanel start={slide} />
      </div>
    </section>
  );
}
