// This runs only on study phones set up from a facilitator's QR code. Every 15 seconds it asks whether the session
// has ended; when it has, it sends anything still waiting, then clears the phone and shows the neutral screen.
import { flushOutbox } from '@/lib/offline';
import { clearPersonalCache, readSecret, saveSecret } from '@/lib/storage/vault';

const KEY = 'study-device';
let timer: ReturnType<typeof setInterval> | undefined;

async function wipePhone(token: string) {
  const me = await fetch('/api/v1/me', { credentials: 'same-origin' }).catch(() => null);
  if (me?.ok) {
    const { id } = (await me.json()) as { id: string };
    await flushOutbox({ id }).catch(() => 0);
  }
  await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => null);
  await clearPersonalCache([]);
  await fetch('/api/v1/devices/wiped', { method: 'POST', headers: { 'x-device-token': token } }).catch(
    () => null,
  );
  window.location.replace('/login');
}

function watch(token: string) {
  if (timer) clearInterval(timer);
  const check = async () => {
    if (!navigator.onLine) return;
    const res = await fetch('/api/v1/devices/status', { headers: { 'x-device-token': token } }).catch(
      () => null,
    );
    if (!res?.ok) return;
    const { wipe } = (await res.json()) as { wipe: boolean };
    if (wipe) {
      if (timer) clearInterval(timer);
      await wipePhone(token);
    }
  };
  void check();
  timer = setInterval(() => void check(), 15_000);
}

export async function rememberStudyDevice(token: string) {
  await saveSecret(KEY, { token });
  watch(token);
}

export async function resumeStudyDevice() {
  const saved = await readSecret<{ token: string }>(KEY).catch(() => null);
  if (saved?.token) watch(saved.token);
}
