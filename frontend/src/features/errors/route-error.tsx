// Error screen that still offers Get help now (FR-12, SAFETY.md rule 1). Used inside AppShell for screen errors,
// and on its own if the shell itself fails, so an error can never hide the referral list.
import { useTranslation } from 'react-i18next';
import { GetHelp } from '@/components/get-help';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export function RouteError({ standalone = false }: { standalone?: boolean }) {
  const { t } = useTranslation();
  const body = (
    <section className="flex flex-col gap-4">
      <Alert>
        <AlertDescription>{t('errors.generic')}</AlertDescription>
      </Alert>
      <Button asChild variant="outline" className="w-full">
        <a href="/">{t('neutral.back')}</a>
      </Button>
    </section>
  );
  if (!standalone) return body;
  return (
    <div className="mx-auto flex min-h-dvh max-w-screen-sm flex-col gap-4 bg-background px-4 py-6 text-foreground">
      {body}
      <div className="mt-auto pb-[env(safe-area-inset-bottom)]">
        <GetHelp />
      </div>
    </div>
  );
}
