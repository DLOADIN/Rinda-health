import type { Role } from '@rinda/schemas';
import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { FieldSeparator } from '@/components/ui/field';
import { useProvidersQuery } from '@/lib/api';

export function GoogleButton({ intent, role }: { intent: 'login' | 'signup'; role?: Role }) {
  const { t, i18n } = useTranslation();
  const { data } = useProvidersQuery();
  if (!data?.google) return null;
  const params = new URLSearchParams({
    intent,
    lang: i18n.language === 'rw' ? 'rw' : 'en',
    ...(role ? { role } : {}),
  });
  return (
    <>
      <FieldSeparator>{t('auth.or')}</FieldSeparator>
      <Button asChild variant="outline" className="w-full">
        <a href={`/api/v1/auth/google/start?${params.toString()}`}>
          <Globe aria-hidden="true" data-icon="inline-start" />
          {t('auth.google')}
        </a>
      </Button>
    </>
  );
}
