// This is the offline hand-over. With no internet at the venue, a study phone seals its waiting check-ups to the
// server's public key and shows them as a short loop of QR codes. The facilitator's laptop scans them and uploads
// the sealed package later. The laptop can carry it but cannot open it; only the server can.
import { HandoverPass } from '@rinda/schemas';
import { readSecret, saveSecret } from '@/lib/storage/vault';

export { createCollector, sealHandover, toFrames, type CollectProgress } from '@/lib/handover-seal';

const PASS = 'handover-pass';
export const INBOX = 'handover-inbox';

/** Fetched while online and kept encrypted on the phone, so a hand-over can be sealed later without internet. */
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

// The server only accepts hand-overs from the last 14 days of sessions, so older packages are let go.
const KEEP_DAYS = 14;

async function readAll(): Promise<InboxItem[]> {
  const all = (await readSecret<InboxItem[]>(INBOX).catch(() => null)) ?? [];
  const oldest = Date.now() - KEEP_DAYS * 86_400_000;
  const fresh = all.filter((i) => Date.parse(i.scannedAt) >= oldest);
  if (fresh.length !== all.length) await saveSecret(INBOX, fresh);
  return fresh;
}

/** Packages this facilitator scanned on this laptop, kept sealed until there is internet to upload them. */
export async function readInbox(ownerId: string): Promise<InboxItem[]> {
  return (await readAll()).filter((i) => i.ownerId === ownerId);
}

/** Replaces this facilitator's packages; anyone else's on a shared laptop are left alone. */
export async function saveInbox(ownerId: string, items: InboxItem[]): Promise<void> {
  const others = (await readAll()).filter((i) => i.ownerId !== ownerId);
  await saveSecret(INBOX, [...others, ...items]);
}
