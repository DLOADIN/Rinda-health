// Landing page: purpose statement (FR-01) before anything else, then sign in or create an account.
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useContent } from '@/lib/content';

export function WelcomeScreen() {
  const { t } = useTranslation();
  const { text } = useContent();
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-brand-ember">{text('purpose.title')}</h1>
        <p className="text-lg text-muted-foreground">{t('app.tagline')}</p>
      </div>
      <Alert>
        <AlertTitle>{t('landing.educational')}</AlertTitle>
        <AlertDescription>{text('purpose.body')}</AlertDescription>
      </Alert>
      <div className="flex flex-col gap-3">
        <Button asChild className="w-full">
          <Link to="/signup">{t('landing.signup')}</Link>
        </Button>
        <Button asChild variant="outline" className="w-full">
          <Link to="/login">{t('landing.login')}</Link>
        </Button>
      </div>
    </section>
  );
}
