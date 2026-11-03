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

// This is where one answer is heard. Browsers stop listening after a short pause or a
// moment of silence, so a fresh listener is started until the time runs out, and words
// heard so far are kept even if the browser never marks them as final.
export function listen(timeoutMs = 12000): { heard: Promise<string[]>; stop: () => void } {
  const Klass = recognitionClass();
  if (!Klass) return { heard: Promise.resolve([]), stop: () => undefined };
  const deadline = Date.now() + timeoutMs;
  let current: Recognition | null = null;
  let finish: (texts: string[]) => void = () => undefined;
  const heard = new Promise<string[]>((resolve) => {
    let done = false;
    let partial: string[] = [];
    let fatal = false;
    const timer = setTimeout(() => finish(partial), timeoutMs);
    finish = (texts: string[]) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        current?.abort();
      } catch {
        // Already stopped.
      }
      resolve(texts.map((x) => x.trim()).filter(Boolean));
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
        const texts: string[] = [];
        for (let i = 0; i < last.length; i++) texts.push(last[i]?.transcript ?? '');
        if (last.isFinal) finish(texts);
        else partial = texts;
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
        if (partial.some(Boolean)) return finish(partial);
        if (fatal || Date.now() > deadline - 800) return finish([]);
        setTimeout(startOne, 250);
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
