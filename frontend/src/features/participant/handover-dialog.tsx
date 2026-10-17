// This is where a phone with no internet hands its waiting check-ups to the facilitator. It shows a short loop of
// QR codes for the facilitator's laptop camera. What the codes carry is locked so only Rinda's server can open it,
// and everything also stays on the phone and still sends itself when the internet comes back.
import { CircleAlert, LockKeyhole } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { readHandoverPass, sealHandover, toFrames } from '@/lib/handover';
import { pendingFor, pendingSafetyFor } from '@/lib/offline';

interface Props {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type State = { kind: 'working' } | { kind: 'no-pass' } | { kind: 'ready'; codes: string[] };

const CODE_LIFETIME_MS = 2 * 60_000;

async function prepare(userId: string): Promise<State> {
  const pass = await readHandoverPass(userId);
  if (!pass) return { kind: 'no-pass' };
  const checkups = pendingFor(userId).map((i) => ({ key: i.key, body: i.body }));
  const safetyEvents = await pendingSafetyFor(userId);
  const sealed = await sealHandover(
    { v: 1, userId, token: pass.token, createdAt: new Date().toISOString(), checkups, safetyEvents },
    pass.publicKey,
    pass.kid,
  );
  const QRCode = await import('qrcode');
  const codes = await Promise.all(
    toFrames(sealed).map(async (frame) => {
      const svg = await QRCode.toString(frame, { type: 'svg', margin: 2, errorCorrectionLevel: 'L' });
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    }),
  );
  return { kind: 'ready', codes };
}

export default function HandoverDialog({ userId, open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const [state, setState] = useState<State>({ kind: 'working' });
  const [index, setIndex] = useState(0);
  const [round, setRound] = useState(0);

  // A fresh code every two minutes: the package is sealed again with a new key, so an old photo of it is useless.
  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setRound((r) => r + 1), CODE_LIFETIME_MS);
    return () => window.clearInterval(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void prepare(userId)
      .catch((): State => ({ kind: 'no-pass' }))
      .then((next) => {
        if (active) setState(next);
      });
    return () => {
      active = false;
    };
  }, [open, userId, round]);

  // The codes take turns so the laptop can collect every part; the order does not matter.
  const total = state.kind === 'ready' ? state.codes.length : 0;
  useEffect(() => {
    if (total < 2) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % total), 900);
    return () => window.clearInterval(timer);
  }, [total]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('handover.title')}</DialogTitle>
          <DialogDescription>{t('handover.intro')}</DialogDescription>
        </DialogHeader>
        {state.kind === 'working' ? (
          <div className="grid place-items-center py-10">
            <Spinner />
          </div>
        ) : null}
        {state.kind === 'no-pass' ? (
          <Alert>
            <CircleAlert aria-hidden="true" />
            <AlertDescription>{t('handover.noPass')}</AlertDescription>
          </Alert>
        ) : null}
        {state.kind === 'ready' ? (
          <div className="flex flex-col items-center gap-3">
            <img
              src={state.codes[index % state.codes.length]}
              alt={t('handover.qrAlt')}
              className="aspect-square w-full max-w-80 rounded-2xl border bg-card p-2"
            />
            {state.codes.length > 1 ? (
              <p className="text-sm font-medium" aria-live="off">
                {t('handover.code', { n: (index % state.codes.length) + 1, total: state.codes.length })}
              </p>
            ) : null}
            <p className="text-sm text-muted-foreground">
              {state.codes.length > 1 ? t('handover.hold') : t('handover.still')}
            </p>
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {t('handover.locked')}
            </p>
            <p className="text-sm text-muted-foreground">{t('handover.refresh')}</p>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('handover.done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
