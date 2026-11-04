interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionEvent {
  results: ArrayLike<ArrayLike<RecognitionAlternative> & { isFinal?: boolean }>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event?: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
}
interface RecognitionClass {
  new (): Recognition;
}

const LANG = 'en-US';
const clips = new Map<string, string>();
let playing: HTMLAudioElement | null = null;
let serverVoice: Promise<boolean> | null = null;

function recognitionClass(): RecognitionClass | null {
  const scope = globalThis as {
    SpeechRecognition?: RecognitionClass;
    webkitSpeechRecognition?: RecognitionClass;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export function canListen(): boolean {
  return recognitionClass() !== null;
}

function hasServerVoice(): Promise<boolean> {
  serverVoice ??= fetch('/api/v1/voice', { credentials: 'same-origin' })
    .then(async (r) => (r.ok ? ((await r.json()) as { available: boolean }).available : false))
    .catch(() => false);
  return serverVoice;
}

function playUrl(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    playing = audio;
    audio.onended = () => resolve(true);
    audio.onerror = () => resolve(false);
    audio.play().catch(() => resolve(false));
  });
}

function speakInBrowser(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in globalThis)) return resolve();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-GB';
    utterance.rate = 0.95;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  });
}

async function clip(id: string): Promise<string | null> {
  const cached = clips.get(id);
  if (cached) return cached;
  const res = await fetch(`/api/v1/voice/speech?id=${encodeURIComponent(id)}&language=en`, {
    credentials: 'same-origin',
  }).catch(() => null);
  if (!res?.ok) return null;
  const url = URL.createObjectURL(await res.blob());
  clips.set(id, url);
  return url;
}

export async function prefetch(ids: readonly string[]): Promise<void> {
  if (!(await hasServerVoice())) return;
  for (const id of ids) await clip(id);
}

export async function speak(id: string, text: string): Promise<void> {
  if (await hasServerVoice()) {
    const url = await clip(id);
    if (url && (await playUrl(url))) return;
  }
  await speakInBrowser(text);
}

export function stopSpeaking(): void {
  playing?.pause();
  playing = null;
  if ('speechSynthesis' in globalThis) speechSynthesis.cancel();
}

let blocked = false;

// True when the browser refused the microphone, so asking again will not help.
export function micBlocked(): boolean {
  return blocked;
}

export interface ListenOptions {
  timeoutMs?: number;
  // Says whether the words heard so far already make a full answer, so listening can stop early.
  complete?: (texts: string[]) => boolean;
}

// This is where one answer is heard. Browsers end a listening session at the first short
// pause, so "um... about thirty minutes" arrives in pieces. The pieces are joined and a new
// session is started after each pause, until the words make a full answer, the person has
// been quiet for a moment after speaking, or the time runs out.
export function listen(options: ListenOptions = {}): { heard: Promise<string[]>; stop: () => void } {
  const Klass = recognitionClass();
  if (!Klass) return { heard: Promise.resolve([]), stop: () => undefined };
  const timeoutMs = options.timeoutMs ?? 15000;
  const deadline = Date.now() + timeoutMs;
  let current: Recognition | null = null;
  let finish: (texts: string[]) => void = () => undefined;
  const heard = new Promise<string[]>((resolve) => {
    let done = false;
    const pieces: string[][] = [];
    let partial = '';
    let fatal = false;
    let quiet: ReturnType<typeof setTimeout> | undefined;
    const sofar = (): string[] => {
      const before = pieces
        .slice(0, -1)
        .map((alts) => alts[0] ?? '')
        .join(' ');
      const last = pieces.at(-1) ?? [''];
      const whole = last.map((alt) => `${before} ${alt} ${partial}`.replace(/\s+/g, ' ').trim());
      // The latest piece on its own too, in case the first piece was only "um" or a cough.
      const latest = last.map((alt) => `${alt} ${partial}`.trim());
      return [...new Set([...whole, ...latest])].filter(Boolean);
    };
    const timer = setTimeout(() => finish(sofar()), timeoutMs);
    finish = (texts: string[]) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (quiet) clearTimeout(quiet);
      try {
        current?.abort();
      } catch {
        // Already stopped.
      }
      resolve(texts.map((x) => x.trim()).filter(Boolean));
    };
    const waitForQuiet = (ms: number) => {
      if (quiet) clearTimeout(quiet);
      quiet = setTimeout(() => finish(sofar()), ms);
    };
    const startOne = () => {
      if (done) return;
      const recognition = new Klass();
      current = recognition;
      recognition.lang = LANG;
      recognition.interimResults = true;
      recognition.maxAlternatives = 3;
      recognition.continuous = false;
      recognition.onresult = (event) => {
        const last = event.results[event.results.length - 1];
        if (!last) return;
        const alts: string[] = [];
        for (let i = 0; i < last.length; i++) alts.push((last[i]?.transcript ?? '').trim());
        if (last.isFinal) {
          if (alts.some(Boolean)) pieces.push(alts);
          partial = '';
          // A full answer still gets a moment for "...three times a week" to follow.
          waitForQuiet(options.complete?.(sofar()) ? 1200 : 2200);
        } else {
          partial = alts[0] ?? '';
          // Still talking: wait a little longer before deciding they have finished.
          waitForQuiet(3000);
        }
      };
      recognition.onerror = (event) => {
        const error = event?.error ?? '';
        if (error === 'not-allowed' || error === 'service-not-allowed' || error === 'audio-capture') {
          blocked = true;
          fatal = true;
        }
      };
      recognition.onend = () => {
        if (done) return;
        // Words the browser never marked as final are kept as their own piece.
        if (partial) {
          pieces.push([partial]);
          partial = '';
          waitForQuiet(options.complete?.(sofar()) ? 1200 : 2200);
        }
        if (fatal || Date.now() > deadline - 800) return finish(sofar());
        // Keep listening for the rest of the answer.
        setTimeout(startOne, 150);
      };
      try {
        recognition.start();
        blocked = false;
      } catch {
        // The previous listener may still be closing; try again in a moment.
        if (Date.now() < deadline - 800) setTimeout(startOne, 300);
        else finish([]);
      }
    };
    // A short pause first, so the microphone does not pick up the end of Rinda's own voice.
    setTimeout(startOne, 300);
  });
  return { heard, stop: () => finish([]) };
}
