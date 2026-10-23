import { otsu, readBpDisplay, readRow, slide, type BpReading, type Box, type Gray } from '@/lib/bp-reader';

export interface NumberRow extends Box {
  size: number;
  ink?: Uint8Array;
}

export interface RowRead {
  text: string;
  confidence: number;
}

export type RowOcr = (crop: Gray) => Promise<RowRead>;

const SYS = [60, 260] as const;
const DIA = [30, 160] as const;
const PULSE = [30, 220] as const;

function morphRect(data: Uint8Array, width: number, height: number, rx: number, ry: number, max: boolean) {
  const tmp = new Uint8Array(data.length);
  const out = new Uint8Array(data.length);
  const row = new Float64Array(width);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) row[x] = data[y * width + x] ?? 0;
    const done = rx > 0 ? slide(row, rx, max) : row;
    for (let x = 0; x < width; x++) tmp[y * width + x] = done[x] ?? 0;
  }
  const col = new Float64Array(height);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) col[y] = tmp[y * width + x] ?? 0;
    const done = ry > 0 ? slide(col, ry, max) : col;
    for (let y = 0; y < height; y++) out[y * width + x] = done[y] ?? 0;
  }
  return out;
}

export function darkStrokes(img: Gray, size: number): Uint8Array {
  const { data, width, height } = img;
  const r = Math.max(2, Math.round(size * 0.25));
  const closed = morphRect(morphRect(data, width, height, r, r, true), width, height, r, r, false);
  const hat = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) hat[i] = (closed[i] ?? 0) - (data[i] ?? 0);
  const t = Math.max(25, otsu(hat));
  return hat.map((v) => (v > t ? 1 : 0));
}

export function rotateGray(img: Gray, angle: number): Gray {
  if (!angle) return img;
  const { data, width, height } = img;
  const out = new Uint8Array(width * height).fill(255);
  const cos = Math.cos((angle * Math.PI) / 180);
  const sin = Math.sin((angle * Math.PI) / 180);
  const cx = width / 2;
  const cy = height / 2;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const sx = Math.round(cx + (x - cx) * cos - (y - cy) * sin);
      const sy = Math.round(cy + (x - cx) * sin + (y - cy) * cos);
      if (sx >= 0 && sy >= 0 && sx < width && sy < height) out[y * width + x] = data[sy * width + sx] ?? 255;
    }
  return { data: out, width, height };
}

function runs(profile: number[], minValue: number, maxGap: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let start = -1;
  let lastOn = -1;
  for (let i = 0; i < profile.length; i++) {
    if ((profile[i] ?? 0) > minValue) {
      if (start < 0) start = i;
      else if (i - lastOn - 1 > maxGap) {
        out.push([start, lastOn]);
        start = i;
      }
      lastOn = i;
    }
  }
  if (start >= 0) out.push([start, lastOn]);
  return out;
}

function dropTallShapes(ink: Uint8Array, width: number, height: number, size: number): Uint8Array {
  const out = Uint8Array.from(ink);
  const seen = new Uint8Array(ink.length);
  const stack: number[] = [];
  const members: number[] = [];
  for (let start = 0; start < ink.length; start++) {
    if (!ink[start] || seen[start]) continue;
    seen[start] = 1;
    stack.push(start);
    members.length = 0;
    let x0 = width;
    let x1 = -1;
    let y0 = height;
    let y1 = -1;
    while (stack.length) {
      const i = stack.pop() ?? 0;
      members.push(i);
      const x = i % width;
      const y = (i - x) / width;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      for (const j of [x + 1 < width ? i + 1 : -1, x > 0 ? i - 1 : -1, i + width, i - width])
        if (j >= 0 && j < ink.length && ink[j] && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
    }
    if (y1 - y0 + 1 > size * 1.3 || x1 - x0 + 1 > size * 2.2) for (const i of members) out[i] = 0;
  }
  return out;
}

export function rowsInBox(img: Gray, size: number): NumberRow[] {
  const { width, height } = img;
  const ink = dropTallShapes(darkStrokes(img, size), width, height, size);
  const profile = Array.from({ length: height }, (_, y) => {
    let n = 0;
    for (let x = 0; x < width; x++) n += ink[y * width + x] ?? 0;
    return n;
  });
  const busiest = Math.max(0, ...profile);
  const bands = runs(profile, Math.max(2, busiest * 0.12), Math.max(1, Math.round(size * 0.06))).filter(
    ([a, b]) => b - a + 1 >= size * 0.45,
  );
  const rows: NumberRow[] = [];
  for (const [y0, y1] of bands) {
    const bandH = y1 - y0 + 1;
    const cols = Array.from({ length: width }, (_, x) => {
      let n = 0;
      for (let y = y0; y <= y1; y++) n += ink[y * width + x] ?? 0;
      return n;
    });
    const groups = runs(cols, 0, Math.max(1, Math.round(bandH * 0.35)));
    const spans = groups.map(([a, b]) => {
      let top = y1;
      let bottom = y0;
      for (let x = a; x <= b; x++)
        for (let y = y0; y <= y1; y++)
          if (ink[y * width + x]) {
            if (y < top) top = y;
            if (y > bottom) bottom = y;
          }
      return { a, b, top, bottom };
    });
    const tall = spans.filter((g) => g.bottom - g.top + 1 >= bandH * 0.6);
    const first = tall[0];
    const last = tall[tall.length - 1];
    if (!first || !last) continue;
    const top = Math.min(...tall.map((g) => g.top));
    const bottom = Math.max(...tall.map((g) => g.bottom));
    rows.push({ x0: first.a, x1: last.b, y0: top, y1: bottom, size: bottom - top + 1, ink });
  }
  return rows;
}

export function cropRow(img: Gray, row: Box, digitHeight = 80, angle = 0): Gray {
  const h0 = row.y1 - row.y0 + 1;
  const pad = Math.round(h0 * 0.18);
  const x0 = row.x0 - pad;
  const y0 = row.y0 - pad;
  const w = row.x1 - row.x0 + 1 + pad * 2;
  const h = h0 + pad * 2;
  const scale = digitHeight / h0;
  const W = Math.max(1, Math.round(w * scale));
  const H = Math.max(1, Math.round(h * scale));
  const pixels = new Uint8Array(W * H);
  const cos = Math.cos((angle * Math.PI) / 180);
  const sin = Math.sin((angle * Math.PI) / 180);
  const cx = x0 + w / 2;
  const cy = y0 + h / 2;
  const mask = (row as NumberRow).ink;
  const at = (x: number, y: number) => {
    const cx2 = Math.min(img.width - 1, Math.max(0, x));
    const cy2 = Math.min(img.height - 1, Math.max(0, y));
    if (!mask) return img.data[cy2 * img.width + cx2] ?? 255;
    if (y < row.y0 || y > row.y1) return 255;
    return mask[cy2 * img.width + cx2] ? 0 : 255;
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const rx = (x + 0.5) / scale - w / 2;
      const ry = (y + 0.5) / scale - h / 2;
      const sx = cx + rx * cos - ry * sin - 0.5;
      const sy = cy + rx * sin + ry * cos - 0.5;
      const xa = Math.floor(sx);
      const ya = Math.floor(sy);
      const fx = sx - xa;
      const fy = sy - ya;
      pixels[y * W + x] =
        at(xa, ya) * (1 - fx) * (1 - fy) +
        at(xa + 1, ya) * fx * (1 - fy) +
        at(xa, ya + 1) * (1 - fx) * fy +
        at(xa + 1, ya + 1) * fx * fy;
    }
  const t = mask ? 127 : otsu(pixels);
  return { data: pixels.map((v) => (v <= t ? 0 : 255)), width: W, height: H };
}

export function readCropOwn(crop: Gray): number | null {
  const ink = crop.data.map((v) => (v === 0 ? 1 : 0));
  return readRow(ink, crop.width, { x0: 0, x1: crop.width - 1, y0: 0, y1: crop.height - 1 });
}

export function rowValues(text: string): number[] {
  const digits = text.replace(/\D/g, '');
  const out = new Set<number>();
  if (digits.length >= 2 && digits.length <= 3) out.add(Number(digits));
  if (digits.length >= 3 && digits.length <= 4 && digits.endsWith('1')) out.add(Number(digits.slice(0, -1)));
  return [...out];
}

const within = (v: number, [lo, hi]: readonly [number, number]) => v >= lo && v <= hi;

function stacked(a: NumberRow, b: NumberRow): boolean {
  if (b.y0 <= a.y0) return false;
  const big = Math.max(a.size, b.size);
  if (Math.min(a.size, b.size) < big * 0.7) return false;
  const gap = b.y0 - a.y1;
  if (gap < -big * 0.15 || gap > big * 0.9) return false;
  const ix = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  return ix > Math.min(a.x1 - a.x0, b.x1 - b.x0) * 0.4;
}

interface ReadRow extends NumberRow {
  values: Map<number, number>;
}

async function readOne(
  img: Gray,
  row: NumberRow,
  ocr: RowOcr,
  late: () => boolean,
  onRow?: BoxReadOptions['onRow'],
): Promise<ReadRow> {
  const values = new Map<number, number>();
  for (const angle of [0, -5, 5]) {
    if (angle && late()) break;
    const crop = cropRow(img, row, 80, angle);
    const own = readCropOwn(crop);
    if (own !== null) values.set(own, (values.get(own) ?? 0) + 2);
    const read = await ocr(crop);
    const options = rowValues(read.text);
    onRow?.({ row, angle, own, text: read.text, confidence: read.confidence });
    const weight = read.confidence >= 60 ? 2 : 1;
    for (const v of options) values.set(v, (values.get(v) ?? 0) + weight);
    if (own !== null && options.includes(own)) break;
  }
  return { ...row, values };
}

function bestPair(read: ReadRow[]): { score: number; reading: BpReading } | null {
  let best: { score: number; reading: BpReading } | null = null;
  for (const a of read)
    for (const b of read) {
      if (!stacked(a, b)) continue;
      for (const [s, sw] of a.values)
        for (const [d, dw] of b.values) {
          if (!within(s, SYS) || !within(d, DIA) || d >= s) continue;
          if (sw < 3 || dw < 3) continue;
          const score = sw + dw;
          if (best && score <= best.score) continue;
          const below = read.find((p) => p.y0 > b.y1 && p.y0 - b.y1 < b.size * 1.2);
          const pulse = below
            ? ([...below.values.entries()]
                .filter(([v]) => within(v, PULSE))
                .sort((x, y) => y[1] - x[1])[0]?.[0] ?? null)
            : null;
          best = { score, reading: { systolic: s, diastolic: d, pulse } };
        }
    }
  return best;
}

export interface BoxReadOptions {
  ocr: RowOcr;
  deadline?: number;
  now?: () => number;
  onRow?: (info: {
    row: NumberRow;
    angle: number;
    own: number | null;
    text: string;
    confidence: number;
  }) => void;
}

export async function readBpInBox(img: Gray, options: BoxReadOptions): Promise<BpReading | null> {
  const now = options.now ?? (() => performance.now());
  const end = now() + (options.deadline ?? 8000);
  const late = () => now() > end;
  for (const angle of [0, -8, 8, -15, 15]) {
    if (late()) break;
    const turned = rotateGray(img, angle);
    const whole = readBpDisplay(turned);
    if (whole) return whole;
    const rows: NumberRow[] = [];
    for (const share of [0.22, 0.32, 0.45]) {
      for (const r of rowsInBox(turned, img.height * share))
        if (!rows.some((k) => Math.abs(k.y0 - r.y0) < r.size * 0.3 && Math.abs(k.y1 - r.y1) < r.size * 0.3))
          rows.push(r);
    }
    rows.sort((a, b) => a.y0 - b.y0);
    const sane = rows.filter((r) => r.size <= img.height * 0.58);
    const partnered = sane.filter((r) => sane.some((o) => o !== r && (stacked(r, o) || stacked(o, r))));
    const biggest = Math.max(0, ...partnered.map((r) => r.size));
    const candidates = partnered.filter((r) => r.size >= biggest * 0.75);
    const read: ReadRow[] = [];
    for (const row of candidates) {
      if (late()) break;
      read.push(await readOne(turned, row, options.ocr, late, options.onRow));
    }
    const best = bestPair(read);
    if (best) return best.reading;
  }
  return null;
}

export function boxToGray(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  box: { x0: number; y0: number; x1: number; y1: number },
  workHeight = 320,
): Gray {
  const bx = Math.max(0, Math.min(box.x0, box.x1)) * width;
  const by = Math.max(0, Math.min(box.y0, box.y1)) * height;
  const bw = Math.max(1, Math.abs(box.x1 - box.x0) * width);
  const bh = Math.max(1, Math.abs(box.y1 - box.y0) * height);
  const scale = workHeight / bh;
  const W = Math.max(1, Math.min(1200, Math.round(bw * scale)));
  const H = workHeight;
  const data = new Uint8Array(W * H);
  const lum = (x: number, y: number) => {
    const i = (Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))) * 4;
    return ((rgba[i] ?? 0) * 299 + (rgba[i + 1] ?? 0) * 587 + (rgba[i + 2] ?? 0) * 114) / 1000;
  };
  for (let y = 0; y < H; y++) {
    const sy = by + ((y + 0.5) * bh) / H - 0.5;
    const ya = Math.floor(sy);
    const fy = sy - ya;
    for (let x = 0; x < W; x++) {
      const sx = bx + ((x + 0.5) * bw) / W - 0.5;
      const xa = Math.floor(sx);
      const fx = sx - xa;
      data[y * W + x] =
        lum(xa, ya) * (1 - fx) * (1 - fy) +
        lum(xa + 1, ya) * fx * (1 - fy) +
        lum(xa, ya + 1) * (1 - fx) * fy +
        lum(xa + 1, ya + 1) * fx * fy;
    }
  }
  return { data, width: W, height: H };
}
