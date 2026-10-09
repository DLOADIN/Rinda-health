// Offline check-ups (FR-08, FR-29, FR-30): when the network is gone, the check-up is scored on the phone with the
// same @rinda/rules package, kept in an encrypted outbox with its Idempotency-Key, and sent later. The server
// re-scores it; retries never create a second record. Sending is tried on app start, when the network returns,
// when the app becomes visible again and when the person taps "Send now".
import { RULESET_V1 } from '@rinda/content';
import {
  assessSafety,
  isValue,
  planNextSteps,
  scoreAssessment,
  type Answer,
  type AssessmentInput,
  type Sex,
} from '@rinda/rules';
import type { CheckupSubmission, Me } from '@rinda/schemas';
import { useEffect, useSyncExternalStore } from 'react';
import type { Assessment } from '@/lib/api';
import { readSecret, removeSecret, saveSecret } from '@/lib/storage/vault';

export interface OutboxItem {
  key: string;
  userId: string;
  body: CheckupSubmission;
  provisional: Assessment;
}

const OUTBOX = 'outbox';
let pending: OutboxItem[] = [];
let status: 'idle' | 'sending' = 'idle';
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

async function load(): Promise<OutboxItem[]> {
  pending = (await readSecret<OutboxItem[]>(OUTBOX)) ?? [];
  notify();
  return pending;
}

async function save(items: OutboxItem[]) {
  pending = items;
  if (items.length) await saveSecret(OUTBOX, items);
  else await removeSecret(OUTBOX);
  notify();
}

/** Scores a check-up on the phone exactly as the server would (same package, same ruleset version). */
export function scoreOnPhone(body: CheckupSubmission, sex: Sex, key: string): Assessment {
  const a = body.answers;
  const ans = <T>(v: T | null | undefined): Answer<T> =>
    v === null || v === undefined ? { missing: 'SKIPPED' } : { value: v };
  const input: AssessmentInput = {
    sex,
    tobaccoUse: ans(a.tobaccoUse),
    auditC: [ans(a.auditC[0]), ans(a.auditC[1]), ans(a.auditC[2])],
    activity: { moderateMinutes: ans(a.moderateMinutes), vigorousMinutes: ans(a.vigorousMinutes) },
    diet: { servingsPerDay: ans(a.servingsPerDay), addsSaltAtTable: ans(a.addsSaltAtTable) },
    body: { heightCm: ans(a.heightCm), weightKg: ans(a.weightKg), waistCm: ans(a.waistCm) },
    bp: { systolic: ans(a.systolic), diastolic: ans(a.diastolic) },
    phq9: Array.from({ length: 9 }, () => ({ missing: 'MODULE_DECLINED' as const })),
    gad7: Array.from({ length: 7 }, () => ({ missing: 'MODULE_DECLINED' as const })),
  };
  const results = scoreAssessment(input, RULESET_V1);
  const v = (x: Answer<number>) => (isValue(x) ? x.value : null);
  return {
    id: `local-${key}`,
    createdAt: new Date().toISOString(),
    rulesetVersion: RULESET_V1.version,
    results,
    plan: planNextSteps(results, RULESET_V1),
    safety: assessSafety(input, results, RULESET_V1),
    values: {
      moderateMinutes: v(input.activity.moderateMinutes),
      vigorousMinutes: v(input.activity.vigorousMinutes),
      servingsPerDay: v(input.diet.servingsPerDay),
      heightCm: v(input.body.heightCm),
      weightKg: v(input.body.weightKg),
      waistCm: v(input.body.waistCm),
      systolic: v(input.bp.systolic),
      diastolic: v(input.bp.diastolic),
      auditC: null,
    },
    provisional: true,
  };
}

export async function addToOutbox(item: OutboxItem): Promise<void> {
  const items = await load();
  if (!items.some((i) => i.key === item.key)) await save([...items, item]);
}

/** Sends every waiting check-up that belongs to the signed-in person. Returns how many were sent. */
export async function flushOutbox(me: Pick<Me, 'id'>): Promise<number> {
  if (status === 'sending' || !navigator.onLine) return 0;
  status = 'sending';
  notify();
  let sent = 0;
  try {
    for (const item of await load()) {
      if (item.userId !== me.id) continue; // on a shared phone, never send under someone else's account
      const res = await fetch('/api/v1/participant/assessments', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'idempotency-key': item.key },
        body: JSON.stringify(item.body),
      }).catch(() => null);
      if (!res) break; // still offline: stop and try again later
      if (res.ok || res.status === 409 || res.status === 400) {
        await save(pending.filter((i) => i.key !== item.key));
        if (res.ok) sent++;
      }
    }
  } finally {
    status = 'idle';
    notify();
  }
  return sent;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => `${status}:${pending.length}`;

/** Number of check-ups waiting on this phone and whether they are being sent now. */
export function useOutbox(): { count: number; sending: boolean } {
  const value = useSyncExternalStore(subscribe, snapshot, snapshot);
  const [s, n] = value.split(':');
  return { count: Number(n), sending: s === 'sending' };
}

export function pendingFor(userId: string): OutboxItem[] {
  return pending.filter((i) => i.userId === userId);
}

/** Tries to send waiting check-ups on start, when the network returns and when the app is visible again. */
export function useOutboxSync(me: Pick<Me, 'id'> | undefined, onSent: () => void) {
  useEffect(() => {
    if (!me) return;
    const run = () => void flushOutbox(me).then((n) => (n > 0 ? onSent() : undefined));
    void load().then(run);
    const onVisible = () => {
      if (document.visibilityState === 'visible') run();
    };
    window.addEventListener('online', run);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', run);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [me, onSent]);
}
