import { DoorOpen, HeartPulse, Menu } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet } from 'react-router';
import { useEscapeTwiceToExit, useQuickExit } from '@/components/app-shell';
import { GetHelp } from '@/components/get-help';
import { ThemeToggle } from '@/components/theme-toggle';
import { LanguageSwitch } from '@/components/language-switch';
import { OfflineBadge } from '@/components/offline-badge';
import { Button } from '@/components/ui/button';

const SECTIONS = ['features', 'how', 'about', 'faq', 'contact'] as const;
const MobileMenu = lazy(() => import('@/features/landing/mobile-menu'));

export function RindaLogo({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <Link to="/" aria-label={t('landing.nav.home')} className={className}>
      <span className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <span className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/30">
          <HeartPulse aria-hidden="true" className="size-5" />
        </span>
        {t('app.name')}
      </span>
    </Link>
  );
}

function LandingNav({ onExit }: { onExit: () => void }) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuLoaded, setMenuLoaded] = useState(false);
  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-6">
      <nav
        aria-label={t('nav.menu')}
        className="glass mx-auto flex max-w-6xl items-center gap-2 rounded-full py-1.5 pr-1.5 pl-3 sm:pl-4"
      >
        <RindaLogo className="shrink-0 rounded-full" />
        <ul className="ml-4 hidden items-center gap-1 lg:flex">
          {SECTIONS.map((s) => (
            <li key={s}>
              <Button
                asChild
                variant="ghost"
                className="rounded-full text-muted-foreground hover:text-foreground"
              >
                <a href={`/#${s}`}>{t(`landing.nav.${s}`)}</a>
              </Button>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-1.5">
          <LanguageSwitch />
          <Button asChild variant="ghost" className="hidden rounded-full md:inline-flex">
            <Link to="/login">{t('landing.login')}</Link>
          </Button>
          <Button asChild className="hidden rounded-full shadow-md shadow-primary/25 sm:inline-flex">
            <Link to="/signup">{t('landing.nav.getStarted')}</Link>
          </Button>
          <Button
            variant="outline"
            className="rounded-full px-3"
            onClick={onExit}
            aria-label={t('shell.exitLabel')}
          >
            <DoorOpen aria-hidden="true" />
            <span className="hidden sm:inline">{t('shell.exit')}</span>
          </Button>
          <Button
            variant="ghost"
            size="icon-touch"
            className="rounded-full lg:hidden"
            aria-label={t('landing.nav.menu')}
            aria-expanded={menuOpen}
            onClick={() => {
              setMenuLoaded(true);
              setMenuOpen(true);
            }}
          >
            <Menu aria-hidden="true" />
          </Button>
          {menuLoaded ? (
            <Suspense fallback={null}>
              <MobileMenu open={menuOpen} onOpenChange={setMenuOpen} sections={SECTIONS} />
            </Suspense>
          ) : null}
        </div>
      </nav>
    </header>
  );
}

export function PublicShell() {
  const { t } = useTranslation();
  const quickExit = useQuickExit();
  useEscapeTwiceToExit(quickExit);
  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-clip bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-md focus:bg-card focus:p-2"
      >
        {t('app.skipToContent')}
      </a>
      <LandingNav onExit={quickExit} />
      <main id="main" className="flex w-full flex-1 flex-col">
        <div className="mx-auto w-full max-w-6xl px-4 empty:hidden">
          <OfflineBadge />
        </div>
        <Outlet />
      </main>
      <div className="fixed right-4 bottom-4 z-40 flex items-center gap-2 pb-[env(safe-area-inset-bottom)]">
        <ThemeToggle className="size-12" />
        <GetHelp variant="floating" className="h-12" />
      </div>
    </div>
  );
}
