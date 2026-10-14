// This is the encrypted storage on the phone. The key never leaves the browser and cannot be exported.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

interface RindaDB extends DBSchema {
  key: { key: string; value: CryptoKey };
  vault: { key: string; value: { iv: Uint8Array<ArrayBuffer>; ciphertext: ArrayBuffer; savedAt: string } };
}

let dbPromise: Promise<IDBPDatabase<RindaDB>> | null = null;
const db = () => {
  dbPromise ??= openDB<RindaDB>('rinda', 1, {
    upgrade(database) {
      database.createObjectStore('key');
      database.createObjectStore('vault');
    },
  });
  return dbPromise;
};

export const vaultAvailable = () => typeof indexedDB !== 'undefined' && Boolean(globalThis.crypto?.subtle);

async function deviceKey(): Promise<CryptoKey> {
  const database = await db();
  const existing = await database.get('key', 'device');
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  await database.put('key', key, 'device');
  return key;
}

export async function saveSecret<T>(id: string, value: T): Promise<void> {
  if (!vaultAvailable()) return;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await deviceKey(), plaintext);
  await (await db()).put('vault', { iv, ciphertext, savedAt: new Date().toISOString() }, id);
}

export async function readSecret<T>(id: string): Promise<T | null> {
  if (!vaultAvailable()) return null;
  const database = await db();
  const record = await database.get('vault', id);
  const key = await database.get('key', 'device');
  if (!record || !key) return null;
  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: record.iv }, key, record.ciphertext);
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch {
    return null;
  }
}

export async function removeSecret(id: string): Promise<void> {
  if (!vaultAvailable()) return;
  await (await db()).delete('vault', id);
}

export async function clearPersonalCache(
  keep: readonly string[] = ['outbox', 'safety-outbox', 'handover-inbox'],
): Promise<void> {
  if (!vaultAvailable()) return;
  const database = await db();
  for (const id of await database.getAllKeys('vault'))
    if (!keep.includes(id)) await database.delete('vault', id);
}
