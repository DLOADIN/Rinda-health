// This is where the seven-segment OCR is started, only when someone first reads a blood pressure photo. Every file
// comes from our own site (/ocr, see scripts/copy-ocr.mjs) and the picture is read on this device.
import type { Worker } from 'tesseract.js';
import type { RowOcr } from '@/lib/bp-photo';
import type { Gray } from '@/lib/bp-reader';

let starting: Promise<Worker> | null = null;

function start(): Promise<Worker> {
  // The ready-made ES module build, so the bundler adds no CommonJS helpers to the code every page loads.
  starting ??= import('tesseract.js/dist/tesseract.esm.min.js').then(
    async ({ default: { createWorker, PSM } }) => {
      const worker = await createWorker('ssd_int', 1, {
        workerPath: '/ocr/worker.min.js',
        corePath: '/ocr',
        langPath: '/ocr',
        gzip: false,
        workerBlobURL: false,
      });
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789',
        tessedit_pageseg_mode: PSM.SINGLE_LINE,
      });
      return worker;
    },
  );
  // A failed start (for example offline before the files were ever cached) can be tried again later.
  starting.catch(() => {
    starting = null;
  });
  return starting;
}

/** Starts loading the OCR early, for example when the person picks a photo, so reading feels quick. */
export function warmUpOcr(): void {
  void start().catch(() => undefined);
}

function toCanvas(img: Gray): HTMLCanvasElement {
  // A white margin around the digits helps the OCR find the line.
  const margin = 20;
  const canvas = document.createElement('canvas');
  canvas.width = img.width + margin * 2;
  canvas.height = img.height + margin * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const pixels = ctx.createImageData(img.width, img.height);
  for (let i = 0; i < img.data.length; i++) {
    const v = img.data[i] ?? 255;
    pixels.data[i * 4] = v;
    pixels.data[i * 4 + 1] = v;
    pixels.data[i * 4 + 2] = v;
    pixels.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(pixels, margin, margin);
  return canvas;
}

/** Reads the digits in one clean row crop. */
export const readRowOcr: RowOcr = async (crop) => {
  const worker = await start();
  const { data } = await worker.recognize(toCanvas(crop));
  return { text: data.text, confidence: data.confidence };
};
