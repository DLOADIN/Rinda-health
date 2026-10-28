import '@/features/profile/phone-strings';
import { MessageSquareText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ApiError } from '@/components/api-error';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { useSetSmsNoticesMutation, useSmsNoticesQuery } from '@/lib/api';

export function SmsCard() {
  const { t } = useTranslation();
  const { data } = useSmsNoticesQuery();
  const [save, { isLoading, error }] = useSetSmsNoticesMutation();
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
            checked={data?.sms ?? false}
            disabled={!data?.hasPhone || isLoading}
            onCheckedChange={(sms) =>
              void save({ sms }).then((r) => (!('error' in r) ? toast.success(t('sms.saved')) : undefined))
            }
          />
        </Field>
        {data && !data.available ? (
          <p className="text-sm text-muted-foreground">{t('sms.unavailable')}</p>
        ) : null}
        {data?.available && !data.hasPhone ? (
          <p className="text-sm text-muted-foreground">{t('sms.needPhone')}</p>
        ) : null}
        <ApiError error={error} />
      </CardContent>
    </Card>
  );
}
