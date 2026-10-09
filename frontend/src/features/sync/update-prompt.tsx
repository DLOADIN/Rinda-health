// Safe updates (FR-30, docs/OFFLINE.md): a new version is offered only outside the assessment, consent and
// safety flows, and never reloads on its own.
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

const IN_ASSESSMENT = /^\/(consent|assessment|measure|safety|app\/checkup)(\/|$)/;

export function UpdatePrompt() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true });
  if (!needRefresh || IN_ASSESSMENT.test(pathname)) return null;
  return (
    <Alert>
      <AlertDescription className="flex flex-col gap-3">
        {t('update.available')}
        <Button onClick={() => void updateServiceWorker(true)}>{t('update.now')}</Button>
      </AlertDescription>
    </Alert>
  );
}
