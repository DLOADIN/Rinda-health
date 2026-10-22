// This is the camera helper for the blood pressure step. The picture is read on this device and then thrown away;
// nothing is saved or sent, and the person always checks the numbers before they are used.
import '@/features/participant/camera-strings';
import { Camera, CircleAlert, ImageUp, RotateCcw, SquareDashedMousePointer } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type PointerEvent } from 'react';
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
import { readRowOcr, warmUpOcr } from '@/lib/bp-ocr';
import { boxToGray, readBpInBox } from '@/lib/bp-photo';
import { agreeingReading, readBpDisplay, toGray, type BpReading } from '@/lib/bp-reader';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUse: (reading: { systolic: number; diastolic: number }) => void;
}

type Stage = 'starting' | 'scanning' | 'box' | 'reading' | 'no-camera' | 'not-read' | 'no-numbers' | 'found';

/** A box on the photo, with corners as fractions of its width and height. */
interface PhotoBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));

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
  const [drag, setDrag] = useState<PhotoBox | null>(null);
  const dragging = useRef(false);

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
      // A photo picked while the camera was still starting keeps the screen; only a waiting screen changes.
      if (active) setStage((s) => (s === 'starting' ? (ok ? 'scanning' : 'no-camera') : s));
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
    void openCamera().then((ok) => setStage((s) => (s === 'starting' ? (ok ? 'scanning' : 'no-camera') : s)));
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
    warmUpOcr();
    const bitmap = await createImageBitmap(picked).catch(() => null);
    if (!bitmap) {
      setStage('not-read');
      return;
    }
    // The photo is kept only in memory while this dialog is open. The person then boxes the numbers in it.
    const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
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
    setDrag(null);
    setStage('box');
  };

  const point = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
  };

  // The person drags a box around the numbers; a plain tap makes a box around the spot tapped.
  const readBox = async (box: PhotoBox) => {
    if (!photo) return;
    const tapped = Math.abs(box.x1 - box.x0) < 0.04 && Math.abs(box.y1 - box.y0) < 0.04;
    const used = tapped
      ? {
          x0: clamp(box.x0 - 0.18),
          y0: clamp(box.y0 - 0.16),
          x1: clamp(box.x0 + 0.18),
          y1: clamp(box.y0 + 0.16),
        }
      : box;
    setDrag(used);
    setStage('reading');
    // Lets the spinner show before the reading starts.
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    const r = await readBpInBox(boxToGray(photo.pixels, photo.w, photo.h, used), {
      ocr: readRowOcr,
      deadline: 8000,
    }).catch(() => null);
    if (r) {
      setFound(r);
      setStage('found');
    } else setStage('no-numbers');
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

        {(stage === 'box' || stage === 'reading' || stage === 'no-numbers') && photo ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium" aria-live="polite">
              {t('checkup.camera.boxScreen')}
            </p>
            <div
              role="img"
              aria-label={t('checkup.camera.boxScreen')}
              className={
                stage === 'box'
                  ? 'relative cursor-crosshair touch-none overflow-hidden rounded-2xl border select-none'
                  : 'relative overflow-hidden rounded-2xl border select-none'
              }
              onPointerDown={(e) => {
                if (stage !== 'box') return;
                e.currentTarget.setPointerCapture(e.pointerId);
                dragging.current = true;
                const p = point(e);
                setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
              }}
              onPointerMove={(e) => {
                if (!dragging.current) return;
                const p = point(e);
                setDrag((d) => (d ? { ...d, x1: p.x, y1: p.y } : d));
              }}
              onPointerUp={(e) => {
                if (!dragging.current || !drag) return;
                dragging.current = false;
                const p = point(e);
                void readBox({ ...drag, x1: p.x, y1: p.y });
              }}
            >
              <img src={photo.preview} alt="" draggable={false} className="block w-full" />
              {drag ? (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute rounded-md border-4 border-primary"
                  style={{
                    left: `${Math.min(drag.x0, drag.x1) * 100}%`,
                    top: `${Math.min(drag.y0, drag.y1) * 100}%`,
                    width: `${Math.abs(drag.x1 - drag.x0) * 100}%`,
                    height: `${Math.abs(drag.y1 - drag.y0) * 100}%`,
                  }}
                />
              ) : null}
            </div>
          </div>
        ) : null}

        {stage === 'reading' ? (
          <div className="flex items-center gap-3 rounded-2xl border bg-card p-4" aria-live="polite">
            <Spinner />
            <p className="text-sm">{t('checkup.camera.readingPhoto')}</p>
          </div>
        ) : null}

        {stage === 'no-camera' || stage === 'not-read' || stage === 'no-numbers' ? (
          <Alert>
            <CircleAlert aria-hidden="true" />
            <AlertDescription>
              {stage === 'no-camera'
                ? t('checkup.camera.noCamera')
                : stage === 'no-numbers'
                  ? t('checkup.camera.noNumbers')
                  : t('checkup.camera.notRead')}
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
          {stage === 'no-numbers' ? (
            <Button
              onClick={() => {
                setDrag(null);
                setStage('box');
              }}
            >
              <SquareDashedMousePointer aria-hidden="true" data-icon="inline-start" />
              {t('checkup.camera.drawAgain')}
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
