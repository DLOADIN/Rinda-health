// This is where test pictures of a monitor screen are drawn, for the blood pressure reader tests.
import type { Gray } from '@/lib/bp-reader';

const SEGMENTS: Record<number, string> = {
  0: 'abcdef',
  1: 'bc',
  2: 'abdeg',
  3: 'abcdg',
  4: 'bcfg',
  5: 'acdfg',
  6: 'acdefg',
  7: 'abc',
  8: 'abcdefg',
  9: 'abcdfg',
};

export interface Screen {
  casing?: boolean;
  rows: Array<{ value: number; height: number }>;
  slant?: number;
  inverted?: boolean;
  noise?: number;
  seed?: number;
}

// This draws a fake monitor screen the way an LCD shows it: separate bars with small gaps between them.
export function drawScreen({
  rows,
  slant = 0,
  inverted = false,
  noise = 0,
  seed = 7,
  casing = false,
}: Screen): Gray {
  const width = 320;
  const height = 300;
  const bg = inverted ? 30 : 190;
  const fg = inverted ? 220 : 40;
  const data = new Uint8Array(width * height).fill(bg);
  const fill = (x0: number, y0: number, w: number, h: number, mid: number) => {
    for (let y = Math.round(y0); y < y0 + h; y++)
      for (let x = Math.round(x0); x < x0 + w; x++) {
        const sx = Math.round(x - slant * (y - mid));
        if (sx >= 0 && sx < width && y >= 0 && y < height) data[y * width + sx] = fg;
      }
  };
  let top = 20;
  // A small label, like "SYS mmHg", that must not be read as a number.
  fill(20, 6, 40, 8, 10);
  for (const { value, height: h } of rows) {
    const w = h * 0.55;
    const t = Math.max(3, h * 0.13);
    const gap = Math.max(1, t * 0.25);
    const digits = String(value).padStart(3, ' ').split('');
    const mid = top + h / 2;
    digits.forEach((ch, i) => {
      if (ch === ' ') return;
      const x = 300 - (3 - i) * (w + h * 0.25);
      const on = SEGMENTS[Number(ch)] ?? '';
      const half = h / 2;
      if (on.includes('a')) fill(x + t, top, w - 2 * t, t, mid);
      if (on.includes('g')) fill(x + t, top + half - t / 2, w - 2 * t, t, mid);
      if (on.includes('d')) fill(x + t, top + h - t, w - 2 * t, t, mid);
      if (on.includes('f')) fill(x, top + gap, t, half - 2 * gap, mid);
      if (on.includes('b')) fill(x + w - t, top + gap, t, half - 2 * gap, mid);
      if (on.includes('e')) fill(x, top + half + gap, t, half - 2 * gap, mid);
      if (on.includes('c')) fill(x + w - t, top + half + gap, t, half - 2 * gap, mid);
    });
    top += h + 22;
  }
  // The monitor's dark casing around the screen, as a camera usually sees it.
  if (casing)
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if (x < 14 || x >= width - 10 || y < 3 || y >= height - 8) data[y * width + x] = 25;
  let s = seed;
  const rand = () => (s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  for (let i = 0; i < data.length; i++)
    data[i] = Math.max(0, Math.min(255, (data[i] ?? 0) + Math.round((rand() - 0.5) * 2 * noise)));
  return { data, width, height };
}

export const MONITOR = (sys: number, dia: number, pulse?: number): Screen['rows'] => [
  { value: sys, height: 90 },
  { value: dia, height: 90 },
  ...(pulse === undefined ? [] : [{ value: pulse, height: 50 }]),
];
