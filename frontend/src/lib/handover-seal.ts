// This is the pure part of the offline hand-over: sealing a package to the server's key and splitting it into QR
// frames, then putting frames back together. It has no storage, so the server's tests can use the very same code.
import type { HandoverEnvelope, HandoverPayload } from '@rinda/schemas';

const PREFIX = 'RH1';
const CHUNK = 480;

export const b64url = (bytes: ArrayBuffer | Uint8Array) => {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
export const fromB64url = (text: string) => {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function gzip(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer> | null> {
  if (typeof CompressionStream === 'undefined') return null;
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Seals the payload: a fresh ECDH P-256 key with the server's key, HKDF-SHA-256, then AES-256-GCM. */
export async function sealHandover(
  payload: HandoverPayload,
  publicKey: string,
  kid: string,
): Promise<HandoverEnvelope> {
  const server = await crypto.subtle.importKey(
    'raw',
    fromB64url(publicKey),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const mine = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: server }, mine.privateKey, 256);
  const hkdf = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: new TextEncoder().encode('rinda-handover-v1'),
    },
    hkdf,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const plain = new TextEncoder().encode(JSON.stringify(payload));
  const zipped = await gzip(plain).catch(() => null);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, zipped ?? plain);
  return {
    v: 1,
    kid,
    epk: b64url(await crypto.subtle.exportKey('raw', mine.publicKey)),
    iv: b64url(iv),
    ct: b64url(ct),
    gz: zipped !== null,
  };
}

/** Splits a sealed package into QR-sized frames: RH1:<id>:<index>:<count>:<part>. */
export function toFrames(envelope: HandoverEnvelope): string[] {
  const text = JSON.stringify(envelope);
  const id = b64url(crypto.getRandomValues(new Uint8Array(4)));
  const count = Math.max(1, Math.ceil(text.length / CHUNK));
  return Array.from(
    { length: count },
    (_, i) => `${PREFIX}:${id}:${i}:${count}:${text.slice(i * CHUNK, (i + 1) * CHUNK)}`,
  );
}

export interface CollectProgress {
  id: string;
  have: number;
  total: number;
  complete: string | null;
}

/** Puts frames back together on the laptop, in any order and with repeats, until a package is complete. */
export function createCollector() {
  const parts = new Map<string, { total: number; got: Map<number, string> }>();
  return (frame: string): CollectProgress | null => {
    const m = /^RH1:([A-Za-z0-9_-]{4,12}):(\d{1,3}):(\d{1,3}):([\s\S]*)$/.exec(frame);
    if (!m) return null;
    const [, id = '', index, count, part = ''] = m;
    const total = Number(count);
    const i = Number(index);
    if (!total || total > 200 || i >= total) return null;
    // Only the last few phones are remembered, so a long scanning session does not keep growing.
    if (!parts.has(id) && parts.size >= 4) parts.delete(parts.keys().next().value ?? '');
    const entry = parts.get(id) ?? { total, got: new Map<number, string>() };
    if (entry.total !== total) return null;
    entry.got.set(i, part);
    parts.set(id, entry);
    const complete =
      entry.got.size === total
        ? Array.from({ length: total }, (_, k) => entry.got.get(k) ?? '').join('')
        : null;
    return { id, have: entry.got.size, total, complete };
  };
}
