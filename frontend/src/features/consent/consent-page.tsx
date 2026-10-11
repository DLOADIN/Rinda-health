// First visit (FR-01, FR-02): the purpose statement, the age check (18 to 35) and four separate, un-ticked consent
// choices. Nothing is preselected. Someone outside the age range sees the referral list and cannot continue.
import { STUDY_CONSENTS, type StudyConsent } from '@rinda/schemas';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '@/components/api-error';
import { PageHeader } from '@/components/page-header';
import { ReferralList } from '@/components/referral-list';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Spinner } from '@/components/ui/spinner';
import { useSubmitConsentsMutation } from '@/lib/api';
import { useContent } from '@/lib/content';

const NONE: Record<StudyConsent, boolean> = {
  core: false,
  mental_wellness: false,
  audio: false,
  follow_up: false,
};

export function ConsentPage() {
  const { t, i18n } = useTranslation();
  const { text } = useContent();
  const [purpose, setPurpose] = useState(false);
  const [age, setAge] = useState<'yes' | 'no' | null>(null);
  const [choices, setChoices] = useState(NONE);
  const [submit, { isLoading, error }] = useSubmitConsentsMutation();
  const ready = purpose && age === 'yes' && choices.core;

  const onContinue = () => {
    if (!ready) return;
    void submit({
      purposeAcknowledged: true,
      ageConfirmed: true,
      consents: choices,
      language: i18n.language === 'rw' ? 'rw' : 'en',
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={text('consent.title')} />

      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-xl">{text('purpose.title')}</CardTitle>
          <CardDescription>{text('purpose.body')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Field orientation="horizontal" className="min-h-11">
            <Checkbox id="purpose" checked={purpose} onCheckedChange={(v) => setPurpose(v === true)} />
            <FieldLabel htmlFor="purpose" className="font-normal">
              {text('consent.purpose.ack')}
            </FieldLabel>
          </Field>
        </CardContent>
      </Card>

      <Card className="glass">
        <CardContent>
          <FieldSet>
            <FieldLegend variant="label" className="text-base">
              {text('consent.age.question')}
            </FieldLegend>
            <RadioGroup value={age ?? ''} onValueChange={(v) => setAge(v === 'yes' ? 'yes' : 'no')}>
              {(['yes', 'no'] as const).map((v) => (
                <FieldLabel key={v} htmlFor={`age-${v}`}>
                  <Field orientation="horizontal" className="min-h-11">
                    <FieldContent>
                      <FieldTitle>{t(`checkup.${v}`)}</FieldTitle>
                    </FieldContent>
                    <RadioGroupItem value={v} id={`age-${v}`} />
                  </Field>
                </FieldLabel>
              ))}
            </RadioGroup>
          </FieldSet>
        </CardContent>
      </Card>

      {age === 'no' ? (
        <Card className="glass">
          <CardHeader>
            <CardDescription className="text-base text-foreground">
              {text('consent.age.ineligible')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReferralList />
          </CardContent>
        </Card>
      ) : null}

      {age === 'yes' ? (
        <Card className="glass">
          <CardHeader>
            <CardDescription className="text-base text-foreground">
              {text('consent.choices.intro')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              {STUDY_CONSENTS.map((scope) => (
                <Field key={scope} orientation="horizontal" className="min-h-11">
                  <Checkbox
                    id={`consent-${scope}`}
                    checked={choices[scope]}
                    onCheckedChange={(v) => setChoices({ ...choices, [scope]: v === true })}
                  />
                  <FieldContent>
                    <FieldLabel htmlFor={`consent-${scope}`}>{text(`consent.${scope}.label`)}</FieldLabel>
                    <FieldDescription>{text(`consent.${scope}.body`)}</FieldDescription>
                  </FieldContent>
                </Field>
              ))}
            </FieldGroup>
          </CardContent>
        </Card>
      ) : null}

      {age === 'yes' && purpose && !choices.core ? (
        <Alert>
          <AlertDescription>{text('consent.core.required')}</AlertDescription>
        </Alert>
      ) : null}
      <ApiError error={error} />
      {age !== 'no' ? (
        <Button
          className="w-full sm:w-auto sm:self-start"
          disabled={!ready || isLoading}
          onClick={onContinue}
        >
          {isLoading ? <Spinner data-icon="inline-start" /> : null}
          {t('consent.continue')}
        </Button>
      ) : null}
    </div>
  );
}
