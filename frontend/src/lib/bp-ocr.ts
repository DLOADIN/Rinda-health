import type { Worker } from 'tesseract.js';
import type { RowOcr } from '@/lib/bp-photo';
import type { Gray } from '@/lib/bp-reader';

let starting: Promise<Worker> | null = null;

function start(): Promise<Worker> {
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
  starting.catch(() => {
    starting = null;
  });
  return starting;
}

export function warmUpOcr(): void {
  void start().catch(() => undefined);
}

function toCanvas(img: Gray): HTMLCanvasElement {
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

export const readRowOcr: RowOcr = async (crop) => {
  const worker = await start();
  const { data } = await worker.recognize(toCanvas(crop));
  return { text: data.text, confidence: data.confidence };
};
