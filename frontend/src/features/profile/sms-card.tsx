import '@/features/profile/phone-strings';
import { MessageSquareText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';

interface SmsStatus {
  sms: boolean;
  available: boolean;
  hasPhone: boolean;
}

export function SmsCard() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<SmsStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch('/api/v1/participant/sms-notices', { credentials: 'same-origin' })
      .then((res) => (res.ok ? (res.json() as Promise<SmsStatus>) : null))
      .then((s) => {
        if (active && s) setStatus(s);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const save = async (sms: boolean) => {
    setBusy(true);
    const res = await fetch('/api/v1/participant/sms-notices', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sms }),
    }).catch(() => null);
    if (res?.ok) {
      setStatus((s) => (s ? { ...s, sms } : s));
      toast.success(t('sms.saved'));
    }
    setBusy(false);
  };

  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <MessageSquareText aria-hidden="true" className="size-5 text-brand-ember-strong" />
          {t('sms.title')}
        </CardTitle>
        <CardDescription>{t('sms.body')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Field orientation="horizontal" className="min-h-11 justify-between">
          <FieldLabel htmlFor="sms-toggle">{t('sms.toggle')}</FieldLabel>
          <Switch
            id="sms-toggle"
            checked={status?.sms ?? false}
            disabled={!status?.available || !status.hasPhone || busy}
            onCheckedChange={(sms) => void save(sms)}
          />
        </Field>
        {status && !status.available ? (
          <p className="text-sm text-muted-foreground">{t('sms.unavailable')}</p>
        ) : null}
        {status?.available && !status.hasPhone ? (
          <p className="text-sm text-muted-foreground">{t('sms.needPhone')}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
