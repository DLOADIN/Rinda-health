import '@/features/landing/landing-strings';
import {
  ArrowRight,
  BookOpenCheck,
  CloudOff,
  Footprints,
  HeartHandshake,
  Languages,
  LifeBuoy,
  Lock,
  Mail,
  MapPin,
  MessageCircleQuestion,
  Phone,
  ShieldCheck,
  Sparkles,
  Sprout,
  Stethoscope,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { BorderBeam } from '@/components/magicui/border-beam';
import { DotPattern } from '@/components/magicui/dot-pattern';
import { Marquee } from '@/components/magicui/marquee';
import { ShimmerButton } from '@/components/magicui/shimmer-button';
import { Reveal } from '@/components/reveal';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PhoneMockup } from '@/features/landing/phone-mockup';
import { CONTACT_EMAIL, CONTACT_PHONE, CONTACT_PHONE_SHOWN } from '@/features/landing/contact';
import { RindaLogo } from '@/features/landing/public-shell';
import { cn } from '@/lib/utils';

const AREAS = ['tobacco', 'alcohol', 'activity', 'diet', 'bmi', 'waist', 'bp', 'phq9', 'gad7'] as const;

function SectionHeading({
  id,
  eyebrow,
  title,
  subtitle,
}: {
  id: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mx-auto mb-10 flex max-w-2xl flex-col items-center gap-3 text-center">
      <span className="rounded-full border border-primary/20 bg-brand-blush-soft px-3 py-1 text-sm font-medium text-brand-ember-strong">
        {eyebrow}
      </span>
      <h2 id={id} className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
        {title}
      </h2>
      {subtitle ? <p className="text-lg text-pretty text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}

function Section({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn('scroll-mt-24 px-4 py-20 md:py-28', className)}
    >
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

function FloatingChip({
  icon: Icon,
  label,
  className,
}: {
  icon: LucideIcon;
  label: string;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'glass-strong absolute z-10 hidden items-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium md:flex',
        className,
      )}
    >
      <span className="grid size-8 place-items-center rounded-xl bg-brand-blush-soft text-brand-ember-strong">
        <Icon className="size-4" />
      </span>
      {label}
    </div>
  );
}

function Hero() {
  const { t } = useTranslation();
  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate overflow-hidden px-4 pt-12 pb-20 md:pt-20"
    >
      <div aria-hidden="true" className="bg-mesh absolute inset-0 -z-20" />
      <DotPattern className="-z-10 opacity-60" />
      <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1.1fr_0.9fr]">
        <Reveal className="flex flex-col items-center gap-6 text-center lg:items-start lg:text-left">
          <span className="glass inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium">
            <Sparkles aria-hidden="true" className="size-4 text-brand-ember-strong" />
            {t('landing.hero.badge')}
          </span>
          <h1
            id="hero-title"
            className="text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl"
          >
            {t('landing.hero.title1')}{' '}
            <span className="bg-linear-to-r from-brand-ember-strong to-brand-rose-strong bg-clip-text text-transparent">
              {t('landing.hero.title2')}
            </span>{' '}
            {t('landing.hero.title3')}
          </h1>
          <p className="max-w-xl text-lg text-pretty text-muted-foreground">{t('landing.hero.subtitle')}</p>
          <div className="flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
            <ShimmerButton asChild className="w-full sm:w-auto">
              <Link to="/signup">
                {t('landing.hero.primary')}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </ShimmerButton>
            <Button asChild variant="outline" className="w-full rounded-full bg-card/60 sm:w-auto">
              <a href="#how">{t('landing.hero.secondary')}</a>
            </Button>
          </div>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck aria-hidden="true" className="size-4" />
            {t('landing.educational')}
          </p>
        </Reveal>
        <Reveal delay={150} className="relative mx-auto py-6">
          <div className="motion-safe:animate-float">
            <PhoneMockup />
          </div>
          <FloatingChip
            icon={CloudOff}
            label={t('landing.float.offline')}
            className="top-6 -left-44 xl:-left-52"
          />
          <FloatingChip
            icon={Lock}
            label={t('landing.float.private')}
            className="top-[42%] -right-40 xl:-right-52"
          />
          <FloatingChip
            icon={HeartHandshake}
            label={t('landing.float.mood')}
            className="bottom-4 -left-40 xl:-left-52"
          />
        </Reveal>
      </div>
    </section>
  );
}

function Stats() {
  const { t } = useTranslation();
  const stats = [
    { value: '6', label: t('landing.stats.areas') },
    { value: '2', label: t('landing.stats.languages') },
    { value: '0', label: t('landing.stats.ads') },
    { value: '~10', label: t('landing.stats.minutes') },
  ];
  return (
    <div className="px-4">
      <div className="glass mx-auto grid max-w-5xl grid-cols-2 gap-6 rounded-3xl p-6 md:grid-cols-4 md:p-8">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <p className="text-4xl font-semibold tracking-tight text-brand-ember-strong tabular-nums">
              {s.value}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AreasMarquee() {
  const { t } = useTranslation();
  return (
    <div className="relative mx-auto mt-12 max-w-6xl [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
      <Marquee className="[--duration:45s]">
        {AREAS.map((a) => (
          <span key={a} className="glass rounded-full px-5 py-2.5 text-sm font-medium whitespace-nowrap">
            {t(`domains.${a}`)}
          </span>
        ))}
      </Marquee>
    </div>
  );
}

function Features() {
  const { t } = useTranslation();
  const items: Array<{ key: string; icon: LucideIcon; wide?: boolean; image?: string }> = [
    { key: 'checkup', icon: Stethoscope, wide: true, image: '/images/landing/man-phone.webp' },
    { key: 'results', icon: BookOpenCheck },
    { key: 'steps', icon: Footprints },
    { key: 'mood', icon: HeartHandshake, image: '/images/landing/friends.webp' },
    { key: 'guide', icon: MessageCircleQuestion },
    { key: 'offline', icon: CloudOff },
  ];
  return (
    <Section id="features">
      <SectionHeading
        id="features-title"
        eyebrow={t('landing.features.eyebrow')}
        title={t('landing.features.title')}
        subtitle={t('landing.features.subtitle')}
      />
      <div className="grid gap-4 md:grid-cols-3">
        {items.map(({ key, icon: Icon, wide, image }, i) => (
          <Reveal
            key={key}
            delay={i * 70}
            className={cn(wide && 'md:col-span-2', key === 'mood' && 'md:row-span-2')}
          >
            <Card className="glass relative h-full overflow-hidden">
              {i === 0 ? <BorderBeam duration={9} size={220} /> : null}
              <CardHeader>
                <span className="mb-2 grid size-11 place-items-center rounded-2xl bg-brand-blush-soft text-brand-ember-strong">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <CardTitle className="text-xl">{t(`landing.features.${key}.title`)}</CardTitle>
                <CardDescription className="text-base">{t(`landing.features.${key}.body`)}</CardDescription>
              </CardHeader>
              {image ? (
                <CardContent className="mt-auto">
                  <img
                    src={image}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className={cn(
                      'w-full rounded-2xl object-cover',
                      key === 'mood' ? 'aspect-[4/5]' : 'aspect-[16/7]',
                    )}
                  />
                </CardContent>
              ) : null}
            </Card>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

function HowItWorks() {
  const { t } = useTranslation();
  return (
    <Section id="how" className="bg-card/40">
      <SectionHeading id="how-title" eyebrow={t('landing.how.eyebrow')} title={t('landing.how.title')} />
      <ol className="grid gap-6 md:grid-cols-3">
        {(['s1', 's2', 's3'] as const).map((s, i) => (
          <li key={s}>
            <Reveal delay={i * 120} className="glass relative h-full rounded-3xl p-6">
              <span
                aria-hidden="true"
                className="text-6xl font-semibold text-brand-blush-strong"
              >{`0${i + 1}`}</span>
              <h3 className="mt-3 text-xl font-semibold">{t(`landing.how.${s}.title`)}</h3>
              <p className="mt-2 text-muted-foreground">{t(`landing.how.${s}.body`)}</p>
            </Reveal>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function MadeForRwanda() {
  const { t } = useTranslation();
  return (
    <Section id="rwanda">
      <div className="grid items-center gap-10 md:grid-cols-2">
        <Reveal>
          <img
            src="/images/landing/runner.webp"
            alt=""
            loading="lazy"
            decoding="async"
            className="aspect-[4/3] w-full rounded-3xl object-cover shadow-xl shadow-foreground/10"
          />
        </Reveal>
        <Reveal delay={120} className="flex flex-col gap-4">
          <span className="self-start rounded-full border border-primary/20 bg-brand-blush-soft px-3 py-1 text-sm font-medium text-brand-ember-strong">
            {t('landing.rwanda.eyebrow')}
          </span>
          <h2 id="rwanda-title" className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            {t('landing.rwanda.title')}
          </h2>
          <p className="text-lg text-muted-foreground">{t('landing.rwanda.body')}</p>
          <ShimmerButton asChild className="self-start">
            <Link to="/signup">
              {t('landing.hero.primary')}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </ShimmerButton>
        </Reveal>
      </div>
    </Section>
  );
}

function Privacy() {
  const { t } = useTranslation();
  const points: Array<[string, LucideIcon]> = [
    ['p1', ShieldCheck],
    ['p2', Lock],
    ['p3', Sprout],
    ['p4', Trash2],
    ['p5', LifeBuoy],
  ];
  return (
    <Section id="privacy" className="bg-card/40">
      <div className="grid items-center gap-10 md:grid-cols-[0.9fr_1.1fr]">
        <Reveal className="relative overflow-hidden rounded-3xl">
          <img
            src="/images/landing/woman-phone.webp"
            alt=""
            loading="lazy"
            decoding="async"
            className="aspect-[4/5] w-full object-cover md:aspect-[4/5]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-linear-to-t from-primary/50 via-transparent to-transparent mix-blend-multiply"
          />
        </Reveal>
        <Reveal delay={120}>
          <span className="rounded-full border border-primary/20 bg-brand-blush-soft px-3 py-1 text-sm font-medium text-brand-ember-strong">
            {t('landing.privacy.eyebrow')}
          </span>
          <h2 id="privacy-title" className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
            {t('landing.privacy.title')}
          </h2>
          <ul className="mt-6 flex flex-col gap-3">
            {points.map(([key, Icon]) => (
              <li key={key} className="glass flex items-start gap-3 rounded-2xl p-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-blush-soft text-brand-ember-strong">
                  <Icon aria-hidden="true" className="size-4" />
                </span>
                <span className="pt-1.5">{t(`landing.privacy.${key}`)}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </Section>
  );
}

function About() {
  const { t } = useTranslation();
  const facts = (['forWho', 'where', 'cost'] as const).map((k) => ({
    label: t(`landing.about.${k}Label`),
    value: t(`landing.about.${k}`),
  }));
  return (
    <Section id="about">
      <div className="relative isolate overflow-hidden rounded-lg">
        <img
          src="/images/landing/rwanda-sunrise.webp"
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 -z-10 h-full w-full object-cover"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-linear-to-r from-foreground/85 via-foreground/70 to-foreground/30"
        />
        <Reveal className="flex flex-col gap-6 p-8 text-background md:p-14">
          <span className="self-start rounded-full bg-background/15 px-3 py-1 text-sm font-medium backdrop-blur">
            {t('landing.about.eyebrow')}
          </span>
          <h2 id="about-title" className="max-w-2xl text-3xl font-semibold tracking-tight md:text-4xl">
            {t('landing.about.title')}
          </h2>
          <p className="max-w-2xl text-lg text-background/85">{t('landing.about.body')}</p>
          <dl className="grid gap-3 sm:grid-cols-3">
            {facts.map((f) => (
              <div key={f.label} className="rounded-2xl bg-background/10 p-4 backdrop-blur">
                <dt className="text-sm text-background/75">{f.label}</dt>
                <dd className="mt-1 font-semibold">{f.value}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </Section>
  );
}

function Faq() {
  const { t } = useTranslation();
  return (
    <Section id="faq" className="bg-card/40">
      <SectionHeading id="faq-title" eyebrow={t('landing.faq.eyebrow')} title={t('landing.faq.title')} />
      <Reveal className="mx-auto max-w-3xl">
        <Accordion type="single" collapsible className="glass rounded-3xl px-6">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <AccordionItem key={n} value={`q${n}`}>
              <AccordionTrigger className="min-h-11 text-base">{t(`landing.faq.q${n}`)}</AccordionTrigger>
              <AccordionContent className="text-base text-muted-foreground">
                {t(`landing.faq.a${n}`)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Reveal>
    </Section>
  );
}

function Contact() {
  const { t } = useTranslation();
  const cards: Array<{ icon: LucideIcon; label: string; value: string; href?: string }> = [
    { icon: Mail, label: t('landing.contact.email'), value: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}` },
    {
      icon: Phone,
      label: t('landing.contact.phone'),
      value: CONTACT_PHONE_SHOWN,
      href: `tel:${CONTACT_PHONE}`,
    },
    { icon: MapPin, label: t('landing.contact.location'), value: t('landing.contact.locationValue') },
  ];
  return (
    <Section id="contact">
      <SectionHeading
        id="contact-title"
        eyebrow={t('landing.contact.eyebrow')}
        title={t('landing.contact.title')}
        subtitle={t('landing.contact.body')}
      />
      <div className="grid gap-4 md:grid-cols-3">
        {cards.map(({ icon: Icon, label, value, href }, i) => (
          <Reveal key={label} delay={i * 80}>
            <Card className="glass h-full">
              <CardContent className="flex flex-col items-center gap-3 text-center">
                <span className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/25">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <p className="text-sm text-muted-foreground">{label}</p>
                {href ? (
                  <a
                    href={href}
                    className="min-h-11 content-center text-lg font-semibold break-all text-brand-ember-strong underline-offset-4 hover:underline"
                  >
                    {value}
                  </a>
                ) : (
                  <p className="text-lg font-semibold">{value}</p>
                )}
              </CardContent>
            </Card>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

function ClosingCta() {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="cta-title" className="px-4 pb-16">
      <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-lg bg-primary px-6 py-14 text-center text-primary-foreground md:py-20">
        <DotPattern className="fill-primary-foreground/20" />
        <h2
          id="cta-title"
          className="relative text-3xl font-semibold tracking-tight text-balance md:text-5xl"
        >
          {t('landing.cta.title')}
        </h2>
        <p className="relative mx-auto mt-4 max-w-xl text-lg opacity-90">{t('landing.cta.body')}</p>
        <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild variant="secondary" className="h-12 rounded-full px-6 text-base">
            <Link to="/signup">
              {t('landing.hero.primary')}
              <ArrowRight aria-hidden="true" data-icon="inline-end" />
            </Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            className="h-12 rounded-full px-6 text-base text-primary-foreground hover:bg-primary-foreground/10"
          >
            <Link to="/login">{t('landing.login')}</Link>
          </Button>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="border-t bg-card/50 px-4 pt-10 pb-24">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="flex max-w-sm flex-col gap-3">
          <RindaLogo className="self-start rounded-full" />
          <p className="text-sm text-muted-foreground">{t('landing.educational')}</p>
        </div>
        <nav aria-label={t('landing.nav.menu')} className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {(['features', 'how', 'about', 'faq', 'contact'] as const).map((s) => (
            <a
              key={s}
              href={`#${s}`}
              className="min-h-11 content-center text-muted-foreground hover:text-foreground"
            >
              {t(`landing.nav.${s}`)}
            </a>
          ))}
        </nav>
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          <p className="flex items-center gap-2">
            <Languages aria-hidden="true" className="size-4" />
            {`${t('language.en')} · ${t('language.rw')}`}
          </p>
          <Link
            to="/privacy"
            className="min-h-11 content-center underline-offset-4 hover:text-foreground hover:underline"
          >
            {t('landing.footer.privacy')}
          </Link>
          <p>{t('landing.footer.rights')}</p>
          <p>{t('landing.footer.photos')}</p>
        </div>
      </div>
    </footer>
  );
}

export function LandingPage() {
  return (
    <>
      <Hero />
      <Stats />
      <AreasMarquee />
      <Features />
      <HowItWorks />
      <MadeForRwanda />
      <Privacy />
      <About />
      <Faq />
      <Contact />
      <ClosingCta />
      <Footer />
    </>
  );
}

// The privacy policy loads with the landing page, so the first download stays the same size.
export { default as PrivacyPage } from '@/features/legal/privacy-page';
