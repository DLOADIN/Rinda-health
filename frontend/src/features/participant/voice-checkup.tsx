import '@/features/participant/voice-strings';
import { BUNDLED_CONTENT, RULESET_V1 } from '@rinda/content';
import { spokenText, VOICE, VOICE_CHOICES, VOICE_LINES } from '@rinda/content/voice';
import { checkItem9, validateMeasurement, type MeasurementType } from '@rinda/rules';
import { checkChatQuestion } from '@rinda/rules/chat-guard';
import type { CheckupAnswers } from '@rinda/schemas';
import { LogOut, Mic, RotateCcw, SkipForward, Undo2, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuickExit } from '@/components/app-shell';
import { GetHelp } from '@/components/get-help';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
import { Spinner } from '@/components/ui/spinner';
import type { WellnessState } from '@/features/participant/wellness-section';
import { canListen, listen, prefetch, speak, stopSpeaking } from '@/lib/voice';
import { readChoice, readCommand, readNumber, readYesNo } from '@/lib/voice-parse';

export interface VoiceState {
  answers: CheckupAnswers;
  wellness: WellnessState;
}
type Value = number | boolean | null;
type NumberField =
  | 'moderateMinutes'
  | 'vigorousMinutes'
  | 'servingsPerDay'
  | 'heightCm'
  | 'weightKg'
  | 'waistCm'
  | 'systolic'
  | 'diastolic';

export interface VoiceStep {
  id: string;
  kind: 'yesno' | 'choice' | 'number';
  options?: readonly string[];
  measure?: MeasurementType;
  minutes?: boolean;
  unit?: string;
  tapOnly?: boolean;
  read: (s: VoiceState) => Value | undefined;
  write: (s: VoiceState, v: Value) => VoiceState;
}

export const textEn = (id: string) => VOICE.en[id] ?? BUNDLED_CONTENT.en.text[id] ?? id;

const answer = (s: VoiceState, patch: Partial<CheckupAnswers>): VoiceState => ({
  ...s,
  answers: { ...s.answers, ...patch },
});

function numberStep(
  id: string,
  field: NumberField,
  measure: MeasurementType,
  unit: string,
  minutes = false,
): VoiceStep {
  return {
    id,
    kind: 'number',
    measure,
    unit,
    minutes,
    read: (s) => s.answers[field] ?? null,
    write: (s, v) => answer(s, { [field]: typeof v === 'number' ? v : null }),
  };
}

function auditStep(index: 0 | 1 | 2): VoiceStep {
  const id = `q.auditc.${index + 1}`;
  return {
    id,
    kind: 'choice',
    options: VOICE_CHOICES[id] ?? [],
    read: (s) => s.answers.auditC[index] ?? null,
    write: (s, v) => {
      const next = [...s.answers.auditC] as CheckupAnswers['auditC'];
      next[index] = typeof v === 'number' ? v : null;
      if (index === 0 && v === 0) {
        next[1] = null;
        next[2] = null;
      }
      return answer(s, { auditC: next });
    },
  };
}

function wellnessItem(which: 'phq9' | 'gad7', index: number): VoiceStep {
  const id = `q.${which}.${index + 1}`;
  return {
    id,
    kind: 'choice',
    options: VOICE_CHOICES[id] ?? [],
    tapOnly: which === 'phq9' && index === 8,
    read: (s) => s.wellness[which][index] ?? null,
    write: (s, v) => {
      const items = [...s.wellness[which]];
      items[index] = typeof v === 'number' ? v : null;
      return { ...s, wellness: { ...s.wellness, [which]: items } };
    },
  };
}

export function buildSteps(
  s: VoiceState,
  units: Record<'minutes' | 'servings' | 'cm' | 'kg' | 'mmHg', string>,
  wellnessOffered: boolean,
): VoiceStep[] {
  const steps: VoiceStep[] = [
    {
      id: 'q.tobacco.current',
      kind: 'yesno',
      read: (x) => x.answers.tobaccoUse ?? null,
      write: (x, v) => answer(x, { tobaccoUse: typeof v === 'boolean' ? v : null }),
    },
    auditStep(0),
    ...(s.answers.auditC[0] !== 0 ? [auditStep(1), auditStep(2)] : []),
    numberStep('q.activity.moderate', 'moderateMinutes', 'moderateMinutes', units.minutes, true),
    numberStep('q.activity.vigorous', 'vigorousMinutes', 'vigorousMinutes', units.minutes, true),
    numberStep('q.diet.servings', 'servingsPerDay', 'servingsPerDay', units.servings),
    {
      id: 'q.diet.salt',
      kind: 'yesno',
      read: (x) => x.answers.addsSaltAtTable ?? null,
      write: (x, v) => answer(x, { addsSaltAtTable: typeof v === 'boolean' ? v : null }),
    },
    {
      id: 'voice.source',
      kind: 'choice',
      options: VOICE_CHOICES['voice.source'] ?? [],
      read: (x) => (x.answers.measurementSource === 'recalled' ? 1 : 0),
      write: (x, v) => answer(x, { measurementSource: v === 1 ? 'recalled' : 'in_session' }),
    },
    numberStep('voice.body.height', 'heightCm', 'height', units.cm),
    numberStep('voice.body.weight', 'weightKg', 'weight', units.kg),
    numberStep('voice.body.waist', 'waistCm', 'waist', units.cm),
    numberStep('voice.bp.systolic', 'systolic', 'systolic', units.mmHg),
    numberStep('voice.bp.diastolic', 'diastolic', 'diastolic', units.mmHg),
  ];
  if (!wellnessOffered || s.wellness.mode === 'stopped') return steps;
  steps.push({
    id: 'voice.wellness.ask',
    kind: 'yesno',
    read: (x) =>
      x.wellness.mode === 'answering' ? true : x.wellness.mode === 'declined' ? false : undefined,
    write: (x, v) => ({ ...x, wellness: { ...x.wellness, mode: v === true ? 'answering' : 'declined' } }),
  });
  if (s.wellness.mode !== 'answering') return steps;
  s.wellness.phq9.forEach((_, i) => steps.push(wellnessItem('phq9', i)));
  s.wellness.gad7.forEach((_, i) => steps.push(wellnessItem('gad7', i)));
  return steps;
}

export function readSpoken(step: VoiceStep, heard: readonly string[]): Value | undefined {
  for (const text of heard) {
    if (step.kind === 'yesno') {
      const v = readYesNo(text);
      if (v !== null) return v;
    } else if (step.kind === 'number') {
      const v = readNumber(text, step.minutes ? 'minutes' : 'plain');
      if (v !== null) return v;
    } else {
      const v = readChoice(text, (step.options ?? []).map(textEn));
      if (v !== null) return v;
    }
  }
  return undefined;
}

type Status = 'speaking' | 'listening' | 'waiting';

export default function VoiceCheckup({
  open,
  onOpenChange,
  state,
  onChange,
  wellnessOffered,
  onItem9Risk,
  onCrisis,
  onSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: VoiceState;
  onChange: (next: VoiceState) => void;
  wellnessOffered: boolean;
  onItem9Risk: () => void;
  onCrisis: () => void;
  onSend: (state: VoiceState) => void;
}) {
  const { t, i18n } = useTranslation();
  const [phase, setPhase] = useState<'intro' | 'running' | 'done'>('intro');
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('waiting');
  const [heard, setHeard] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const listening = canListen();
  const run = useRef(0);
  const stopListening = useRef<() => void>(() => undefined);
  const latest = useRef(state);
  const callbacks = useRef({ onChange, onItem9Risk, onCrisis, onSend, onOpenChange });
  useEffect(() => {
    callbacks.current = { onChange, onItem9Risk, onCrisis, onSend, onOpenChange };
  });
  const quickExit = useQuickExit();

  const units = {
    minutes: t('checkup.units.minutes'),
    servings: t('checkup.units.servings'),
    cm: t('checkup.units.cm'),
    kg: t('checkup.units.kg'),
    mmHg: t('checkup.units.mmHg'),
  };
  const steps = buildSteps(state, units, wellnessOffered);
  const index = steps.findIndex((s) => s.id === currentId);
  const step = index >= 0 ? steps[index] : undefined;

  const halt = () => {
    run.current += 1;
    stopListening.current();
    stopSpeaking();
  };

  const close = (next: boolean) => {
    if (!next) halt();
    onOpenChange(next);
  };

  const say = (id: string) => speak(id, spokenText(id, textEn) ?? textEn(id));

  const commit = (target: VoiceStep, value: Value): boolean => {
    const next = target.write(latest.current, value);
    latest.current = next;
    callbacks.current.onChange(next);
    setSkipped((s) => {
      const copy = new Set(s);
      if (value === null) copy.add(target.id);
      else copy.delete(target.id);
      return copy;
    });
    if (target.id === 'q.phq9.9' && typeof value === 'number' && checkItem9({ value }) === 'tier2') {
      halt();
      callbacks.current.onOpenChange(false);
      callbacks.current.onItem9Risk();
      return false;
    }
    return true;
  };

  const finish = async (token: number) => {
    setPhase('done');
    setCurrentId(null);
    setStatus('speaking');
    await say('voice.done');
    if (token !== run.current) return;
    if (!listening) return setStatus('waiting');
    setStatus('listening');
    const attempt = listen();
    stopListening.current = attempt.stop;
    const texts = await attempt.heard;
    if (token !== run.current) return;
    setStatus('waiting');
    if (texts.some((x) => checkChatQuestion(x) === 'crisis')) return crisis();
    if (texts.some((x) => readCommand(x) === 'send')) send();
  };

  const send = () => {
    halt();
    void say('voice.sending');
    callbacks.current.onOpenChange(false);
    callbacks.current.onSend(latest.current);
  };

  const crisis = () => {
    halt();
    callbacks.current.onOpenChange(false);
    callbacks.current.onCrisis();
  };

  const stepsNow = () => buildSteps(latest.current, units, wellnessOffered);

  const goNext = (fromId: string, token: number) => {
    const list = stepsNow();
    const next = list[list.findIndex((s) => s.id === fromId) + 1];
    if (next) void ask(next.id, token);
    else void finish(token);
  };

  const ask = async (id: string, token = ++run.current): Promise<void> => {
    stopListening.current();
    setPhase('running');
    setCurrentId(id);
    setHeard(null);
    setDraft('');
    const target = stepsNow().find((s) => s.id === id);
    if (!target) return finish(token);
    setStatus('speaking');
    await say(id);
    if (token !== run.current) return;
    if (target.tapOnly || !listening) {
      if (target.tapOnly) await say('voice.wellness.tap');
      if (token === run.current) setStatus('waiting');
      return;
    }
    for (let tries = 0; tries < 3; tries++) {
      setStatus('listening');
      const attempt = listen();
      stopListening.current = attempt.stop;
      const texts = await attempt.heard;
      if (token !== run.current) return;
      if (texts.length === 0) {
        if (tries === 2) break;
        setStatus('speaking');
        await say('voice.again');
        if (token !== run.current) return;
        continue;
      }
      setHeard(texts[0] ?? null);
      if (texts.some((x) => checkChatQuestion(x) === 'crisis')) return crisis();
      const command = readCommand(texts[0] ?? '');
      if (command === 'skip') {
        if (!commit(target, null)) return;
        setStatus('speaking');
        await say('voice.skipped');
        if (token === run.current) goNext(id, token);
        return;
      }
      if (command === 'repeat') return ask(id, token);
      if (command === 'back') return back(id, token);
      const value = readSpoken(target, texts);
      setStatus('speaking');
      if (value === undefined || value === null) {
        await say('voice.again');
        if (token !== run.current) return;
        continue;
      }
      if (target.measure && typeof value === 'number' && rangeIssue(target, value)) {
        await say('voice.range');
        if (token !== run.current) return;
        continue;
      }
      if (!commit(target, value)) return;
      await say('voice.got');
      if (token === run.current) goNext(id, token);
      return;
    }
    if (token === run.current) setStatus('waiting');
  };

  const back = (fromId: string, token = ++run.current) => {
    const list = stepsNow();
    const previous = list[list.findIndex((s) => s.id === fromId) - 1];
    void ask(previous?.id ?? fromId, token);
  };

  const rangeIssue = (target: VoiceStep, value: number) => {
    if (!target.measure) return false;
    const diastolic = latest.current.answers.diastolic;
    return (
      validateMeasurement(
        target.measure,
        value,
        RULESET_V1,
        target.measure === 'systolic' && typeof diastolic === 'number' ? { diastolic } : {},
      ) !== null
    );
  };

  const start = async () => {
    latest.current = state;
    const token = ++run.current;
    void prefetch(VOICE_LINES);
    setPhase('running');
    setStatus('speaking');
    await say('voice.intro');
    if (token !== run.current) return;
    const first = stepsNow()[0];
    if (first) void ask(first.id, token);
  };

  const tap = (value: Value) => {
    if (!step) return;
    halt();
    latest.current = state;
    if (value !== null && step.measure && typeof value === 'number' && rangeIssue(step, value)) {
      void say('voice.range');
      return;
    }
    if (!commit(step, value)) return;
    goNext(step.id, run.current);
  };

  const shown = (s: VoiceStep): string => {
    const v = s.read(state);
    if (skipped.has(s.id)) return t('voice.skipped');
    if (v === undefined || v === null) return t('voice.noAnswer');
    if (s.kind === 'yesno') return v ? t('checkup.yes') : t('checkup.no');
    if (s.kind === 'choice') return textEn(s.options?.[Number(v)] ?? '');
    return `${String(v)} ${s.unit ?? ''}`;
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('voice.title')}</DialogTitle>
          <DialogDescription>{t('voice.notice')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 sm:flex-row" onClickCapture={halt}>
          <GetHelp className="flex-1" />
          <Button
            variant="outline"
            onClick={() => {
              close(false);
              quickExit();
            }}
            aria-label={t('shell.exitLabel')}
          >
            <LogOut aria-hidden="true" data-icon="inline-start" />
            {t('shell.exit')}
          </Button>
        </div>

        {phase === 'intro' ? (
          <div className="flex flex-col gap-3">
            {i18n.language === 'rw' ? <p className="text-sm">{t('voice.englishOnly')}</p> : null}
            {!listening ? <p className="text-sm">{t('voice.noMic')}</p> : null}
            <Button onClick={() => void start()} className="self-start">
              <Mic aria-hidden="true" data-icon="inline-start" />
              {t('voice.start')}
            </Button>
          </div>
        ) : null}

        {phase === 'running' && step ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge variant="outline">
                {t('voice.progress', { current: index + 1, total: steps.length })}
              </Badge>
              <span className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
                {status === 'speaking' ? <Volume2 aria-hidden="true" className="size-4" /> : null}
                {status === 'listening' ? <Spinner /> : null}
                {status === 'speaking'
                  ? t('voice.speaking')
                  : status === 'listening'
                    ? t('voice.listening')
                    : t('voice.waiting')}
              </span>
            </div>
            <p className="text-lg leading-relaxed font-medium">{textEn(step.id)}</p>
            {step.tapOnly ? <p className="text-sm text-muted-foreground">{t('voice.tapOnly')}</p> : null}
            {heard ? (
              <p className="text-sm text-muted-foreground">{t('voice.heard', { text: heard })}</p>
            ) : null}
            <p className="text-sm">{t('voice.answer', { answer: shown(step) })}</p>

            {step.kind === 'yesno' ? (
              <div className="grid grid-cols-2 gap-2">
                <Button variant={step.read(state) === true ? 'default' : 'outline'} onClick={() => tap(true)}>
                  {t('checkup.yes')}
                </Button>
                <Button
                  variant={step.read(state) === false ? 'default' : 'outline'}
                  onClick={() => tap(false)}
                >
                  {t('checkup.no')}
                </Button>
              </div>
            ) : null}
            {step.kind === 'choice' ? (
              <div className="flex flex-col gap-2">
                {(step.options ?? []).map((o, i) => (
                  <Button
                    key={o}
                    variant={step.read(state) === i ? 'default' : 'outline'}
                    className="h-auto min-h-11 justify-start text-left whitespace-normal"
                    onClick={() => tap(i)}
                  >
                    {textEn(o)}
                  </Button>
                ))}
              </div>
            ) : null}
            {step.kind === 'number' ? (
              <form
                className="flex flex-col gap-2 sm:flex-row sm:items-end"
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = Number(draft);
                  if (draft.trim() !== '' && Number.isFinite(v)) tap(v);
                }}
              >
                <Field className="flex-1">
                  <FieldLabel htmlFor="voice-number">{t('voice.numberLabel')}</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id="voice-number"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupText>{step.unit}</InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                </Field>
                <Button type="submit">{t('voice.save')}</Button>
              </form>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {listening && !step.tapOnly && status === 'waiting' ? (
                <Button variant="secondary" onClick={() => void ask(step.id)}>
                  <Mic aria-hidden="true" data-icon="inline-start" />
                  {t('voice.listen')}
                </Button>
              ) : null}
              <Button variant="outline" onClick={() => tap(null)}>
                <SkipForward aria-hidden="true" data-icon="inline-start" />
                {t('voice.skip')}
              </Button>
              <Button variant="outline" onClick={() => void ask(step.id)}>
                <RotateCcw aria-hidden="true" data-icon="inline-start" />
                {t('voice.repeat')}
              </Button>
              {index > 0 ? (
                <Button variant="outline" onClick={() => back(step.id)}>
                  <Undo2 aria-hidden="true" data-icon="inline-start" />
                  {t('voice.back')}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {phase === 'running' && !step ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Volume2 aria-hidden="true" className="size-4" />
            {t('voice.speaking')}
          </p>
        ) : null}

        {phase === 'done' ? (
          <div className="flex flex-col gap-3">
            <p>{t('voice.done')}</p>
            <Button onClick={send} className="self-start">
              {t('voice.send')}
            </Button>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)}>
            {t('voice.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
