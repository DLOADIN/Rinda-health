import { HandoverPass } from '@rinda/schemas';
import { readSecret, saveSecret } from '@/lib/storage/vault';

export { createCollector, sealHandover, toFrames, type CollectProgress } from '@/lib/handover-seal';

const PASS = 'handover-pass';
export const INBOX = 'handover-inbox';

export async function refreshHandoverPass(userId: string): Promise<void> {
  if (!navigator.onLine) return;
  const res = await fetch('/api/v1/participant/handover-pass', { credentials: 'same-origin' }).catch(
    () => null,
  );
  if (!res?.ok) return;
  const pass = HandoverPass.safeParse(await res.json());
  if (pass.success) await saveSecret(PASS, { userId, ...pass.data });
}

export async function readHandoverPass(userId: string): Promise<HandoverPass | null> {
  const saved = await readSecret<HandoverPass & { userId: string }>(PASS).catch(() => null);
  return saved && saved.userId === userId
    ? { publicKey: saved.publicKey, kid: saved.kid, token: saved.token }
    : null;
}

export interface InboxItem {
  id: string;
  ownerId: string;
  envelope: string;
  scannedAt: string;
  undelivered?: boolean;
}

const KEEP_DAYS = 14;

async function readAll(): Promise<InboxItem[]> {
  const all = (await readSecret<InboxItem[]>(INBOX).catch(() => null)) ?? [];
  const oldest = Date.now() - KEEP_DAYS * 86_400_000;
  const fresh = all.filter((i) => Date.parse(i.scannedAt) >= oldest);
  if (fresh.length !== all.length) await saveSecret(INBOX, fresh);
  return fresh;
}

export async function readInbox(ownerId: string): Promise<InboxItem[]> {
  return (await readAll()).filter((i) => i.ownerId === ownerId);
}

export async function saveInbox(ownerId: string, items: InboxItem[]): Promise<void> {
  const others = (await readAll()).filter((i) => i.ownerId !== ownerId);
  await saveSecret(INBOX, [...others, ...items]);
}
