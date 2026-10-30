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
  onerror: (() => void) | null;
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

export function listen(timeoutMs = 9000): { heard: Promise<string[]>; stop: () => void } {
  const Klass = recognitionClass();
  if (!Klass) return { heard: Promise.resolve([]), stop: () => undefined };
  const recognition = new Klass();
  recognition.lang = LANG;
  recognition.interimResults = false;
  recognition.maxAlternatives = 3;
  recognition.continuous = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const heard = new Promise<string[]>((resolve) => {
    let done = false;
    const finish = (texts: string[]) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      resolve(texts);
    };
    recognition.onresult = (event) => {
      const first = event.results[0];
      const texts: string[] = [];
      if (first) for (let i = 0; i < first.length; i++) texts.push(first[i]?.transcript ?? '');
      finish(texts.filter(Boolean));
    };
    recognition.onerror = () => finish([]);
    recognition.onend = () => finish([]);
    timer = setTimeout(() => {
      recognition.abort();
      finish([]);
    }, timeoutMs);
    try {
      recognition.start();
    } catch {
      finish([]);
    }
  });
  return { heard, stop: () => recognition.abort() };
}
