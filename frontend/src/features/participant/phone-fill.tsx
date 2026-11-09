import '@/features/profile/phone-strings';
import type { PhoneHealthStatus } from '@rinda/schemas';
import { Smartphone } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { formatDate } from '@/lib/format';
import {
  openPhoneHealthSettings,
  phoneAnswers,
  readCheckupFromPhone,
  readPhoneHealth,
  type PhoneCheckup,
  type PhoneFill,
} from '@/lib/phone-health';

const json = { 'content-type': 'application/json' };

async function phoneStatus(): Promise<PhoneHealthStatus | null> {
  const res = await fetch('/api/v1/participant/phone-health', { credentials: 'same-origin' }).catch(
    () => null,
  );
  return res?.ok ? ((await res.json()) as PhoneHealthStatus) : null;
}

// The daily summaries are saved after the fill, so a slow upload never holds up the check-up.
async function saveDailySummaries(): Promise<void> {
  const upload = await readPhoneHealth();
  await fetch('/api/v1/participant/phone-health/readings', {
    method: 'POST',
    credentials: 'same-origin',
    headers: json,
    body: JSON.stringify(upload),
  });
}

// This is where the Android or iPhone app fills the check-up from the phone's own health data.
export function PhoneFillCard({ onFill }: { onFill: (answers: PhoneFill['answers']) => void }) {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [found, setFound] = useState<PhoneCheckup | null>(null);

  const date = (day: string) => formatDate(`${day}T12:00:00`);
  const number = (v: number) => new Intl.NumberFormat(i18n.language).format(v);

  const fill = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const data = await readCheckupFromPhone();
      const { answers, filled } = phoneAnswers(data, new Date().toLocaleDateString('en-CA'));
      setFound(data);
      if (filled === 0) toast(t('phone.noRecent'));
      else {
        onFill(answers);
        toast.success(t('phone.filled'));
      }
      void saveDailySummaries().catch(() => undefined);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    setBusy(true);
    const status = await phoneStatus();
    setBusy(false);
    if (!status?.available) {
      toast(t('phone.off'));
      return;
    }
    if (!status.share) {
      setConsentOpen(true);
      return;
    }
    await fill();
  };

  const agree = async () => {
    setConsentOpen(false);
    setBusy(true);
    const res = await fetch('/api/v1/participant/phone-health/consent', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: json,
      body: JSON.stringify({ share: true }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setFailed(true);
      return;
    }
    await fill();
  };

  const items: string[] = [];
  if (found?.bloodPressure)
    items.push(
      t('phone.item.bp', {
        systolic: Math.round(found.bloodPressure.systolic),
        diastolic: found.bloodPressure.diastolic === null ? '–' : Math.round(found.bloodPressure.diastolic),
        date: date(found.bloodPressure.day),
      }),
    );
  if (found?.weight)
    items.push(t('phone.item.weight', { value: number(found.weight.value), date: date(found.weight.day) }));
  if (found?.height)
    items.push(t('phone.item.height', { value: number(found.height.value), date: date(found.height.day) }));
  if (found?.activity && found.activity.sessions > 0)
    items.push(
      t('phone.item.activity', {
        moderate: found.activity.moderate,
        vigorous: found.activity.vigorous,
        count: found.activity.sessions,
      }),
    );
  else if (found) items.push(t('phone.item.noActivity'));
  if (found?.steps) items.push(t('phone.item.steps', { steps: number(found.steps) }));
  if (found?.restingHeartRate)
    items.push(
      t('phone.item.heart', {
        value: Math.round(found.restingHeartRate.value),
        date: date(found.restingHeartRate.day),
      }),
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Smartphone aria-hidden="true" className="size-5" />
          {t('phone.fillTitle')}
        </CardTitle>
        <CardDescription>{t('phone.fillBody')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button type="button" className="self-start" disabled={busy} onClick={() => void start()}>
          {busy ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <Smartphone aria-hidden="true" data-icon="inline-start" />
          )}
          {busy ? t('phone.reading') : t('phone.fill')}
        </Button>
        {failed ? (
          <Alert role="alert">
            <AlertDescription className="flex flex-col gap-2">
              {t('phone.denied')}
              <Button
                type="button"
                variant="outline"
                className="self-start"
                onClick={() => void openPhoneHealthSettings()}
              >
                {t('phone.settings')}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
        {found ? (
          <div className="flex flex-col gap-2" aria-live="polite">
            <p className="text-sm font-medium">{t('phone.fromPhone')}</p>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">{t('phone.notOnPhone')}</p>
          </div>
        ) : null}
      </CardContent>
      <AlertDialog open={consentOpen} onOpenChange={setConsentOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('phone.consentTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('phone.consentBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('phone.consentNo')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void agree()}>{t('phone.consentYes')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
