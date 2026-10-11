import { Phone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useContent } from '@/lib/content';
import { formatDate } from '@/lib/format';

export function ReferralList() {
  const { t } = useTranslation();
  const { referrals } = useContent();
  return (
    <ul className="flex flex-col gap-3">
      {referrals.map((r) => (
        <li key={r.id} className="flex flex-col gap-1">
          <Button asChild className="w-full justify-start">
            <a href={`tel:${r.phone}`}>
              <Phone aria-hidden="true" data-icon="inline-start" />
              <span className="break-words">
                {r.name} · {r.phone}
              </span>
              <span className="sr-only">{t('shell.call', { phone: r.phone })}</span>
            </a>
          </Button>
          <p className="text-sm text-muted-foreground">
            {r.hours} ·{' '}
            {r.verifiedOn ? t('shell.verifiedOn', { date: formatDate(r.verifiedOn) }) : t('shell.unverified')}
          </p>
        </li>
      ))}
    </ul>
  );
}
