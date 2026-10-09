// Shows an API error as a plain interface string, never the raw server message.
import { CircleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { errorCode } from '@/lib/api';

export function ApiError({ error }: { error: unknown }) {
  const { t } = useTranslation();
  if (!error) return null;
  const code = errorCode(error);
  return (
    <Alert role="alert">
      <CircleAlert aria-hidden="true" />
      <AlertDescription>{t(`apiErrors.${code}`, { defaultValue: t('apiErrors.INTERNAL') })}</AlertDescription>
    </Alert>
  );
}
