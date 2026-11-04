import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listen, micBlocked } from '@/lib/voice';

// A stand-in for the browser's speech recognition. Each listening session plays one script:
// the words it "hears", then the end of the session, the way Chrome ends at the first pause.
type Script = (r: FakeRecognition) => void;
const sessions: Script[] = [];

class FakeRecognition {
  lang = '';
  interimResults = false;
  maxAlternatives = 1;
  continuous = false;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event?: { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start() {
    const script = sessions.shift();
    // With nothing said, Chrome ends the session after about five seconds.
    setTimeout(() => (script ? script(this) : this.end()), script ? 50 : 5000);
  }
  abort() {
    this.onresult = null;
  }
  final(...alts: string[]) {
    this.onresult?.({
      results: [
        Object.assign(
          alts.map((transcript) => ({ transcript })),
          { isFinal: true },
        ),
      ],
    });
  }
  interim(text: string) {
    this.onresult?.({ results: [Object.assign([{ transcript: text }], { isFinal: false })] });
  }
  end() {
    this.onend?.();
  }
}

const isMinutes = (texts: string[]) =>
  texts.some((t) => /\d|thirty|hour|minute/.test(t) && /minute|hour/.test(t));

beforeEach(() => {
  vi.useFakeTimers();
  sessions.length = 0;
  (globalThis as { SpeechRecognition?: unknown }).SpeechRecognition = FakeRecognition;
});
afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as { SpeechRecognition?: unknown }).SpeechRecognition;
});

describe('listen', () => {
  it('joins an answer said with a pause in the middle', async () => {
    sessions.push(
      (r) => {
        r.final('um');
        r.end();
      },
      (r) => {
        r.final('about thirty minutes');
        r.end();
      },
    );
    const attempt = listen({ complete: isMinutes });
    await vi.advanceTimersByTimeAsync(2000);
    expect(await attempt.heard).toContain('um about thirty minutes');
  });

  it('stops soon after a full answer is heard', async () => {
    sessions.push((r) => {
      r.final('yes', 'yes please');
      r.end();
    });
    const attempt = listen({ complete: (t) => t.some((x) => x.startsWith('yes')) });
    await vi.advanceTimersByTimeAsync(1700);
    expect(await attempt.heard).toEqual(['yes', 'yes please']);
  });

  it('keeps the rest of an answer that is already complete after its first part', async () => {
    sessions.push(
      (r) => {
        r.final('an hour');
        r.end();
      },
      (r) => {
        r.final('three times a week');
        r.end();
      },
    );
    const attempt = listen({ complete: isMinutes });
    await vi.advanceTimersByTimeAsync(3000);
    expect(await attempt.heard).toContain('an hour three times a week');
  });

  it('waits a moment after a bare number in case the unit follows', async () => {
    sessions.push(
      (r) => {
        r.final('two');
        r.end();
      },
      (r) => {
        r.final('hours');
        r.end();
      },
    );
    const attempt = listen({ complete: isMinutes });
    await vi.advanceTimersByTimeAsync(2500);
    expect(await attempt.heard).toContain('two hours');
  });

  it('gives the number back after a short quiet when nothing follows', async () => {
    sessions.push((r) => {
      r.final('one hundred and fifty');
      r.end();
    });
    const attempt = listen({ complete: () => false });
    await vi.advanceTimersByTimeAsync(3000);
    expect(await attempt.heard).toContain('one hundred and fifty');
  });

  it('keeps words the browser never marked as final', async () => {
    sessions.push((r) => {
      r.interim('thirty minutes a day');
      r.end();
    });
    const attempt = listen({ complete: isMinutes });
    await vi.advanceTimersByTimeAsync(2500);
    expect(await attempt.heard).toContain('thirty minutes a day');
  });

  it('keeps listening through silence until someone speaks', async () => {
    sessions.push((r) => {
      r.final('an hour every day');
      r.end();
    });
    // The first session hears the answer only after the person thinks for a while.
    sessions.unshift((r) => setTimeout(() => r.end(), 5000));
    const attempt = listen({ complete: isMinutes });
    await vi.advanceTimersByTimeAsync(7000);
    expect(await attempt.heard).toContain('an hour every day');
  });

  it('gives nothing back when nobody speaks before the time runs out', async () => {
    const attempt = listen({ complete: () => false, timeoutMs: 12000 });
    await vi.advanceTimersByTimeAsync(13000);
    expect(await attempt.heard).toEqual([]);
  });

  it('reports a blocked microphone', async () => {
    sessions.push((r) => {
      r.onerror?.({ error: 'not-allowed' });
      r.end();
    });
    const attempt = listen({ complete: () => false });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await attempt.heard).toEqual([]);
    expect(micBlocked()).toBe(true);
  });
});
