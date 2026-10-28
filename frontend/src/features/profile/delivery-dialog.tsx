import '@/features/profile/phone-strings';
import type { Me } from '@rinda/schemas';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import {
  useEmailReportsQuery,
  useSetEmailReportsMutation,
  useSetSmsNoticesMutation,
  useSmsNoticesQuery,
  useUpdateMeMutation,
  type EmailReportStatus,
  type SmsStatus,
} from '@/lib/api';

export function DeliveryDialog({
  me,
  open,
  onOpenChange,
}: {
  me: Me;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { data: email } = useEmailReportsQuery();
  const { data: sms } = useSmsNoticesQuery();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('delivery.title')}</DialogTitle>
          <DialogDescription>{t('delivery.body')}</DialogDescription>
        </DialogHeader>
        {email && sms ? (
          <DeliveryForm me={me} email={email} sms={sms} onDone={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DeliveryForm({
  me,
  email,
  sms,
  onDone,
}: {
  me: Me;
  email: EmailReportStatus;
  sms: SmsStatus;
  onDone: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [saveEmail] = useSetEmailReportsMutation();
  const [saveSms] = useSetSmsNoticesMutation();
  const [updateMe] = useUpdateMeMutation();
  const emailUsable = email.hasEmail;
  const smsUsable = sms.hasPhone;
  const [wantEmail, setWantEmail] = useState(email.email);
  const [wantSms, setWantSms] = useState(sms.sms);
  const [language, setLanguage] = useState(me.preferredLanguage);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const languageChanged = language !== me.preferredLanguage;
    const results = await Promise.all([
      emailUsable ? saveEmail({ email: wantEmail }) : null,
      smsUsable ? saveSms({ sms: wantSms }) : null,
      languageChanged ? updateMe({ preferredLanguage: language }) : null,
    ]);
    setSaving(false);
    if (results.some((r) => r && 'error' in r)) {
      toast.error(t('delivery.failed'));
      return;
    }
    if (languageChanged) void i18n.changeLanguage(language);
    toast.success(t('delivery.saved'));
    onDone();
  };

  return (
    <>
      <FieldGroup>
        <FieldSet>
          <FieldLegend variant="label">{t('delivery.how')}</FieldLegend>
          <Field orientation="horizontal" className="min-h-11 justify-between">
            <FieldContent>
              <FieldLabel htmlFor="delivery-email">{t('delivery.email')}</FieldLabel>
              {!emailUsable ? (
                <FieldDescription>
                  {email.available ? t('emailReports.needEmail') : t('emailReports.unavailable')}
                </FieldDescription>
              ) : null}
            </FieldContent>
            <Switch
              id="delivery-email"
              checked={emailUsable && wantEmail}
              disabled={!emailUsable || saving}
              onCheckedChange={setWantEmail}
            />
          </Field>
          <Field orientation="horizontal" className="min-h-11 justify-between">
            <FieldContent>
              <FieldLabel htmlFor="delivery-sms">{t('delivery.sms')}</FieldLabel>
              {!smsUsable ? (
                <FieldDescription>
                  {sms.available ? t('sms.needPhone') : t('sms.unavailable')}
                </FieldDescription>
              ) : null}
            </FieldContent>
            <Switch
              id="delivery-sms"
              checked={smsUsable && wantSms}
              disabled={!smsUsable || saving}
              onCheckedChange={setWantSms}
            />
          </Field>
        </FieldSet>
        <FieldSet>
          <FieldLegend variant="label">{t('delivery.language')}</FieldLegend>
          <RadioGroup value={language} onValueChange={(v) => setLanguage(v === 'rw' ? 'rw' : 'en')}>
            {(['en', 'rw'] as const).map((v) => (
              <FieldLabel key={v} htmlFor={`delivery-lang-${v}`}>
                <Field orientation="horizontal" className="min-h-11">
                  <FieldContent>
                    <FieldTitle>{t(`language.${v}`)}</FieldTitle>
                  </FieldContent>
                  <RadioGroupItem value={v} id={`delivery-lang-${v}`} disabled={saving} />
                </Field>
              </FieldLabel>
            ))}
          </RadioGroup>
        </FieldSet>
      </FieldGroup>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">{t('delivery.later')}</Button>
        </DialogClose>
        <Button onClick={() => void save()} disabled={saving}>
          {t('delivery.save')}
        </Button>
      </DialogFooter>
    </>
  );
}

export function useDeliveryPrompt(isParticipant: boolean) {
  const { data: email } = useEmailReportsQuery(undefined, { skip: !isParticipant });
  const { data: sms } = useSmsNoticesQuery(undefined, { skip: !isParticipant });
  const [manual, setManual] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const undecided = Boolean(
    email && sms && ((email.hasEmail && !email.decided) || (sms.hasPhone && !sms.decided)),
  );
  const open = manual || (!dismissed && undecided);
  const setOpen = (next: boolean) => {
    setManual(next);
    if (!next) setDismissed(true);
  };
  return { open, setOpen };
}
