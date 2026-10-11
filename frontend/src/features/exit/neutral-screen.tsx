import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { useContent } from '@/lib/content';

export function NeutralScreen() {
  const { t } = useTranslation();
  const { text } = useContent();
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{text('neutral.title')}</h1>
      <Button asChild variant="outline" className="w-full">
        <Link to="/" replace>
          {t('neutral.back')}
        </Link>
      </Button>
    </section>
  );
}
