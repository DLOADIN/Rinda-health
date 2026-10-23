import { HeartHandshake } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ReferralList } from '@/components/referral-list';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useContent } from '@/lib/content';

export function SafetyScreen({ onStop, onContinue }: { onStop: () => void; onContinue: () => void }) {
  const { t } = useTranslation();
  const { text } = useContent();
  return (
    <Card className="border-band-wellness bg-brand-blush-soft" role="region" aria-labelledby="safety-title">
      <CardHeader>
        <CardTitle id="safety-title" className="flex items-center gap-2 text-2xl">
          <HeartHandshake aria-hidden="true" className="size-6" />
          {text('safety.screen.title')}
        </CardTitle>
        <CardDescription className="text-base text-foreground">{text('safety.screen.body')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ReferralList />
      </CardContent>
      <CardFooter className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" onClick={onStop}>
          {t('safetyScreen.stop')}
        </Button>
        <Button type="button" variant="outline" onClick={onContinue}>
          {t('safetyScreen.continue')}
        </Button>
      </CardFooter>
    </Card>
  );
}
