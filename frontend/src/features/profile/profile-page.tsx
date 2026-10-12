import type { Me, ParticipantProfile } from '@rinda/schemas';
import { Download, LogOut, Mail, Smartphone, Sparkles, MessageCircle } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ApiError } from '@/components/api-error';
import { ConfirmAction } from '@/components/confirm-action';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { useContent } from '@/lib/content';
import { useInstallPrompt } from '@/lib/install';
import {
  useChangePasswordMutation,
  useDeletionStatusQuery,
  useChangeConsentMutation,
  useConsentsQuery,
  useEmailReportsQuery,
  useWhatsappQuery,
  useSetWhatsAppMutation,
  useSetEmailReportsMutation,
  useAiOptInQuery,
  useSetAiOptInMutation,
  useParticipantProfileQuery,
  useRequestDeletionMutation,
  useSaveParticipantProfileMutation,
  useUpdateMeMutation,
} from '@/lib/api';
import { formatDate } from '@/lib/format';

function DetailsCard({ me }: { me: Me }) {
  const { t, i18n } = useTranslation();
  const [update, { isLoading, error }] = useUpdateMeMutation();
  const [displayName, setDisplayName] = useState(me.displayName ?? '');
  const [email, setEmail] = useState(me.email ?? '');
  const [phone, setPhone] = useState(me.phone ?? '');
  const [language, setLanguage] = useState(me.preferredLanguage);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const result = await update({
      displayName: displayName.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      preferredLanguage: language,
    });
    if ('data' in result) {
      void i18n.changeLanguage(language);
      toast.success(t('profile.saved'));
    }
  };

  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle className="text-xl">{t('profile.details')}</CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{t(`auth.roles.${me.role}`)}</Badge>
          {me.hasPassword ? <Badge variant="outline">{t('profile.methodPassword')}</Badge> : null}
          {me.hasGoogle ? <Badge variant="outline">{t('profile.methodGoogle')}</Badge> : null}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void submit(e)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="p-name">{t('profile.displayName')}</FieldLabel>
              <Input
                id="p-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="nickname"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="p-email">{t('profile.email')}</FieldLabel>
              <Input
                id="p-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="p-phone">{t('profile.phone')}</FieldLabel>
              <Input
                id="p-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="p-lang">{t('profile.language')}</FieldLabel>
              <NativeSelect
                id="p-lang"
                value={language}
                onChange={(e) => setLanguage(e.target.value === 'rw' ? 'rw' : 'en')}
              >
                <NativeSelectOption value="en">{t('language.en')}</NativeSelectOption>
                <NativeSelectOption value="rw">{t('language.rw')}</NativeSelectOption>
              </NativeSelect>
            </Field>
            <ApiError error={error} />
            <Button type="submit" disabled={isLoading} className="w-full sm:w-auto sm:self-start">
              {t('profile.save')}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

const AGE_BANDS = ['18-24', '25-29', '30-35'] as const;
const SEXES = ['female', 'male', 'not_stated'] as const;
const DISTRICTS = ['gasabo', 'kicukiro', 'nyarugenge', 'other'] as const;

function AboutMeForm({ initial }: { initial: ParticipantProfile }) {
  const { t } = useTranslation();
  const [save, { isLoading, error }] = useSaveParticipantProfileMutation();
  const [values, setValues] = useState<ParticipantProfile>(initial);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if ('data' in (await save(values))) toast.success(t('profile.saved'));
  };
  return (
    <form onSubmit={(e) => void submit(e)}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="p-age">{t('profile.ageBand')}</FieldLabel>
          <NativeSelect
            id="p-age"
            value={values.ageBand ?? ''}
            onChange={(e) =>
              setValues({
                ...values,
                ageBand: (AGE_BANDS as readonly string[]).includes(e.target.value)
                  ? (e.target.value as ParticipantProfile['ageBand'])
                  : null,
              })
            }
          >
            <NativeSelectOption value="">{t('profile.notSet')}</NativeSelectOption>
            {AGE_BANDS.map((a) => (
              <NativeSelectOption key={a} value={a}>
                {a}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <FieldSet>
          <FieldLegend variant="label">{t('profile.sex')}</FieldLegend>
          <RadioGroup
            value={values.sex}
            onValueChange={(v) => setValues({ ...values, sex: v as ParticipantProfile['sex'] })}
          >
            {SEXES.map((s) => (
              <Field key={s} orientation="horizontal" className="min-h-11">
                <RadioGroupItem value={s} id={`sex-${s}`} />
                <FieldLabel htmlFor={`sex-${s}`} className="font-normal">
                  {t(`profile.sexes.${s}`)}
                </FieldLabel>
              </Field>
            ))}
          </RadioGroup>
        </FieldSet>
        <Field>
          <FieldLabel htmlFor="p-district">{t('profile.district')}</FieldLabel>
          <NativeSelect
            id="p-district"
            value={values.districtBand ?? ''}
            onChange={(e) => setValues({ ...values, districtBand: e.target.value || null })}
          >
            <NativeSelectOption value="">{t('profile.notSet')}</NativeSelectOption>
            {DISTRICTS.map((d) => (
              <NativeSelectOption key={d} value={d}>
                {t(`profile.districts.${d}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <ApiError error={error} />
        <Button type="submit" disabled={isLoading} className="w-full sm:w-auto sm:self-start">
          {t('profile.save')}
        </Button>
      </FieldGroup>
    </form>
  );
}

function AboutMeCard() {
  const { t } = useTranslation();
  const { data } = useParticipantProfileQuery();
  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle className="text-xl">{t('profile.about')}</CardTitle>
        <CardDescription>{t('profile.aboutHint')}</CardDescription>
      </CardHeader>
      <CardContent>{data ? <AboutMeForm initial={data} /> : null}</CardContent>
    </Card>
  );
}

function PasswordCard({ me }: { me: Me }) {
  const { t } = useTranslation();
  const [change, { isLoading, error }] = useChangePasswordMutation();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const result = await change(
      me.hasPassword ? { currentPassword: current, newPassword: next } : { newPassword: next },
    );
    if (!('error' in result)) {
      setCurrent('');
      setNext('');
      toast.success(t('profile.passwordChanged'));
    }
  };
  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle className="text-xl">
          {me.hasPassword ? t('profile.passwordTitle') : t('profile.setPasswordTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void submit(e)}>
          <FieldGroup>
            {me.hasPassword ? (
              <Field>
                <FieldLabel htmlFor="pw-current">{t('profile.currentPassword')}</FieldLabel>
                <Input
                  id="pw-current"
                  type="password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  autoComplete="current-password"
                />
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="pw-new">{t('profile.newPassword')}</FieldLabel>
              <Input
                id="pw-new"
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
                minLength={8}
              />
            </Field>
            <ApiError error={error} />
            <Button
              type="submit"
              disabled={isLoading || next.length < 8}
              className="w-full sm:w-auto sm:self-start"
            >
              {t('profile.changePassword')}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

// WhatsApp notices: off until switched on, and the message never includes results.
function WhatsAppCard() {
  const { t } = useTranslation();
  const { data } = useWhatsappQuery();
  const [save, { isLoading, error }] = useSetWhatsAppMutation();
  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <MessageCircle aria-hidden="true" className="size-5 text-brand-ember-strong" />
          {t('whatsapp.title')}
        </CardTitle>
        <CardDescription>{t('whatsapp.body')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Field orientation="horizontal" className="min-h-11 justify-between">
          <FieldLabel htmlFor="wa-toggle">{t('whatsapp.toggle')}</FieldLabel>
          <Switch
            id="wa-toggle"
            checked={data?.whatsapp ?? false}
            disabled={!data?.available || !data.hasPhone || isLoading}
            onCheckedChange={(whatsapp) =>
              void save({ whatsapp }).then((r) =>
                !('error' in r) ? toast.success(t('whatsapp.saved')) : undefined,
              )
            }
          />
        </Field>
        {data && !data.available ? (
          <p className="text-sm text-muted-foreground">{t('whatsapp.unavailable')}</p>
        ) : null}
        {data?.available && !data.hasPhone ? (
          <p className="text-sm text-muted-foreground">{t('whatsapp.needPhone')}</p>
        ) : null}
        <ApiError error={error} />
      </CardContent>
    </Card>
  );
}

function EmailReportsCard() {
  const { t } = useTranslation();
  const { data } = useEmailReportsQuery();
  const [save, { isLoading, error }] = useSetEmailReportsMutation();
  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Mail aria-hidden="true" className="size-5 text-brand-ember-strong" />
          {t('emailReports.title')}
        </CardTitle>
        <CardDescription>{t('emailReports.body')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Field orientation="horizontal" className="min-h-11 justify-between">
          <FieldLabel htmlFor="email-reports-toggle">{t('emailReports.toggle')}</FieldLabel>
          <Switch
            id="email-reports-toggle"
            checked={data?.email ?? false}
            disabled={!data?.available || !data.hasEmail || isLoading}
            onCheckedChange={(email) =>
              void save({ email }).then((r) =>
                !('error' in r) ? toast.success(t('emailReports.saved')) : undefined,
              )
            }
          />
        </Field>
        {data && !data.available ? (
          <p className="text-sm text-muted-foreground">{t('emailReports.unavailable')}</p>
        ) : null}
        {data?.available && !data.hasEmail ? (
          <p className="text-sm text-muted-foreground">{t('emailReports.needEmail')}</p>
        ) : null}
        <ApiError error={error} />
      </CardContent>
    </Card>
  );
}

function AiCard() {
  const { t } = useTranslation();
  const { data } = useAiOptInQuery();
  const [save, { isLoading, error }] = useSetAiOptInMutation();
  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Sparkles aria-hidden="true" className="size-5 text-brand-ember-strong" />
          {t('aiOptIn.title')}
        </CardTitle>
        <CardDescription>{t('aiOptIn.body')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Field orientation="horizontal" className="min-h-11 justify-between">
          <FieldLabel htmlFor="ai-toggle">{t('aiOptIn.toggle')}</FieldLabel>
          <Switch
            id="ai-toggle"
            checked={data?.ai ?? false}
            disabled={!data?.available || isLoading}
            onCheckedChange={(ai) =>
              void save({ ai }).then((r) => (!('error' in r) ? toast.success(t('aiOptIn.saved')) : undefined))
            }
          />
        </Field>
        {data && !data.available ? (
          <p className="text-sm text-muted-foreground">{t('aiOptIn.unavailable')}</p>
        ) : null}
        <ApiError error={error} />
      </CardContent>
    </Card>
  );
}

function InstallCard() {
  const { t } = useTranslation();
  const { canInstall, installed, isIos, install } = useInstallPrompt();
  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Smartphone aria-hidden="true" className="size-5 text-brand-ember-strong" />
          {t('install.title')}
        </CardTitle>
        <CardDescription>{t('install.body')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {installed ? (
          <p className="text-sm">{t('install.installed')}</p>
        ) : canInstall ? (
          <Button className="w-full sm:w-auto sm:self-start" onClick={() => void install()}>
            <Download aria-hidden="true" data-icon="inline-start" />
            {t('install.button')}
          </Button>
        ) : isIos ? (
          <p className="text-sm">{t('install.ios')}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

const OPTIONAL_CONSENTS = ['mental_wellness', 'audio', 'follow_up'] as const;

function ConsentsCard() {
  const { t } = useTranslation();
  const { text } = useContent();
  const { data } = useConsentsQuery();
  const [change, { isLoading, error }] = useChangeConsentMutation();
  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle className="text-xl">{t('profile.consentsTitle')}</CardTitle>
        <CardDescription>{t('profile.consentsBody')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {OPTIONAL_CONSENTS.map((scope) => (
          <Field key={scope} orientation="horizontal" className="min-h-11 justify-between">
            <FieldLabel htmlFor={`consent-${scope}`}>{text(`consent.${scope}.label`)}</FieldLabel>
            <Switch
              id={`consent-${scope}`}
              checked={data?.[scope] ?? false}
              disabled={!data || isLoading}
              onCheckedChange={(granted) =>
                void change({ scope, granted }).then((r) =>
                  !('error' in r) ? toast.success(t('profile.consentSaved')) : undefined,
                )
              }
            />
          </Field>
        ))}
        <ApiError error={error} />
      </CardContent>
    </Card>
  );
}

function DeletionCard() {
  const { t } = useTranslation();
  const { data } = useDeletionStatusQuery();
  const [request, { error }] = useRequestDeletionMutation();
  const pending = data?.status === 'requested';
  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle className="text-xl">{t('profile.deleteTitle')}</CardTitle>
        <CardDescription>{t('profile.deleteBody')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {pending && data ? (
          <Alert>
            <AlertDescription>
              {t('profile.deleteRequested', { date: formatDate(data.requestedAt) })}{' '}
              {t('profile.deleteDue', { date: formatDate(data.dueAt, true) })}
            </AlertDescription>
          </Alert>
        ) : (
          <ConfirmAction
            trigger={t('profile.deleteRequest')}
            title={t('profile.deleteTitle')}
            description={t('profile.deleteConfirm')}
            onConfirm={() => void request()}
          />
        )}
        <ApiError error={error} />
      </CardContent>
    </Card>
  );
}

export function ProfilePage({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  const { t } = useTranslation();
  const isParticipant = me.role === 'participant';
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('profile.title')}
        actions={
          <Button variant="outline" onClick={onSignOut}>
            <LogOut aria-hidden="true" data-icon="inline-start" />
            {t('profile.signOut')}
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <DetailsCard me={me} />
        {isParticipant ? <AboutMeCard /> : null}
        <PasswordCard me={me} />
        {isParticipant ? <ConsentsCard /> : null}
        {isParticipant ? <WhatsAppCard /> : null}
        {isParticipant ? <EmailReportsCard /> : null}
        {isParticipant ? <AiCard /> : null}
        <InstallCard />
        {isParticipant ? <DeletionCard /> : null}
      </div>
    </div>
  );
}
