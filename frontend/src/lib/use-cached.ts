import { useEffect, useState } from 'react';
import { errorCode } from '@/lib/api';
import { readSecret, saveSecret } from '@/lib/storage/vault';

export function useCached<T>(
  key: string | null,
  data: T | undefined,
  error: unknown,
): { data: T | undefined; fromCache: boolean } {
  const [cached, setCached] = useState<T | undefined>(undefined);
  useEffect(() => {
    if (key && data !== undefined) void saveSecret(`cache:${key}`, data);
  }, [key, data]);
  useEffect(() => {
    if (key && data === undefined && error && errorCode(error) === 'OFFLINE') {
      void readSecret<T>(`cache:${key}`).then((v) => setCached(v ?? undefined));
    }
  }, [key, data, error]);
  return { data: data ?? cached, fromCache: data === undefined && cached !== undefined };
}
