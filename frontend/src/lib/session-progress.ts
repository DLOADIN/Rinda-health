// This tells the facilitator's live console which study step the participant is on, while a session is open.
// It sends the step name only, never answers, and quietly does nothing when there is no session or no internet.
import type { TASK_CODES } from '@rinda/schemas';

type Step = (typeof TASK_CODES)[number];

let enabled = false;
let current: Step | null = null;
let tracking = false;
let timer: ReturnType<typeof setTimeout> | undefined;

async function send(step: Step) {
  const res = await fetch('/api/v1/participant/session-progress', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ step }),
  }).catch(() => null);
  tracking = res?.status === 200;
  schedule();
}

function schedule() {
  if (timer) clearTimeout(timer);
  if (!enabled) return;
  // A heartbeat every 20 s while a session is open; otherwise check once a minute in case one starts.
  timer = setTimeout(
    () => {
      if (current && navigator.onLine) void send(current);
      else schedule();
    },
    tracking ? 20_000 : 60_000,
  );
}

export function enableSessionProgress(on: boolean) {
  enabled = on;
  if (!on) {
    if (timer) clearTimeout(timer);
    current = null;
    tracking = false;
  }
}

export function reportStep(step: Step) {
  if (!enabled || step === current) return;
  current = step;
  if (navigator.onLine) void send(step);
  else schedule();
}
