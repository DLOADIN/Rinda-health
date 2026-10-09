// Health check-up for the six NCD areas. Every question can be skipped, with no default answer (FR-05).
// Ranges are checked on the server by @rinda/rules and shown next to the field (FR-07). The Idempotency-Key is made
// when the check-up starts, so retries never create a second record (FR-08).
import { RULESET_V1 } from '@rinda/content';
import { validateMeasurement, type MeasurementType } from '@rinda/rules';
import type { CheckupAnswers, CheckupSubmission } from '@rinda/schemas';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { ApiError } from '@/components/api-error';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Spinner } from '@/components/ui/spinner';
import { ResultView } from '@/features/results/result-view';
import {
  errorCode,
  errorDetails,
  useMeQuery,
  useParticipantProfileQuery,
  useSubmitCheckupMutation,
  type Assessment,
} from '@/lib/api';
import { addToOutbox, scoreOnPhone } from '@/lib/offline';
import { useContent } from '@/lib/content';

type Answers = CheckupAnswers;
type NumberKey =
  | 'moderateMinutes'
  | 'vigorousMinutes'
  | 'servingsPerDay'
  | 'heightCm'
  | 'weightKg'
  | 'waistCm'
  | 'systolic'
  | 'diastolic';

const EMPTY: Answers = {
  tobaccoUse: null,
  auditC: [null, null, null],
  moderateMinutes: null,
  vigorousMinutes: null,
  servingsPerDay: null,
  addsSaltAtTable: null,
  heightCm: null,
  weightKg: null,
  waistCm: null,
  systolic: null,
  diastolic: null,
  measurementSource: 'in_session',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>{children}</FieldGroup>
      </CardContent>
    </Card>
  );
}

/** A choice question as full-width rows (44 px targets), with "Skip this question". Nothing is preselected. */
function Choice({
  id,
  question,
  options,
  value,
  onChange,
}: {
  id: string;
  question: string;
  options: Array<{ value: string; label: string }>;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <FieldSet>
      <FieldLegend variant="label" className="text-base">
        {question}
      </FieldLegend>
      <RadioGroup value={value ?? ''} onValueChange={(v) => onChange(v)}>
        {options.map((o) => (
          <FieldLabel key={o.value} htmlFor={`${id}-${o.value}`}>
            <Field orientation="horizontal" className="min-h-11">
              <FieldContent>
                <FieldTitle>{o.label}</FieldTitle>
              </FieldContent>
              <RadioGroupItem value={o.value} id={`${id}-${o.value}`} />
            </Field>
          </FieldLabel>
        ))}
      </RadioGroup>
      <Button
        type="button"
        variant="ghost"
        className="self-start"
        onClick={() => onChange(null)}
        disabled={value === null}
      >
        {t('checkup.skip')}
      </Button>
    </FieldSet>
  );
}

export function CheckupPage() {
  const { t, i18n } = useTranslation();
  const { text } = useContent();
  const navigate = useNavigate();
  const [submit, { isLoading, error }] = useSubmitCheckupMutation();
  const [key] = useState(() => crypto.randomUUID());
  const [startedAt] = useState(() => new Date().toISOString());
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [raw, setRaw] = useState<Partial<Record<NumberKey, string>>>({});

  const { data: me } = useMeQuery();
  const { data: profile } = useParticipantProfileQuery();
  const [provisional, setProvisional] = useState<Assessment | null>(null);
  const [localIssues, setLocalIssues] = useState<Array<[string, string]>>([]);
  const issues = new Map([
    ...errorDetails(error).map((d) => [d.path.replace('answers.', ''), d.issue] as [string, string]),
    ...localIssues,
  ]);
  const yesNo = [
    { value: 'yes', label: t('checkup.yes') },
    { value: 'no', label: t('checkup.no') },
  ];
  const bool = (v: boolean | null | undefined) => (v === null || v === undefined ? null : v ? 'yes' : 'no');
  const auditOptions = (item: number) =>
    [0, 1, 2, 3, 4].map((n) => ({ value: String(n), label: text(`q.auditc.${item}.opt.${n}`) }));
  const setAudit = (index: 0 | 1 | 2, v: string | null) => {
    const next = [...answers.auditC] as Answers['auditC'];
    next[index] = v === null ? null : Number(v);
    // "Never" drinks: questions 2 and 3 do not apply.
    if (index === 0 && v === '0') {
      next[1] = null;
      next[2] = null;
    }
    setAnswers({ ...answers, auditC: next });
  };

  const number = (k: NumberKey, labelId: string, unit: string, step = '1') => {
    const issue = issues.get(k);
    return (
      <Field data-invalid={Boolean(issue)}>
        <FieldLabel htmlFor={`n-${k}`}>{text(labelId)}</FieldLabel>
        <InputGroup>
          <InputGroupInput
            id={`n-${k}`}
            type="number"
            inputMode="decimal"
            step={step}
            min="0"
            value={raw[k] ?? ''}
            aria-invalid={Boolean(issue)}
            onChange={(e) => {
              const value = e.target.value;
              setRaw({ ...raw, [k]: value });
              setAnswers({
                ...answers,
                [k]: value === '' || Number.isNaN(Number(value)) ? null : Number(value),
              });
            }}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupText>{unit}</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
        {issue ? (
          <FieldError>
            {t(`checkup.issues.${issue}`, { defaultValue: t('checkup.issues.out_of_range') })}
          </FieldError>
        ) : null}
      </Field>
    );
  };

  /** The same range checks the server runs (FR-07), so an offline check-up is never queued with a bad reading. */
  const checkRanges = (a: CheckupAnswers): Array<[string, string]> => {
    const fields: Array<[keyof CheckupAnswers, MeasurementType]> = [
      ['heightCm', 'height'],
      ['weightKg', 'weight'],
      ['waistCm', 'waist'],
      ['diastolic', 'diastolic'],
      ['moderateMinutes', 'moderateMinutes'],
      ['vigorousMinutes', 'vigorousMinutes'],
      ['servingsPerDay', 'servingsPerDay'],
    ];
    const found: Array<[string, string]> = [];
    for (const [field, type] of fields) {
      const value = a[field];
      if (typeof value === 'number') {
        const issue = validateMeasurement(type, value, RULESET_V1);
        if (issue) found.push([field, issue]);
      }
    }
    if (typeof a.systolic === 'number') {
      const issue = validateMeasurement('systolic', a.systolic, RULESET_V1, {
        ...(typeof a.diastolic === 'number' ? { diastolic: a.diastolic } : {}),
      });
      if (issue) found.push(['systolic', issue]);
    }
    return found;
  };

  /** Offline: score on the phone, keep the check-up encrypted, and send it when the network returns (FR-29). */
  const saveOffline = async (body: CheckupSubmission) => {
    const found = checkRanges(body.answers);
    setLocalIssues(found);
    if (found.length > 0 || !me) return;
    const result = scoreOnPhone(body, profile?.sex ?? 'not_stated', key);
    await addToOutbox({ key, userId: me.id, body, provisional: result });
    setProvisional(result);
    window.scrollTo({ top: 0 });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const body: CheckupSubmission = { language: i18n.language === 'rw' ? 'rw' : 'en', startedAt, answers };
    if (!navigator.onLine) {
      await saveOffline(body);
      return;
    }
    setLocalIssues([]);
    const result = await submit({ key, body });
    if ('data' in result && result.data) {
      void navigate(`/app/results/${result.data.id}`, { replace: true });
    } else if ('error' in result && errorCode(result.error) === 'OFFLINE') {
      await saveOffline(body);
    }
  };

  if (provisional) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('checkup.title')} />
        <ResultView assessment={provisional} />
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4" noValidate>
      <PageHeader title={t('checkup.title')} description={t('checkup.intro')} />

      <Section title={t('checkup.sections.tobacco')}>
        <Choice
          id="tobacco"
          question={text('q.tobacco.current')}
          options={yesNo}
          value={bool(answers.tobaccoUse)}
          onChange={(v) => setAnswers({ ...answers, tobaccoUse: v === null ? null : v === 'yes' })}
        />
      </Section>

      <Section title={t('checkup.sections.alcohol')}>
        <Choice
          id="auditc1"
          question={text('q.auditc.1')}
          options={auditOptions(1)}
          value={answers.auditC[0]?.toString() ?? null}
          onChange={(v) => setAudit(0, v)}
        />
        {answers.auditC[0] !== 0 ? (
          <>
            <Choice
              id="auditc2"
              question={text('q.auditc.2')}
              options={auditOptions(2)}
              value={answers.auditC[1]?.toString() ?? null}
              onChange={(v) => setAudit(1, v)}
            />
            <Choice
              id="auditc3"
              question={text('q.auditc.3')}
              options={auditOptions(3)}
              value={answers.auditC[2]?.toString() ?? null}
              onChange={(v) => setAudit(2, v)}
            />
          </>
        ) : null}
      </Section>

      <Section title={t('checkup.sections.activity')}>
        {number('moderateMinutes', 'q.activity.moderate', t('checkup.units.minutes'))}
        {number('vigorousMinutes', 'q.activity.vigorous', t('checkup.units.minutes'))}
      </Section>

      <Section title={t('checkup.sections.diet')}>
        {number('servingsPerDay', 'q.diet.servings', t('checkup.units.servings'))}
        <Choice
          id="salt"
          question={text('q.diet.salt')}
          options={yesNo}
          value={bool(answers.addsSaltAtTable)}
          onChange={(v) => setAnswers({ ...answers, addsSaltAtTable: v === null ? null : v === 'yes' })}
        />
      </Section>

      <Section title={t('checkup.sections.body')}>
        <FieldSet>
          <FieldLegend variant="label">{t('checkup.source')}</FieldLegend>
          <RadioGroup
            value={answers.measurementSource}
            onValueChange={(v) =>
              setAnswers({ ...answers, measurementSource: v === 'recalled' ? 'recalled' : 'in_session' })
            }
          >
            {(['in_session', 'recalled'] as const).map((s) => (
              <Field key={s} orientation="horizontal" className="min-h-11">
                <RadioGroupItem value={s} id={`src-${s}`} />
                <FieldLabel htmlFor={`src-${s}`} className="font-normal">
                  {t(`checkup.sources.${s}`)}
                </FieldLabel>
              </Field>
            ))}
          </RadioGroup>
        </FieldSet>
        <div className="grid gap-4 sm:grid-cols-3">
          {number('heightCm', 'q.body.height', t('checkup.units.cm'), '0.1')}
          {number('weightKg', 'q.body.weight', t('checkup.units.kg'), '0.1')}
          {number('waistCm', 'q.body.waist', t('checkup.units.cm'), '0.1')}
        </div>
      </Section>

      <Section title={t('checkup.sections.bp')}>
        <div className="grid gap-4 sm:grid-cols-2">
          {number('systolic', 'q.bp.systolic', t('checkup.units.mmHg'))}
          {number('diastolic', 'q.bp.diastolic', t('checkup.units.mmHg'))}
        </div>
      </Section>

      <FieldDescription>{t('checkup.mentalWellnessLater')}</FieldDescription>
      {error && errorCode(error) !== 'VALIDATION_FAILED' ? <ApiError error={error} /> : null}
      {issues.size > 0 ? (
        <Alert role="alert">
          <AlertDescription>{t('apiErrors.VALIDATION_FAILED')}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={isLoading} className="w-full sm:w-auto sm:self-start">
        {isLoading ? <Spinner data-icon="inline-start" /> : null}
        {isLoading ? t('checkup.sending') : t('checkup.submit')}
      </Button>
    </form>
  );
}
