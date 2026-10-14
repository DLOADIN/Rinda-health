// This is where a facilitator's laptop collects check-ups from phones that have no internet. The camera reads the
// phone's looping QR codes; each finished package stays locked on the laptop until it can be uploaded. The laptop
// cannot open a package; only the server can.
import { HandoverEnvelope } from '@rinda/schemas';
import {
  Camera,
  CameraOff,
  CircleAlert,
  PackageX,
  CircleCheck,
  CloudUpload,
  LockKeyhole,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmAction } from '@/components/confirm-action';
import { useOnline } from '@/components/offline-badge';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { formatDate } from '@/lib/format';
import { createCollector, readInbox, saveInbox, type CollectProgress, type InboxItem } from '@/lib/handover';

type Detect = (canvas: HTMLCanvasElement) => Promise<string | null>;

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}

// Chrome and Edge have a built-in QR reader; other browsers use jsQR, loaded only here.
async function makeDetector(): Promise<Detect> {
  const Native = (
    window as unknown as {
      BarcodeDetector?: (new (o: { formats: string[] }) => BarcodeDetectorLike) & {
        getSupportedFormats?: () => Promise<string[]>;
      };
    }
  ).BarcodeDetector;
  // Some browsers have the reader but cannot use it for QR codes, so the supported formats are checked first.
  const formats = (await Native?.getSupportedFormats?.().catch(() => [])) ?? [];
  if (Native && formats.includes('qr_code')) {
    const detector = new Native({ formats: ['qr_code'] });
    return async (canvas) => (await detector.detect(canvas))[0]?.rawValue ?? null;
  }
  const { default: jsQR } = await import('jsqr');
  return async (canvas) => {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
  };
}

type Notice = 'received' | 'duplicate' | 'no-camera' | null;
interface Summary {
  saved: number;
  already: number;
  invalid: number;
}

export function CollectPage({ meId }: { meId: string }) {
  const { t } = useTranslation();
  const online = useOnline();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const collect = useRef(createCollector());
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<CollectProgress | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    let active = true;
    void readInbox(meId).then((items) => {
      if (active) setInbox(items);
    });
    return () => {
      active = false;
    };
  }, [meId]);

  // Loading the reader now means it is saved for later, so scanning still works if the internet drops.
  useEffect(() => {
    void makeDetector().catch(() => undefined);
  }, []);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setScanning(false);
  }, []);
  useEffect(() => stop, [stop]);

  const upload = useCallback(async () => {
    if (!navigator.onLine) return;
    setUploading(true);
    const total: Summary = { saved: 0, already: 0, invalid: 0 };
    let left = await readInbox(meId);
    for (const item of [...left]) {
      const res = await fetch('/api/v1/facilitator/handover', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: item.envelope,
      }).catch(() => null);
      if (!res) break;
      if (res.ok) {
        const r = (await res.json()) as Summary;
        total.saved += r.saved;
        total.already += r.already;
        total.invalid += r.invalid;
        left = left.filter((i) => i.id !== item.id);
      } else if (res.status === 400 || res.status === 403) {
        // Kept, not thrown away: the facilitator decides, and the phone still has its own copy.
        total.invalid++;
        left = left.map((i) => (i.id === item.id ? { ...i, undelivered: true } : i));
      } else break;
      await saveInbox(meId, left);
    }
    setInbox(left);
    setSummary(total);
    setUploading(false);
  }, [meId]);

  const discard = async (id: string) => {
    const left = (await readInbox(meId)).filter((i) => i.id !== id);
    await saveInbox(meId, left);
    setInbox(left);
  };

  const received = useCallback(
    async (text: string) => {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        return;
      }
      const envelope = HandoverEnvelope.safeParse(parsed);
      if (!envelope.success) return;
      const items = await readInbox(meId);
      if (items.some((i) => i.envelope === text)) {
        setNotice('duplicate');
      } else {
        const next = [
          ...items,
          { id: crypto.randomUUID(), ownerId: meId, envelope: text, scannedAt: new Date().toISOString() },
        ];
        await saveInbox(meId, next);
        setInbox(next);
        setNotice('received');
      }
      collect.current = createCollector();
      setProgress(null);
      if (navigator.onLine) void upload();
    },
    [meId, upload],
  );

  const start = async () => {
    setNotice(null);
    setSummary(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera');
      const media = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 } },
        audio: false,
      });
      stream.current = media;
      if (video.current) {
        video.current.srcObject = media;
        await video.current.play().catch(() => undefined);
      }
      setScanning(true);
    } catch {
      setNotice('no-camera');
    }
  };

  // While the camera is on, frames are read several times a second and the parts are collected.
  useEffect(() => {
    if (!scanning) return;
    let active = true;
    let busy = false;
    const canvas = document.createElement('canvas');
    let detect: Detect | null = null;
    void makeDetector().then((d) => {
      detect = d;
    });
    const timer = window.setInterval(() => {
      const v = video.current;
      if (!detect || busy || !v || v.readyState < 2 || !v.videoWidth) return;
      busy = true;
      const scale = Math.min(1, 960 / v.videoWidth);
      canvas.width = Math.round(v.videoWidth * scale);
      canvas.height = Math.round(v.videoHeight * scale);
      canvas.getContext('2d', { willReadFrequently: true })?.drawImage(v, 0, 0, canvas.width, canvas.height);
      void detect(canvas)
        .catch(() => null)
        .then((text) => {
          busy = false;
          if (!active || !text) return;
          const p = collect.current(text);
          if (!p) return;
          setProgress(p);
          if (p.complete) void received(p.complete);
        });
    }, 150);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [scanning, received]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('collect.title')} description={t('collect.intro')} />
      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-xl">{t('collect.scanTitle')}</CardTitle>
          <CardDescription className="flex items-start gap-2">
            <LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {t('collect.locked')}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className={scanning ? 'overflow-hidden rounded-2xl bg-muted' : 'hidden'}>
            <video ref={video} playsInline muted className="aspect-video w-full object-cover" />
          </div>
          {scanning ? (
            <div className="flex flex-col gap-2" aria-live="polite">
              <p className="text-sm">
                {progress
                  ? t('collect.progress', { have: progress.have, total: progress.total })
                  : t('collect.waitingPhone')}
              </p>
              <Progress value={progress ? (progress.have / progress.total) * 100 : 0} />
            </div>
          ) : null}
          {notice === 'received' || notice === 'duplicate' ? (
            <Alert>
              <CircleCheck aria-hidden="true" />
              <AlertDescription>{t(`collect.${notice}`)}</AlertDescription>
            </Alert>
          ) : null}
          {notice === 'no-camera' ? (
            <Alert>
              <CircleAlert aria-hidden="true" />
              <AlertDescription>{t('collect.noCamera')}</AlertDescription>
            </Alert>
          ) : null}
          {scanning ? (
            <Button variant="outline" className="self-start" onClick={stop}>
              <CameraOff aria-hidden="true" data-icon="inline-start" />
              {t('collect.stop')}
            </Button>
          ) : (
            <Button className="self-start" onClick={() => void start()}>
              <Camera aria-hidden="true" data-icon="inline-start" />
              {t('collect.start')}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t('collect.inboxTitle')}</CardTitle>
          <CardDescription>
            {inbox.length > 0 ? t('collect.inbox', { count: inbox.length }) : t('collect.empty')}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {inbox.length > 0 && !online ? (
            <p className="text-sm text-muted-foreground">{t('collect.offline')}</p>
          ) : null}
          {inbox.length > 0 ? (
            <Button className="self-start" disabled={!online || uploading} onClick={() => void upload()}>
              <CloudUpload aria-hidden="true" data-icon="inline-start" />
              {uploading ? t('collect.uploading') : t('collect.upload')}
            </Button>
          ) : null}
          {summary ? <p className="text-sm">{t('collect.result', { ...summary })}</p> : null}
          {inbox
            .filter((i) => i.undelivered)
            .map((i) => (
              <div key={i.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
                <PackageX aria-hidden="true" className="size-5 text-muted-foreground" />
                <p className="flex-1 text-sm">
                  {t('collect.undelivered', { date: formatDate(i.scannedAt, true) })}
                </p>
                <ConfirmAction
                  trigger={t('collect.discard')}
                  title={t('collect.discard')}
                  description={t('collect.discardConfirm')}
                  onConfirm={() => void discard(i.id)}
                />
              </div>
            ))}
        </CardContent>
      </Card>
    </div>
  );
}
