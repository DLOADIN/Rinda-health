import type { CheckupAnswers } from '@rinda/schemas';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { createStore } from '@/app/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/lib/i18n';
import type { VoiceState } from '@/features/participant/voice-checkup';
import { WELLNESS_START } from '@/features/participant/wellness-section';

const spoken: string[] = [];
let replies: string[] = [];

vi.mock('@/lib/voice', () => ({
  canListen: () => true,
  prefetch: async () => undefined,
  speak: async (id: string) => {
    spoken.push(id);
  },
  stopSpeaking: () => undefined,
  listen: () => ({
    heard: Promise.resolve(replies.length ? [replies.shift() ?? ''] : []),
    stop: () => undefined,
  }),
}));

const { default: VoiceCheckup, buildSteps } = await import('@/features/participant/voice-checkup');

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
const UNITS = { minutes: 'minutes a week', servings: 'servings a day', cm: 'cm', kg: 'kg', mmHg: 'mmHg' };

function Harness(props: {
  onSend: (s: VoiceState) => void;
  onCrisis?: () => void;
  onItem9Risk?: () => void;
  wellnessOffered?: boolean;
  start?: VoiceState;
}) {
  const [state, setState] = useState<VoiceState>(props.start ?? { answers: EMPTY, wellness: WELLNESS_START });
  return (
    <Provider store={createStore()}>
      <MemoryRouter>
        <VoiceCheckup
          open
          onOpenChange={() => undefined}
          state={state}
          onChange={setState}
          wellnessOffered={props.wellnessOffered ?? false}
          onItem9Risk={props.onItem9Risk ?? (() => undefined)}
          onCrisis={props.onCrisis ?? (() => undefined)}
          onSend={props.onSend}
        />
      </MemoryRouter>
    </Provider>
  );
}

beforeEach(() => {
  spoken.length = 0;
});

describe('VoiceCheckup', () => {
  it('asks every question aloud and fills the same answers as the form', async () => {
    replies = [
      'no I do not',
      'never',
      'about two hours',
      'skip',
      'five',
      'yes',
      'taken today',
      'one hundred and seventy',
      'seventy two point five',
      '80',
      '128',
      'eighty four',
      'send',
    ];
    const onSend = vi.fn();
    render(<Harness onSend={onSend} />);
    await userEvent.click(screen.getByRole('button', { name: 'Start talking' }));
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1), { timeout: 4000 });
    const sent = onSend.mock.calls[0]?.[0] as VoiceState;
    expect(sent.answers).toMatchObject({
      tobaccoUse: false,
      auditC: [0, null, null],
      moderateMinutes: 120,
      vigorousMinutes: null,
      servingsPerDay: 5,
      addsSaltAtTable: true,
      measurementSource: 'in_session',
      heightCm: 170,
      weightKg: 72.5,
      waistCm: 80,
      systolic: 128,
      diastolic: 84,
    });
    expect(spoken).toContain('voice.intro');
    expect(spoken).toContain('q.tobacco.current');
    expect(spoken).toContain('voice.bp.diastolic');
    expect(spoken).toContain('voice.skipped');
    expect(spoken).not.toContain('q.auditc.2');
  });

  it('asks again when a number is out of range, then accepts a good one', async () => {
    replies = [
      'no',
      'never',
      '999999',
      '60',
      'skip',
      'skip',
      'skip',
      'skip',
      'skip',
      'skip',
      'skip',
      'skip',
      'skip',
      'send',
    ];
    const onSend = vi.fn();
    render(<Harness onSend={onSend} />);
    await userEvent.click(screen.getByRole('button', { name: 'Start talking' }));
    await waitFor(() => expect(onSend).toHaveBeenCalled(), { timeout: 4000 });
    expect(spoken).toContain('voice.range');
    expect((onSend.mock.calls[0]?.[0] as VoiceState).answers.moderateMinutes).toBe(60);
  });

  it('stops and opens the safety screen when a crisis phrase is heard', async () => {
    replies = ['I want to kill myself'];
    const onSend = vi.fn();
    const onCrisis = vi.fn();
    render(<Harness onSend={onSend} onCrisis={onCrisis} />);
    await userEvent.click(screen.getByRole('button', { name: 'Start talking' }));
    await waitFor(() => expect(onCrisis).toHaveBeenCalledTimes(1));
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe('VoiceCheckup item 9', () => {
  const answering: VoiceState = { answers: EMPTY, wellness: { ...WELLNESS_START, mode: 'answering' } };
  const upToItemNine = () => [
    ...Array<string>(14).fill('skip'),
    'yes',
    ...Array<string>(8).fill('not at all'),
  ];

  it('reads item 9 aloud but never listens, and a risk answer opens the safety screen at once', async () => {
    replies = upToItemNine();
    const onItem9Risk = vi.fn();
    const onSend = vi.fn();
    render(<Harness onSend={onSend} onItem9Risk={onItem9Risk} wellnessOffered start={answering} />);
    await userEvent.click(screen.getByRole('button', { name: 'Start talking' }));
    await screen.findByText('Please tap your answer for this question.', {}, { timeout: 4000 });
    expect(spoken).toContain('q.phq9.9');
    expect(spoken).toContain('voice.wellness.tap');
    expect(replies).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Several days' }));
    expect(onItem9Risk).toHaveBeenCalledTimes(1);
    expect(spoken).not.toContain('q.gad7.1');
  });

  it('moves on without the safety screen when item 9 is not at all', async () => {
    replies = upToItemNine();
    const onItem9Risk = vi.fn();
    render(<Harness onSend={vi.fn()} onItem9Risk={onItem9Risk} wellnessOffered start={answering} />);
    await userEvent.click(screen.getByRole('button', { name: 'Start talking' }));
    await screen.findByText('Please tap your answer for this question.', {}, { timeout: 4000 });
    await userEvent.click(screen.getByRole('button', { name: 'Not at all' }));
    await waitFor(() => expect(spoken).toContain('q.gad7.1'));
    expect(onItem9Risk).not.toHaveBeenCalled();
  });
});

describe('buildSteps', () => {
  const answering = { answers: EMPTY, wellness: { ...WELLNESS_START, mode: 'answering' as const } };

  it('always keeps the self-harm question tap-only', () => {
    expect(buildSteps(answering, UNITS, true).find((s) => s.id === 'q.phq9.9')?.tapOnly).toBe(true);
    expect(buildSteps(answering, UNITS, true).filter((s) => s.tapOnly)).toHaveLength(1);
  });

  it('asks the mood questions only after the person agrees, and never after they stopped', () => {
    const intro = buildSteps({ answers: EMPTY, wellness: WELLNESS_START }, UNITS, true);
    expect(intro.at(-1)?.id).toBe('voice.wellness.ask');
    expect(buildSteps(answering, UNITS, true).filter((s) => s.id.startsWith('q.gad7.'))).toHaveLength(7);
    expect(buildSteps(answering, UNITS, false).some((s) => s.id.startsWith('q.phq9.'))).toBe(false);
    const stopped = { answers: EMPTY, wellness: { ...WELLNESS_START, mode: 'stopped' as const } };
    expect(buildSteps(stopped, UNITS, true).some((s) => s.id.startsWith('voice.wellness'))).toBe(false);
  });
});
