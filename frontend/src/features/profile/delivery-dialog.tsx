import '@/features/profile/phone-strings';
import type { Me } from '@rinda/schemas';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ApiError } from '@/components/api-error';
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
import { Input } from '@/components/ui/input';
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
  const [updateMe, { error: contactError }] = useUpdateMeMutation();
  const [wantEmail, setWantEmail] = useState(email.hasEmail && email.email);
  const [wantSms, setWantSms] = useState(sms.hasPhone && sms.sms);
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [language, setLanguage] = useState(me.preferredLanguage);
  const [missing, setMissing] = useState<'email' | 'phone' | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const addEmail = !email.hasEmail && wantEmail ? newEmail.trim() : '';
    const addPhone = !sms.hasPhone && wantSms ? newPhone.trim() : '';
    if (!email.hasEmail && wantEmail && !addEmail) return setMissing('email');
    if (!sms.hasPhone && wantSms && !addPhone) return setMissing('phone');
    setMissing(null);
    setSaving(true);
    const languageChanged = language !== me.preferredLanguage;
    if (languageChanged || addEmail || addPhone) {
      const updated = await updateMe({
        ...(languageChanged ? { preferredLanguage: language } : {}),
        ...(addEmail ? { email: addEmail } : {}),
        ...(addPhone ? { phone: addPhone } : {}),
      });
      if ('error' in updated) {
        setSaving(false);
        return;
      }
    }
    const results = await Promise.all([
      email.hasEmail || addEmail ? saveEmail({ email: wantEmail }) : null,
      sms.hasPhone || addPhone ? saveSms({ sms: wantSms }) : null,
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
              {!email.available ? <FieldDescription>{t('emailReports.unavailable')}</FieldDescription> : null}
            </FieldContent>
            <Switch
              id="delivery-email"
              checked={wantEmail}
              disabled={saving}
              onCheckedChange={setWantEmail}
            />
          </Field>
          {!email.hasEmail && wantEmail ? (
            <Field data-invalid={missing === 'email' || undefined}>
              <FieldLabel htmlFor="delivery-new-email">{t('delivery.emailAddress')}</FieldLabel>
              <Input
                id="delivery-new-email"
                type="email"
                autoComplete="email"
                value={newEmail}
                aria-invalid={missing === 'email' || undefined}
                onChange={(e) => setNewEmail(e.target.value)}
              />
              {missing === 'email' ? <FieldDescription>{t('delivery.needEmail')}</FieldDescription> : null}
            </Field>
          ) : null}
          <Field orientation="horizontal" className="min-h-11 justify-between">
            <FieldContent>
              <FieldLabel htmlFor="delivery-sms">{t('delivery.sms')}</FieldLabel>
              {!sms.available ? <FieldDescription>{t('sms.unavailable')}</FieldDescription> : null}
            </FieldContent>
            <Switch id="delivery-sms" checked={wantSms} disabled={saving} onCheckedChange={setWantSms} />
          </Field>
          {!sms.hasPhone && wantSms ? (
            <Field data-invalid={missing === 'phone' || undefined}>
              <FieldLabel htmlFor="delivery-new-phone">{t('delivery.phone')}</FieldLabel>
              <Input
                id="delivery-new-phone"
                type="tel"
                autoComplete="tel"
                placeholder="0788 123 456"
                value={newPhone}
                aria-invalid={missing === 'phone' || undefined}
                onChange={(e) => setNewPhone(e.target.value)}
              />
              {missing === 'phone' ? <FieldDescription>{t('delivery.needPhone')}</FieldDescription> : null}
            </Field>
          ) : null}
          <ApiError error={contactError} />
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
