import type { CheckupAnswers } from '@rinda/schemas';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from '@/app/store';
import '@/lib/i18n';
import type { VoiceState } from '@/features/participant/voice-checkup';
import { WELLNESS_START } from '@/features/participant/wellness-section';
import type * as VoiceModule from '@/lib/voice';

// Only the speaking is replaced. Listening is the real code, fed by a stand-in for the
// browser's speech recognition that delivers each answer in pieces, with pauses, like Chrome.
const spoken: string[] = [];
vi.mock('@/lib/voice', async (original) => ({
  ...(await original<typeof VoiceModule>()),
  prefetch: async () => undefined,
  speak: async (id: string) => {
    spoken.push(id);
  },
  stopSpeaking: () => undefined,
}));

// One entry per question: the pieces the person says, with a pause between each piece.
// The person answers only the question Rinda spoke last, and is silent after answering.
let answers = new Map<string, string[]>();
const currentQuestion = () => [...spoken].reverse().find((id) => answers.has(id));

class FakeRecognition {
  lang = '';
  interimResults = false;
  maxAlternatives = 1;
  continuous = false;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event?: { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start() {
    const question = currentQuestion();
    const piece = question ? answers.get(question)?.shift() : undefined;
    setTimeout(
      () => {
        if (piece !== undefined) {
          this.onresult?.({ results: [Object.assign([{ transcript: piece }], { isFinal: true })] });
        }
        this.onend?.();
      },
      piece === undefined ? 5000 : 60,
    );
  }
  abort() {
    this.onresult = null;
  }
}

const { default: VoiceCheckup } = await import('@/features/participant/voice-checkup');

const EMPTY: CheckupAnswers = {
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

function Harness({ onSend }: { onSend: (s: VoiceState) => void }) {
  const [state, setState] = useState<VoiceState>({ answers: EMPTY, wellness: WELLNESS_START });
  return (
    <Provider store={createStore()}>
      <MemoryRouter>
        <VoiceCheckup
          open
          onOpenChange={() => undefined}
          state={state}
          onChange={setState}
          wellnessOffered
          onItem9Risk={() => undefined}
          onCrisis={() => undefined}
          onSend={onSend}
        />
      </MemoryRouter>
    </Provider>
  );
}

const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  vi.useFakeTimers();
  spoken.length = 0;
  (globalThis as { SpeechRecognition?: unknown }).SpeechRecognition = FakeRecognition;
});
afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as { SpeechRecognition?: unknown }).SpeechRecognition;
});

describe('VoiceCheckup with real listening', () => {
  it('understands an everyday spoken answer to every question, in order', async () => {
    answers = new Map<string, string[]>([
      ['q.tobacco.current', ['um', 'no I do not smoke']],
      ['q.auditc.1', ['two or three', 'times a month']],
      ['q.auditc.2', ['two or three beers']],
      ['q.auditc.3', ['less than once a month']],
      ['q.activity.moderate', ['um', 'about thirty minutes a day']],
      ['q.activity.vigorous', ['an hour', 'three times a week']],
      ['q.diet.servings', ['three servings']],
      ['q.diet.salt', ['yes a little']],
      ['voice.source', ['from memory']],
      ['voice.body.height', ['one seventy five']], // a bare number, then quiet
      ['voice.body.weight', ['seventy two kilos']],
      ['voice.body.waist', ['eighty five centimetres']],
      ['voice.bp.systolic', ['one twenty over eighty']], // both numbers at once
      ['voice.wellness.ask', ['yes okay']],
      ['q.phq9.1', ['not at all']],
      ['q.phq9.2', ['sometimes']],
      ['q.phq9.3', ['most days']],
      ['q.phq9.4', ['nearly every day']],
      ['q.phq9.5', ['a few days']],
      ['q.phq9.6', ['no']],
      ['q.phq9.7', ['about three days']],
      ['q.phq9.8', ['never']], // item 9 is tapped, never heard
      ['q.gad7.1', ['several days']],
      ['q.gad7.2', ['not really']],
      ['q.gad7.3', ['more than half the days']],
      ['q.gad7.4', ['every day']],
      ['q.gad7.5', ['sometimes']],
      ['q.gad7.6', ['no']],
      ['q.gad7.7', ['once or twice']],
      ['voice.done', ['send']],
    ]);
    const onSend = vi.fn();
    render(<Harness onSend={onSend} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start talking' }));

    for (let i = 0; i < 400 && !screen.queryByText('Please tap your answer for this question.'); i++)
      await tick(250);
    expect(spoken.join(' | ')).toContain('q.phq9.9');
    fireEvent.click(screen.getByRole('button', { name: 'Not at all' }));

    for (let i = 0; i < 400 && onSend.mock.calls.length === 0; i++) await tick(250);
    expect(onSend).toHaveBeenCalledTimes(1);
    const sent = onSend.mock.calls[0]?.[0] as VoiceState;
    expect(sent.answers).toEqual({
      tobaccoUse: false,
      auditC: [2, 1, 1],
      moderateMinutes: 210,
      vigorousMinutes: 180,
      servingsPerDay: 3,
      addsSaltAtTable: true,
      measurementSource: 'recalled',
      heightCm: 175,
      weightKg: 72,
      waistCm: 85,
      systolic: 120,
      diastolic: 80,
    });
    expect(sent.wellness.mode).toBe('answering');
    expect(sent.wellness.phq9).toEqual([0, 1, 2, 3, 1, 0, 1, 0, 0]);
    expect(sent.wellness.gad7).toEqual([1, 0, 2, 3, 1, 0, 1]);
    // Every answer was understood the first time: Rinda never had to ask again.
    expect(spoken).not.toContain('voice.again');
    expect(spoken).not.toContain('voice.unclear');
  }, 60000);
});
