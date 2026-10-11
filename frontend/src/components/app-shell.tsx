import { DoorOpen } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { Link, Outlet, useNavigate } from 'react-router';
import { clearSession } from '@/app/store';
import { GetHelp } from '@/components/get-help';
import { LanguageSwitch } from '@/components/language-switch';
import { OfflineBadge } from '@/components/offline-badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { clearPersonalCache } from '@/lib/storage/vault';

// Exit leaves the screen first, then signs out and clears the phone, so nothing personal stays visible.
export function useQuickExit() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  return () => {
    void fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => undefined);
    void navigate('/exit', { replace: true });
    dispatch(api.util.resetApiState());
    dispatch(clearSession);
    void clearPersonalCache();
  };
}

export function useEscapeTwiceToExit(quickExit: () => void) {
  const lastEscape = useRef(0);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) {
        lastEscape.current = 0;
        return;
      }
      const now = event.timeStamp;
      if (now - lastEscape.current < 1000) quickExit();
      lastEscape.current = now;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [quickExit]);
}

export function AppShell() {
  const { t } = useTranslation();
  const quickExit = useQuickExit();
  useEscapeTwiceToExit(quickExit);

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:m-2 focus:rounded-md focus:bg-card focus:p-2"
      >
        {t('app.skipToContent')}
      </a>
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-screen-sm items-center gap-2 px-4 py-2">
          <Link to="/" className="rounded-md text-2xl font-semibold text-brand-ember">
            {t('app.name')}
          </Link>
          <LanguageSwitch className="ml-auto" />
          <Button variant="outline" onClick={quickExit} aria-label={t('shell.exitLabel')}>
            <DoorOpen aria-hidden="true" data-icon="inline-start" />
            {t('shell.exit')}
          </Button>
        </div>
      </header>

      <main
        id="main"
        className="mx-auto flex w-full max-w-screen-sm flex-1 flex-col gap-4 px-4 py-6 break-words"
      >
        <OfflineBadge />
        <Outlet />
      </main>

      <footer className="sticky bottom-0 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto max-w-screen-sm px-4 py-3">
          <GetHelp />
        </div>
      </footer>
    </div>
  );
}
