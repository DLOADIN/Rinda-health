import { RULESET_V1 } from '@rinda/content';
import { validateMeasurement, type MeasurementType } from '@rinda/rules';
import type { CheckupAnswers, CheckupSubmission } from '@rinda/schemas';
import { Camera, Mic, Smartphone, QrCode } from 'lucide-react';
import { lazy, Suspense, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { ApiError } from '@/components/api-error';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Spinner } from '@/components/ui/spinner';
import { Choice } from '@/features/participant/choice';
import {
  SafetyScreen,
  WellnessSection,
  WELLNESS_START,
  type WellnessState,
} from '@/features/participant/wellness-section';
import { ResultView } from '@/features/results/result-view';
import {
  errorCode,
  errorDetails,
  useConsentsQuery,
  useMeQuery,
  useParticipantProfileQuery,
  useSubmitCheckupMutation,
  type Assessment,
} from '@/lib/api';
import { addToOutbox, queueSafetyEvent, scoreOnPhone } from '@/lib/offline';
import { reportStep } from '@/lib/session-progress';
import { useCached } from '@/lib/use-cached';
import '@/features/profile/phone-strings';
import '@/features/participant/voice-strings';
import type { VoiceState } from '@/features/participant/voice-checkup';
import type { PhoneHealthStatus } from '@rinda/schemas';
import { toast } from 'sonner';
import { isNativeApp } from '@/lib/phone-health';
import { useContent } from '@/lib/content';

const BpCamera = lazy(() => import('@/features/participant/bp-camera'));
const HandoverDialog = lazy(() => import('@/features/participant/handover-dialog'));
const VoiceCheckup = lazy(() => import('@/features/participant/voice-checkup'));

type Answers = CheckupAnswers;
const NUMBER_KEYS = [
  'moderateMinutes',
  'vigorousMinutes',
  'servingsPerDay',
  'heightCm',
  'weightKg',
  'waistCm',
  'systolic',
  'diastolic',
] as const;
const MEASUREMENTS: readonly string[] = ['heightCm', 'weightKg', 'waistCm', 'systolic', 'diastolic'];
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

export function CheckupPage() {
  const { t, i18n } = useTranslation();
  const { text } = useContent();
  const navigate = useNavigate();
  const [submit, { isLoading, error }] = useSubmitCheckupMutation();
  const [key] = useState(() => crypto.randomUUID());
  const [safetyEventId] = useState(() => crypto.randomUUID());
  const [startedAt] = useState(() => new Date().toISOString());
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [raw, setRaw] = useState<Partial<Record<NumberKey, string>>>({});

  const fillFromPhone = async () => {
    const res = await fetch('/api/v1/participant/phone-health', { credentials: 'same-origin' }).catch(
      () => null,
    );
    const status = res?.ok ? ((await res.json()) as PhoneHealthStatus) : null;
    const latest = (type: string) => status?.readings.find((r) => r.type === type);
    const bp = latest('bloodPressure');
    const weight = latest('weight');
    const height = latest('height');
    if (!bp && !weight && !height) {
      toast(t('phone.noRecent'));
      return;
    }
    const heightCm = height ? (/^m/i.test(height.unit) ? height.value * 100 : height.value) : undefined;
    const today = new Date().toLocaleDateString('en-CA');
    const old = [bp, weight, height].some((r) => r && r.day !== today);
    const next: Partial<Answers> = {
      ...(bp
        ? { systolic: Math.round(bp.value), diastolic: bp.value2 === null ? null : Math.round(bp.value2) }
        : {}),
      ...(weight ? { weightKg: Math.round(weight.value * 10) / 10 } : {}),
      ...(heightCm !== undefined ? { heightCm: Math.round(heightCm * 10) / 10 } : {}),
      ...(old ? { measurementSource: 'recalled' as const } : {}),
    };
    setAnswers((a) => ({ ...a, ...next }));
    setRaw((r) => ({
      ...r,
      ...Object.fromEntries(
        (['systolic', 'diastolic', 'weightKg', 'heightCm'] as const)
          .filter((k) => typeof next[k] === 'number')
          .map((k) => [k, String(next[k])]),
      ),
    }));
    toast.success(t('phone.filled'));
  };
  const [wellness, setWellness] = useState(WELLNESS_START);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const applyVoice = (next: VoiceState) => {
    setAnswers(next.answers);
    setWellness(next.wellness);
    setRaw(
      Object.fromEntries(
        NUMBER_KEYS.map((k) => [k, typeof next.answers[k] === 'number' ? String(next.answers[k]) : '']),
      ),
    );
  };

  const { data: me } = useMeQuery();
  const { data: profile } = useParticipantProfileQuery();
  const { data: liveConsents, error: consentError } = useConsentsQuery();
  const { data: consents } = useCached(me ? `consents:${me.id}` : null, liveConsents, consentError);
  const wellnessOffered = consents?.mental_wellness === true;
  const wellnessAnswers = (w: WellnessState = wellness): CheckupAnswers['wellness'] =>
    wellnessOffered && (w.mode === 'answering' || w.mode === 'stopped')
      ? { phq9: w.phq9, gad7: w.gad7 }
      : 'declined';
  const onItem9Risk = () => {
    setSafetyOpen(true);
    window.scrollTo({ top: 0 });
    if (me) void queueSafetyEvent(me.id, safetyEventId);
  };
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
            onFocus={() => {
              if (MEASUREMENTS.includes(k)) reportStep('measurements');
            }}
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
    await send();
  };

  const send = async (voice?: VoiceState) => {
    const body: CheckupSubmission = {
      language: i18n.language === 'rw' ? 'rw' : 'en',
      startedAt,
      answers: { ...(voice?.answers ?? answers), wellness: wellnessAnswers(voice?.wellness) },
    };
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

  if (safetyOpen) {
    return (
      <div className="flex flex-col gap-6">
        <SafetyScreen
          onStop={() => {
            setWellness({ ...wellness, mode: 'stopped' });
            setSafetyOpen(false);
          }}
          onContinue={() => setSafetyOpen(false)}
        />
      </div>
    );
  }

  if (provisional) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('checkup.title')} />
        {me ? (
          <Button variant="outline" className="self-start" onClick={() => setHandoverOpen(true)}>
            <QrCode aria-hidden="true" data-icon="inline-start" />
            {t('handover.open')}
          </Button>
        ) : null}
        {me && handoverOpen ? (
          <Suspense fallback={null}>
            <HandoverDialog userId={me.id} open={handoverOpen} onOpenChange={setHandoverOpen} />
          </Suspense>
        ) : null}
        <ResultView assessment={provisional} />
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4" noValidate>
      <PageHeader title={t('checkup.title')} description={t('checkup.intro')} />

      <Card>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">{t('voice.openHint')}</p>
          <Button type="button" onClick={() => setVoiceOpen(true)} className="shrink-0">
            <Mic aria-hidden="true" data-icon="inline-start" />
            {t('voice.open')}
          </Button>
        </CardContent>
      </Card>
      {voiceOpen ? (
        <Suspense fallback={null}>
          <VoiceCheckup
            open={voiceOpen}
            onOpenChange={setVoiceOpen}
            state={{ answers, wellness }}
            onChange={applyVoice}
            wellnessOffered={wellnessOffered}
            onItem9Risk={onItem9Risk}
            onCrisis={() => {
              setSafetyOpen(true);
              window.scrollTo({ top: 0 });
            }}
            onSend={(v) => void send(v)}
          />
        </Suspense>
      ) : null}

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
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() => {
            reportStep('measurements');
            setCameraOpen(true);
          }}
        >
          <Camera aria-hidden="true" data-icon="inline-start" />
          {t('checkup.camera.open')}
        </Button>
        {isNativeApp() ? (
          <Button type="button" variant="outline" className="self-start" onClick={() => void fillFromPhone()}>
            <Smartphone aria-hidden="true" data-icon="inline-start" />
            {t('phone.fill')}
          </Button>
        ) : null}
        {cameraOpen ? (
          <Suspense fallback={null}>
            <BpCamera
              open={cameraOpen}
              onOpenChange={setCameraOpen}
              onUse={({ systolic, diastolic }) => {
                setRaw({ ...raw, systolic: String(systolic), diastolic: String(diastolic) });
                setAnswers({ ...answers, systolic, diastolic });
              }}
            />
          </Suspense>
        ) : null}
      </Section>

      {wellnessOffered ? (
        <WellnessSection state={wellness} onChange={setWellness} onItem9Risk={onItem9Risk} />
      ) : null}

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
