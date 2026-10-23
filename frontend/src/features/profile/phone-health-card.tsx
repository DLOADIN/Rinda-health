import '@/features/profile/phone-strings';
import type { PhoneHealthStatus } from '@rinda/schemas';
import { HeartPulse, RefreshCw, Settings } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { formatDate } from '@/lib/format';
import { isNativeApp, openPhoneHealthSettings, readPhoneHealth } from '@/lib/phone-health';

type Reading = PhoneHealthStatus['readings'][number];

export function formatReading(r: Reading, locale: string): string {
  const n = (v: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(v);
  if (r.type === 'bloodPressure') return `${n(r.value)}/${r.value2 === null ? '–' : n(r.value2)} ${r.unit}`;
  if (r.type === 'heartRate' && r.min !== null && r.max !== null)
    return `${n(r.value)} ${r.unit} (${n(r.min)}–${n(r.max)})`;
  return `${n(r.value)} ${r.unit}`;
}

export function PhoneHealthCard() {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<PhoneHealthStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const native = isNativeApp();

  const load = useCallback(async () => {
    const res = await fetch('/api/v1/participant/phone-health', { credentials: 'same-origin' }).catch(
      () => null,
    );
    if (res?.ok) setStatus((await res.json()) as PhoneHealthStatus);
  }, []);

  useEffect(() => {
    let active = true;
    void fetch('/api/v1/participant/phone-health', { credentials: 'same-origin' })
      .then((res) => (res.ok ? (res.json() as Promise<PhoneHealthStatus>) : null))
      .then((s) => {
        if (active && s) setStatus(s);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const setShare = async (share: boolean) => {
    setBusy(true);
    await fetch('/api/v1/participant/phone-health/consent', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ share }),
    }).catch(() => null);
    await load();
    setBusy(false);
  };

  const readNow = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const upload = await readPhoneHealth();
      const res = await fetch('/api/v1/participant/phone-health/readings', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(upload),
      });
      if (!res.ok) throw new Error(String(res.status));
      toast.success(t('phone.saved', { count: upload.readings.length }));
      await load();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const latest = new Map<string, Reading>();
  for (const r of status?.readings ?? []) if (!latest.has(r.type)) latest.set(r.type, r);
  const ios = status?.readings.some((r) => r.platform === 'ios');

  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <HeartPulse aria-hidden="true" className="size-5 text-brand-ember-strong" />
          {t('phone.title')}
        </CardTitle>
        <CardDescription>{t('phone.intro')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {status && !status.available ? (
          <p className="text-sm text-muted-foreground">{t('phone.off')}</p>
        ) : null}
        <Field orientation="horizontal" className="min-h-11 justify-between">
          <FieldLabel htmlFor="phone-health-toggle">{t('phone.share')}</FieldLabel>
          <Switch
            id="phone-health-toggle"
            checked={status?.share ?? false}
            disabled={!status?.available || busy}
            onCheckedChange={(share) => void setShare(share)}
          />
        </Field>
        {!native ? <p className="text-sm text-muted-foreground">{t('phone.onlyApp')}</p> : null}
        {native && status?.share ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void readNow()} disabled={busy}>
              {busy ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <RefreshCw aria-hidden="true" data-icon="inline-start" />
              )}
              {busy ? t('phone.reading') : t('phone.read')}
            </Button>
            <Button variant="outline" onClick={() => void openPhoneHealthSettings()}>
              <Settings aria-hidden="true" data-icon="inline-start" />
              {t('phone.settings')}
            </Button>
          </div>
        ) : null}
        {failed ? (
          <Alert role="alert">
            <AlertDescription>{t('phone.failed')}</AlertDescription>
          </Alert>
        ) : null}
        {status?.share ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">
              {t('phone.latest')}
              {status.lastSync ? (
                <span className="ml-2 font-normal text-muted-foreground">
                  {t('phone.lastSync', { date: formatDate(status.lastSync, true) })}
                </span>
              ) : null}
            </p>
            {latest.size ? (
              <ItemGroup className="grid gap-2 sm:grid-cols-2">
                {[...latest.values()].map((r) => (
                  <Item key={r.type} variant="outline" size="sm">
                    <ItemContent>
                      <ItemTitle>{t(`phone.types.${r.type}`)}</ItemTitle>
                      <ItemDescription className="tabular-nums">
                        {formatReading(r, i18n.language)} · {formatDate(r.day)}
                      </ItemDescription>
                    </ItemContent>
                  </Item>
                ))}
              </ItemGroup>
            ) : (
              <p className="text-sm text-muted-foreground">{t('phone.none')}</p>
            )}
            {ios ? <p className="text-xs text-muted-foreground">{t('phone.iosNote')}</p> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
