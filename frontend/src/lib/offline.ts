// This is where the app keeps working without internet: check-ups are scored on the phone, saved encrypted
// and sent when the network comes back.
import { RULESET_V1 } from '@rinda/content';
import {
  assessSafety,
  isValue,
  planNextSteps,
  scoreAssessment,
  wellnessInput,
  type Answer,
  type AssessmentInput,
  type Sex,
} from '@rinda/rules';
import type { CheckupSubmission, Me, SafetyEvent } from '@rinda/schemas';
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
    ...wellnessInput(a.wellness, RULESET_V1),
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

const SAFETY_OUTBOX = 'safety-outbox';
const SAFETY_OUTBOX_MAX_DAYS = 7;

interface QueuedSafetyEvent {
  userId: string;
  event: SafetyEvent;
}

let safetyChain: Promise<unknown> = Promise.resolve();
const serial = <T>(task: () => Promise<T>): Promise<T> => {
  const next = safetyChain.then(task, task);
  safetyChain = next.catch(() => undefined);
  return next;
};

function flushSafetyEvents(userId: string): Promise<void> {
  return serial(async () => {
    const oldest = Date.now() - SAFETY_OUTBOX_MAX_DAYS * 86_400_000;
    const waiting = ((await readSecret<QueuedSafetyEvent[]>(SAFETY_OUTBOX)) ?? []).filter(
      (i) => Date.parse(i.event.occurredAt) >= oldest,
    );
    const sent = new Set<string>();
    for (const item of waiting) {
      if (item.userId !== userId) continue;
      const res = await fetch('/api/v1/participant/safety-events', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(item.event),
      }).catch(() => null);
      if (!res) break;
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 401)) sent.add(item.event.id);
    }
    const left = waiting.filter((i) => !sent.has(i.event.id));
    if (left.length) await saveSecret(SAFETY_OUTBOX, left);
    else await removeSecret(SAFETY_OUTBOX);
  });
}

/** The item 9 events still waiting on this phone for this person, for an offline hand-over. */
export async function pendingSafetyFor(userId: string): Promise<SafetyEvent[]> {
  const waiting = (await readSecret<QueuedSafetyEvent[]>(SAFETY_OUTBOX)) ?? [];
  return waiting.filter((i) => i.userId === userId).map((i) => i.event);
}

// By the time this runs the safety screen is already showing. The event is saved encrypted and sent once.
export async function queueSafetyEvent(userId: string, eventId: string): Promise<void> {
  const event: SafetyEvent = {
    id: eventId,
    tier: 2,
    triggerType: 'item9',
    actions: ['safety_screen_shown', 'referral_list_shown'],
    occurredAt: new Date().toISOString(),
    recordedByRole: 'system',
  };
  await serial(async () => {
    const waiting = (await readSecret<QueuedSafetyEvent[]>(SAFETY_OUTBOX)) ?? [];
    if (!waiting.some((i) => i.event.id === eventId)) {
      await saveSecret(SAFETY_OUTBOX, [...waiting, { userId, event }]);
    }
  });
  if (navigator.onLine) await flushSafetyEvents(userId);
}

export async function flushOutbox(me: Pick<Me, 'id'>): Promise<number> {
  if (status === 'sending' || !navigator.onLine) return 0;
  await flushSafetyEvents(me.id).catch(() => undefined);
  status = 'sending';
  notify();
  let sent = 0;
  try {
    for (const item of await load()) {
      if (item.userId !== me.id) continue;
      const res = await fetch('/api/v1/participant/assessments', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'idempotency-key': item.key },
        body: JSON.stringify(item.body),
      }).catch(() => null);
      if (!res) break;
      if (res.ok || res.status === 409 || res.status === 400 || res.status === 403) {
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

export function useOutbox(): { count: number; sending: boolean } {
  const value = useSyncExternalStore(subscribe, snapshot, snapshot);
  const [s, n] = value.split(':');
  return { count: Number(n), sending: s === 'sending' };
}

export function pendingFor(userId: string): OutboxItem[] {
  return pending.filter((i) => i.userId === userId);
}

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
