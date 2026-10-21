// This is the camera helper for the blood pressure step. The picture is read on this device and then thrown away;
// nothing is saved or sent, and the person always checks the numbers before they are used.
import '@/features/participant/camera-strings';
import { Camera, CircleAlert, ImageUp, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from 'react';
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
import {
  agreeingReading,
  createPhotoVote,
  tapAttempts,
  readBpDisplay,
  readPhotoWindow,
  toGray,
  type BpReading,
  type PhotoWindow,
} from '@/lib/bp-reader';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUse: (reading: { systolic: number; diastolic: number }) => void;
}

type Stage = 'starting' | 'scanning' | 'tap' | 'reading' | 'no-camera' | 'not-read' | 'found';

// The frame on screen covers the middle of the picture; only that part is read.
const FRAME = { x: 0.12, y: 0.15, w: 0.76, h: 0.7 };

function readCanvas(
  canvas: HTMLCanvasElement,
  source: CanvasImageSource,
  sw: number,
  sh: number,
  crop = FRAME,
) {
  const w = Math.round(sw * crop.w);
  const h = Math.round(sh * crop.h);
  const scale = Math.min(1, 640 / Math.max(w, h));
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, sw * crop.x, sh * crop.y, w, h, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const reading = readBpDisplay(toGray(pixels.data, canvas.width, canvas.height));
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  return reading;
}

export default function BpCamera({ open, onOpenChange, onUse }: Props) {
  const { t } = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recent = useRef<BpReading[]>([]);
  const [stage, setStage] = useState<Stage>('starting');
  const [found, setFound] = useState<BpReading | null>(null);
  const [photo, setPhoto] = useState<{
    pixels: Uint8ClampedArray;
    w: number;
    h: number;
    preview: string;
  } | null>(null);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);

  const openCamera = useCallback(async (): Promise<boolean> => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera');
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      stream.current = media;
      if (video.current) {
        video.current.srcObject = media;
        await video.current.play().catch(() => undefined);
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void openCamera().then((ok) => {
      if (active) setStage(ok ? 'scanning' : 'no-camera');
    });
    return () => {
      active = false;
      stop();
    };
  }, [open, openCamera, stop]);

  // While scanning, a few frames a second are read; three that agree make a reading to check.
  useEffect(() => {
    if (stage !== 'scanning') return;
    const timer = window.setInterval(() => {
      const v = video.current;
      if (!v || v.readyState < 2 || !v.videoWidth) return;
      canvas.current ??= document.createElement('canvas');
      const r = readCanvas(canvas.current, v, v.videoWidth, v.videoHeight);
      if (!r) return;
      recent.current = [...recent.current.slice(-5), r];
      const agreed = agreeingReading(recent.current);
      if (agreed) {
        setFound(agreed);
        setStage('found');
        stop();
      }
    }, 350);
    return () => window.clearInterval(timer);
  }, [stage, stop]);

  const retry = () => {
    recent.current = [];
    setFound(null);
    setStage('starting');
    void openCamera().then((ok) => setStage(ok ? 'scanning' : 'no-camera'));
  };

  const readNow = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    canvas.current ??= document.createElement('canvas');
    const r = readCanvas(canvas.current, v, v.videoWidth, v.videoHeight);
    if (r) {
      setFound(r);
      setStage('found');
      stop();
    } else setStage('not-read');
  };

  const fromPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    stop();
    setStage('reading');
    const bitmap = await createImageBitmap(picked).catch(() => null);
    if (!bitmap) {
      setStage('not-read');
      return;
    }
    // The photo is kept only in memory while this dialog is open. The person then taps the monitor's screen in it.
    const scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    canvas.current ??= document.createElement('canvas');
    canvas.current.width = w;
    canvas.current.height = h;
    const ctx = canvas.current.getContext('2d', { willReadFrequently: true });
    ctx?.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const pixels = ctx?.getImageData(0, 0, w, h).data;
    const preview = canvas.current.toDataURL('image/jpeg', 0.85);
    ctx?.clearRect(0, 0, w, h);
    if (!pixels) {
      setStage('not-read');
      return;
    }
    setPhoto({ pixels, w, h, preview });
    setStage('tap');
  };

  // Reads around the spot the person tapped, pausing between attempts so the screen stays responsive.
  const readAtTap = async (e: MouseEvent<HTMLButtonElement>) => {
    if (!photo) return;
    const box = e.currentTarget.getBoundingClientRect();
    const cx = ((e.clientX - box.left) / box.width) * photo.w;
    const cy = ((e.clientY - box.top) / box.height) * photo.h;
    setStage('reading');
    const vote = createPhotoVote();
    const { straight, turned } = tapAttempts(photo.w, photo.h, cx, cy);
    const attempts: Array<readonly [PhotoWindow, number]> = straight.map((win) => [win, 0] as const);
    for (const [index, [win, angle]] of [...attempts, ...turned].entries()) {
      if (index === attempts.length && vote.result()) break;
      const r = readPhotoWindow(photo.pixels, photo.w, win, angle);
      if (r) vote.add(r);
      if (vote.settled()) break;
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
    const r = vote.result();
    if (r) {
      setFound(r);
      setStage('found');
    } else setStage('not-read');
  };

  const close = (next: boolean) => {
    if (!next) stop();
    onOpenChange(next);
  };

  const live = stage === 'starting' || stage === 'scanning';

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('checkup.camera.title')}</DialogTitle>
          <DialogDescription>{t('checkup.camera.intro')}</DialogDescription>
        </DialogHeader>

        <div className={live ? 'relative overflow-hidden rounded-2xl bg-muted' : 'hidden'}>
          {/* A live preview with no sound, so it has no captions to show. */}
          <video ref={video} playsInline muted className="aspect-[4/3] w-full object-cover" />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute rounded-xl border-4 border-primary"
            style={{
              left: `${FRAME.x * 100}%`,
              top: `${FRAME.y * 100}%`,
              width: `${FRAME.w * 100}%`,
              height: `${FRAME.h * 100}%`,
            }}
          />
          {stage === 'starting' ? (
            <div className="absolute inset-0 grid place-items-center">
              <Spinner />
            </div>
          ) : null}
        </div>
        {live ? (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {t('checkup.camera.hold')}
          </p>
        ) : null}

        {stage === 'tap' && photo ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium" aria-live="polite">
              {t('checkup.camera.tapScreen')}
            </p>
            <button
              type="button"
              onClick={(e) => void readAtTap(e)}
              aria-label={t('checkup.camera.tapScreen')}
              className="overflow-hidden rounded-2xl border outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <img src={photo.preview} alt="" className="block w-full cursor-crosshair" />
            </button>
          </div>
        ) : null}

        {stage === 'reading' ? (
          <div className="flex items-center gap-3 rounded-2xl border bg-card p-4" aria-live="polite">
            <Spinner />
            <p className="text-sm">{t('checkup.camera.readingPhoto')}</p>
          </div>
        ) : null}

        {stage === 'no-camera' || stage === 'not-read' ? (
          <Alert>
            <CircleAlert aria-hidden="true" />
            <AlertDescription>
              {stage === 'no-camera' ? t('checkup.camera.noCamera') : t('checkup.camera.notRead')}
            </AlertDescription>
          </Alert>
        ) : null}

        {stage === 'found' && found ? (
          <div
            className="flex flex-col items-center gap-2 rounded-2xl border bg-card p-4 text-center"
            aria-live="polite"
          >
            <p className="text-sm text-muted-foreground">{t('checkup.camera.found')}</p>
            <p className="text-4xl font-semibold tabular-nums">
              <span aria-hidden="true">
                {found.systolic} / {found.diastolic}
              </span>
              <span className="sr-only">
                {t('checkup.camera.reading', { sys: found.systolic, dia: found.diastolic })}
              </span>
              <span className="ml-2 text-base font-normal text-muted-foreground">
                {t('checkup.units.mmHg')}
              </span>
            </p>
            <p className="text-sm">{t('checkup.camera.check')}</p>
          </div>
        ) : null}

        <input
          ref={file}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => void fromPhoto(e)}
        />

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:flex-wrap">
          {stage === 'found' && found ? (
            <Button
              onClick={() => {
                onUse({ systolic: found.systolic, diastolic: found.diastolic });
                close(false);
              }}
            >
              {t('checkup.camera.use')}
            </Button>
          ) : null}
          {stage === 'scanning' ? (
            <Button onClick={readNow}>
              <Camera aria-hidden="true" data-icon="inline-start" />
              {t('checkup.camera.capture')}
            </Button>
          ) : null}
          {stage === 'found' || stage === 'not-read' || stage === 'no-camera' ? (
            <Button variant="outline" onClick={retry}>
              <RotateCcw aria-hidden="true" data-icon="inline-start" />
              {t('checkup.camera.retry')}
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => file.current?.click()}>
            <ImageUp aria-hidden="true" data-icon="inline-start" />
            {t('checkup.camera.photo')}
          </Button>
          <Button variant="ghost" onClick={() => close(false)}>
            {t('checkup.camera.type')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
