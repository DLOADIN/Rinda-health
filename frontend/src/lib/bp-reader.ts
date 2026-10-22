// This is where a photo of a digital blood pressure monitor becomes numbers. It reads the large seven-segment
// digits on the phone itself; no image ever leaves the device, and the person always confirms what was read.

export interface Gray {
  data: Uint8Array;
  width: number;
  height: number;
}

export interface BpReading {
  systolic: number;
  diastolic: number;
  pulse: number | null;
}

export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

// Segments in the order a, b, c, d, e, f, g (top, top-right, bottom-right, bottom, bottom-left, top-left, middle).
const DIGITS: Record<string, number> = {
  '1111110': 0,
  '0110000': 1,
  '1101101': 2,
  '1111001': 3,
  '0110011': 4,
  '1011011': 5,
  '1011111': 6,
  '1110000': 7,
  '1110010': 7,
  '1111111': 8,
  '1111011': 9,
  '0011111': 6,
  '1110011': 9,
};
const PATTERNS = Object.entries(DIGITS);

/** Turns RGBA pixels into grey, scaled down so the longest side is at most `max` pixels. */
export function toGray(rgba: Uint8ClampedArray, width: number, height: number, max = 360): Gray {
  const scale = Math.min(1, max / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(height - 1, Math.floor(y / scale));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(width - 1, Math.floor(x / scale));
      const i = (sy * width + sx) * 4;
      data[y * w + x] = ((rgba[i] ?? 0) * 299 + (rgba[i + 1] ?? 0) * 587 + (rgba[i + 2] ?? 0) * 114) / 1000;
    }
  }
  return { data, width: w, height: h };
}

/** A light 3 x 3 blur, so camera grain does not turn into stray specks. */
function smooth(img: Gray): Gray {
  const { data, width, height } = img;
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy >= 0 && yy < height && xx >= 0 && xx < width) {
            sum += data[yy * width + xx] ?? 0;
            n++;
          }
        }
      out[y * width + x] = sum / n;
    }
  return { data: out, width, height };
}

/**
 * Sliding-window minimum or maximum of one line (van Herk / Gil-Werman), so the cost does not grow with the
 * window: each value is the best of the window from x - r to x + r.
 */
export function slide(line: Float64Array, r: number, max: boolean): Float64Array {
  const n = line.length;
  const k = 2 * r + 1;
  const edge = max ? -Infinity : Infinity;
  const padded = new Float64Array(n + 2 * r).fill(edge);
  padded.set(line, r);
  const len = padded.length;
  const forward = new Float64Array(len);
  const backward = new Float64Array(len);
  const pick = max ? Math.max : Math.min;
  for (let i = 0; i < len; i++)
    forward[i] = i % k === 0 ? (padded[i] ?? edge) : pick(forward[i - 1] ?? edge, padded[i] ?? edge);
  for (let i = len - 1; i >= 0; i--)
    backward[i] =
      i === len - 1 || (i + 1) % k === 0
        ? (padded[i] ?? edge)
        : pick(backward[i + 1] ?? edge, padded[i] ?? edge);
  const out = new Float64Array(n);
  for (let x = 0; x < n; x++) out[x] = pick(backward[x] ?? edge, forward[x + 2 * r] ?? edge);
  return out;
}

/** Square grey-scale dilation (max) or erosion (min): rows first, then columns. */
export function morph(data: Uint8Array, width: number, height: number, r: number, max: boolean): Uint8Array {
  const tmp = new Uint8Array(data.length);
  const out = new Uint8Array(data.length);
  const row = new Float64Array(width);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) row[x] = data[y * width + x] ?? 0;
    const done = slide(row, r, max);
    for (let x = 0; x < width; x++) tmp[y * width + x] = done[x] ?? 0;
  }
  const col = new Float64Array(height);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) col[y] = tmp[y * width + x] ?? 0;
    const done = slide(col, r, max);
    for (let y = 0; y < height; y++) out[y * width + x] = done[y] ?? 0;
  }
  return out;
}

/** Otsu's threshold for a set of values from 0 to 255. */
export function otsu(values: Uint8Array): number {
  const hist = new Array<number>(256).fill(0);
  for (const v of values) hist[v] = (hist[v] ?? 0) + 1;
  const total = values.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * (hist[i] ?? 0);
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 0;
  for (let t = 0; t < 256; t++) {
    wB += hist[t] ?? 0;
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * (hist[t] ?? 0);
    const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/**
 * Marks thin strokes darker (and lighter) than their surroundings. A top-hat filter takes away anything wider than a
 * digit stroke first, so shadows across the screen and the dark border around it are not mistaken for digits.
 */
function binarize(img: Gray, stroke: number): { dark: Uint8Array; light: Uint8Array } {
  const { data, width, height } = img;
  const r = Math.max(3, Math.round(Math.min(width, height) * stroke));
  const closed = morph(morph(data, width, height, r, true), width, height, r, false);
  const opened = morph(morph(data, width, height, r, false), width, height, r, true);
  const darkHat = new Uint8Array(data.length);
  const lightHat = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    darkHat[i] = (closed[i] ?? 0) - (data[i] ?? 0);
    lightHat[i] = (data[i] ?? 0) - (opened[i] ?? 0);
  }
  const mark = (hat: Uint8Array) => {
    const t = Math.max(20, otsu(hat));
    return hat.map((v) => (v > t ? 1 : 0));
  };
  return { dark: mark(darkHat), light: mark(lightHat) };
}

/**
 * Removes long straight lines, such as the edges of the screen, which can touch the digits and join them together.
 * A digit's own strokes are far shorter than these.
 */
function dropLines(ink: Uint8Array, width: number, height: number): Uint8Array {
  const out = Uint8Array.from(ink);
  const longRow = Math.max(8, Math.round(width * 0.2));
  const longCol = Math.max(8, Math.round(height * 0.35));
  for (let y = 0; y < height; y++) {
    let start = -1;
    for (let x = 0; x <= width; x++) {
      const on = x < width && ink[y * width + x];
      if (on && start < 0) start = x;
      if (!on && start >= 0) {
        if (x - start >= longRow) for (let i = start; i < x; i++) out[y * width + i] = 0;
        start = -1;
      }
    }
  }
  for (let x = 0; x < width; x++) {
    let start = -1;
    for (let y = 0; y <= height; y++) {
      const on = y < height && ink[y * width + x];
      if (on && start < 0) start = y;
      if (!on && start >= 0) {
        if (y - start >= longCol) for (let i = start; i < y; i++) out[i * width + x] = 0;
        start = -1;
      }
    }
  }
  return out;
}

/** Drops lone specks: an ink pixel needs at least two ink neighbours to count. */
export function despeckle(ink: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(ink.length);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (!ink[y * width + x]) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if ((dx || dy) && ink[(y + dy) * width + x + dx] && x + dx >= 0 && x + dx < width) n++;
      if (n >= 2) out[y * width + x] = 1;
    }
  return out;
}

/**
 * Keeps only shapes that could be parts of digits. Anything touching the edge of the picture (the casing, a finger)
 * or far too big to be a segment (the screen's outline, a frame line) is removed.
 */
function keepDigitShapes(ink: Uint8Array, width: number, height: number): Uint8Array {
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
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ] as const) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const j = ny * width + nx;
        if (ink[j] && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    const touchesEdge = x0 === 0 || y0 === 0 || x1 === width - 1 || y1 === height - 1;
    const tooBig = x1 - x0 + 1 > width * 0.4 || y1 - y0 + 1 > height * 0.45;
    if (touchesEdge || tooBig) for (const i of members) out[i] = 0;
  }
  return out;
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

/** Seven-segment digits are often slanted; this finds the shear that makes the gaps between digits clearest. */
function bestShear(ink: Uint8Array, width: number, box: Box): number {
  const mid = (box.y0 + box.y1) / 2;
  let best = 0;
  let bestCols = Infinity;
  for (let s = -0.3; s <= 0.301; s += 0.05) {
    const cols = new Uint8Array(width * 2);
    for (let y = box.y0; y <= box.y1; y++)
      for (let x = box.x0; x <= box.x1; x++)
        if (ink[y * width + x]) cols[Math.round(x + s * (y - mid)) + width / 2] = 1;
    let used = 0;
    for (const c of cols) used += c;
    if (used < bestCols - 0.5) {
      bestCols = used;
      best = s;
    }
  }
  return best;
}

function readDigit(get: (x: number, y: number) => number, box: Box, rowHeight: number): number | null {
  const w = box.x1 - box.x0 + 1;
  const h = box.y1 - box.y0 + 1;
  if (h < rowHeight * 0.6) return null;
  // A narrow, tall shape is a 1 (it has only the right-hand segments).
  if (w < h * 0.3) return 1;
  const frac = (fx0: number, fx1: number, fy0: number, fy1: number) => {
    const xa = box.x0 + Math.floor(fx0 * w);
    const xb = box.x0 + Math.max(Math.floor(fx0 * w), Math.ceil(fx1 * w) - 1);
    const ya = box.y0 + Math.floor(fy0 * h);
    const yb = box.y0 + Math.max(Math.floor(fy0 * h), Math.ceil(fy1 * h) - 1);
    let on = 0;
    let all = 0;
    for (let y = ya; y <= yb; y++)
      for (let x = xa; x <= xb; x++) {
        on += get(x, y);
        all++;
      }
    return all ? on / all : 0;
  };
  const segs = [
    frac(0.3, 0.7, 0, 0.16), // a
    frac(0.7, 1, 0.12, 0.42), // b
    frac(0.7, 1, 0.58, 0.88), // c
    frac(0.3, 0.7, 0.84, 1), // d
    frac(0, 0.3, 0.58, 0.88), // e
    frac(0, 0.3, 0.12, 0.42), // f
    frac(0.3, 0.7, 0.42, 0.58), // g
  ];
  const code = segs.map((v) => (v > 0.3 ? '1' : '0')).join('');
  const exact = DIGITS[code];
  if (exact !== undefined) return exact;
  // Allow one segment to be misread, but only when exactly one digit is that close.
  const near = PATTERNS.filter(([p]) => [...p].filter((c, i) => c !== code[i]).length === 1).map(
    ([, d]) => d,
  );
  const unique = [...new Set(near)];
  return unique.length === 1 ? (unique[0] ?? 0) : null;
}

export function readRow(ink: Uint8Array, width: number, row: Box): number | null {
  const shear = bestShear(ink, width, row);
  const mid = (row.y0 + row.y1) / 2;
  const height = row.y1 - row.y0 + 1;
  // Straighten the row into its own small image.
  const off = Math.ceil(Math.abs(shear) * height);
  const w = row.x1 - row.x0 + 1 + off * 2;
  const straight = new Uint8Array(w * height);
  for (let y = row.y0; y <= row.y1; y++)
    for (let x = row.x0; x <= row.x1; x++)
      if (ink[y * width + x]) {
        const nx = Math.round(x - row.x0 + off + shear * (y - mid));
        if (nx >= 0 && nx < w) straight[(y - row.y0) * w + nx] = 1;
      }
  const cols = Array.from({ length: w }, (_, x) => {
    let n = 0;
    for (let y = 0; y < height; y++) n += straight[y * w + x] ?? 0;
    return n;
  });
  const groups = runs(
    cols,
    Math.max(1, Math.round(height * 0.04)),
    Math.max(1, Math.round(height * 0.06)),
  ).filter(([a, b]) => b - a + 1 >= Math.max(2, height * 0.08));
  const get = (x: number, y: number) => straight[y * w + x] ?? 0;
  const boxes: Box[] = [];
  for (const [x0, x1] of groups) {
    let y0 = height;
    let y1 = -1;
    for (let y = 0; y < height; y++)
      for (let x = x0; x <= x1; x++)
        if (straight[y * w + x]) {
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
        }
    // Labels and icons inside the row are much shorter than the digits, so they are skipped.
    if (y1 >= 0) boxes.push({ x0, x1, y0, y1 });
  }
  const tallest = Math.max(0, ...boxes.map((b) => b.y1 - b.y0 + 1));
  const digits = boxes.filter((b) => b.y1 - b.y0 + 1 >= tallest * 0.75);
  // Many monitors show a thin level or memory bar just after the last digit. A real 1 at the end sits further
  // away (it is drawn on the right of its own digit space), so a thin shape tucked close to the last digit is dropped.
  while (digits.length > 1) {
    const last = digits[digits.length - 1];
    const before = digits[digits.length - 2];
    if (!last || !before) break;
    const thin = last.x1 - last.x0 + 1 < tallest * 0.3;
    const close = last.x0 - before.x1 - 1 < tallest * 0.3;
    if (thin && close) digits.pop();
    else break;
  }
  if (digits.length === 0 || digits.length > 3) return null;
  let value = 0;
  for (const box of digits) {
    const d = readDigit(get, box, tallest);
    if (d === null) return null;
    value = value * 10 + d;
  }
  return value;
}

// The filter size has to suit how thick the digit strokes look, which depends on how close the picture was taken.
const STROKES = [0.03, 0.05, 0.08];

/**
 * Reads systolic, diastolic and (if shown) pulse from a grey image of the monitor's screen. Returns null when it
 * is not sure, so the person is never shown a guess that does not look like a real reading.
 */
export function readBpDisplay(img: Gray): BpReading | null {
  const { width, height } = img;
  const smoothed = smooth(img);
  // Screens can be dark-on-light or backlit, and digits can look thin or thick. Every combination is tried, and a
  // reading is offered only if none of them disagrees.
  const found: BpReading[] = [];
  for (const stroke of STROKES) {
    const { dark, light } = binarize(smoothed, stroke);
    for (const ink of [dark, light]) {
      const r = readInk(
        dropLines(keepDigitShapes(despeckle(ink, width, height), width, height), width, height),
        width,
        height,
      );
      if (r) found.push(r);
    }
  }
  const [first] = found;
  if (!first) return null;
  if (found.some((r) => r.systolic !== first.systolic || r.diastolic !== first.diastolic)) return null;
  return found.find((r) => r.pulse !== null) ?? first;
}

const MAX_PHOTO_WINDOWS = 120;

export type PhotoWindow = readonly [x: number, y: number, w: number, h: number];

/**
 * The windows a photo is searched with: the whole picture, then smaller squares and portrait boxes sized against
 * its shorter side, nearest the middle first because people usually centre the monitor.
 */
export function photoWindows(width: number, height: number): PhotoWindow[] {
  const out: Array<PhotoWindow & { d: number }> = [];
  const short = Math.min(width, height);
  for (const size of [0.75, 0.55, 0.45, 0.36, 0.28]) {
    for (const aspect of [1, 1.3]) {
      const w = Math.round(short * size);
      const h = Math.min(height, Math.round(w * aspect));
      if (w < 40 || h < 40 || w > width) continue;
      const step = Math.max(4, Math.round(w / 4));
      for (let y = 0; y + h <= height; y += step)
        for (let x = 0; x + w <= width; x += step) {
          const d = Math.hypot(x + w / 2 - width / 2, y + h / 2 - height / 2) / short;
          out.push(Object.assign([x, y, w, h] as const, { d }));
        }
    }
  }
  out.sort((a, b) => a.d - b.d);
  // Capped, so a photo with no readable screen gives up in a few seconds instead of keeping the person waiting.
  return [
    [0, 0, width, height],
    ...out.slice(0, MAX_PHOTO_WINDOWS - 1).map(([x, y, w, h]) => [x, y, w, h] as const),
  ];
}

/**
 * The windows to try around a spot the person tapped on the monitor's screen: a few sizes, each nudged a little
 * in every direction, all kept inside the photo.
 */
export function windowsAround(width: number, height: number, cx: number, cy: number): PhotoWindow[] {
  const short = Math.min(width, height);
  const out: PhotoWindow[] = [];
  for (const size of [0.22, 0.28, 0.35, 0.44]) {
    for (const aspect of [1, 1.25]) {
      const w = Math.min(width, Math.round(short * size));
      const h = Math.min(height, Math.round(w * aspect));
      for (const [dx, dy] of [
        [0, 0],
        [-0.12, 0],
        [0.12, 0],
        [0, -0.12],
        [0, 0.12],
      ] as const) {
        const x = Math.round(Math.min(width - w, Math.max(0, cx - w / 2 + dx * w)));
        const y = Math.round(Math.min(height - h, Math.max(0, cy - h / 2 + dy * h)));
        out.push([x, y, w, h]);
      }
    }
  }
  return out;
}

/** Reads the screen around a tapped spot; several windows must agree, as with a whole photo. */
export function readBpAround(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
): BpReading | null {
  const vote = createPhotoVote();
  const { straight, turned } = tapAttempts(width, height, cx, cy);
  for (const win of straight) {
    const r = readPhotoWindow(rgba, width, win);
    if (r) vote.add(r);
    if (vote.settled()) break;
  }
  if (vote.result()) return vote.result();
  for (const [win, angle] of turned) {
    const r = readPhotoWindow(rgba, width, win, angle);
    if (r) vote.add(r);
    if (vote.settled()) break;
  }
  return vote.result();
}

/**
 * What is tried around a tapped spot: windows read straight first, then, only if nothing clear came of those,
 * the same windows slightly rotated in case the monitor was photographed at an angle.
 */
export function tapAttempts(width: number, height: number, cx: number, cy: number) {
  const straight = windowsAround(width, height, cx, cy);
  const turned = TILTS.flatMap((angle) =>
    straight.filter((_, i) => i < 30).map((win) => [win, angle] as const),
  );
  return { straight, turned };
}

const TILTS = [-16, 16, -8, 8];

/** Reads one window of a photo. */
export function readPhotoWindow(
  rgba: Uint8ClampedArray,
  width: number,
  win: PhotoWindow,
  angle = 0,
): BpReading | null {
  const [x0, y0, w, h] = win;
  const height = Math.floor(rgba.length / 4 / width);
  // Small screens in a photo have digits only a few pixels thick, so every window is resized (smoothly, up or
  // down) to a working size before it is read. A monitor photographed at an angle is turned upright first.
  const scale = WORK_SIZE / Math.max(w, h);
  const W = Math.max(1, Math.round(w * scale));
  const H = Math.max(1, Math.round(h * scale));
  const data = new Uint8Array(W * H);
  const lum = (x: number, y: number) => {
    const i = (Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))) * 4;
    return ((rgba[i] ?? 0) * 299 + (rgba[i + 1] ?? 0) * 587 + (rgba[i + 2] ?? 0) * 114) / 1000;
  };
  const cos = Math.cos((angle * Math.PI) / 180);
  const sin = Math.sin((angle * Math.PI) / 180);
  const cx = x0 + w / 2;
  const cy = y0 + h / 2;
  for (let y = 0; y < H; y++) {
    const ry = (y + 0.5) / scale - h / 2;
    for (let x = 0; x < W; x++) {
      const rx = (x + 0.5) / scale - w / 2;
      const sx = cx + rx * cos - ry * sin - 0.5;
      const sy = cy + rx * sin + ry * cos - 0.5;
      const xa = Math.floor(sx);
      const ya = Math.floor(sy);
      const fx = sx - xa;
      const fy = sy - ya;
      data[y * W + x] =
        lum(xa, ya) * (1 - fx) * (1 - fy) +
        lum(xa + 1, ya) * fx * (1 - fy) +
        lum(xa, ya + 1) * (1 - fx) * fy +
        lum(xa + 1, ya + 1) * fx * fy;
    }
  }
  return readBpDisplay({ data, width: W, height: H });
}

const WORK_SIZE = 220;

/** Keeps a tally of what the windows read, and says when one reading clearly wins. */
export function createPhotoVote() {
  const votes = new Map<string, { n: number; r: BpReading }>();
  const ranked = () => [...votes.values()].sort((a, b) => b.n - a.n);
  return {
    add(r: BpReading) {
      const key = `${r.systolic}/${r.diastolic}`;
      const v = votes.get(key);
      votes.set(key, { n: (v?.n ?? 0) + 1, r: v?.r.pulse != null ? v.r : r });
    },
    /** Sure enough to stop searching early. */
    settled() {
      const [best, next] = ranked();
      return Boolean(best && best.n >= 3 && best.n >= 3 * (next?.n ?? 0));
    },
    /** The reading to offer: at least two windows, and at least twice as many as any other reading. */
    result(): BpReading | null {
      const [best, next] = ranked();
      return best && best.n >= 2 && best.n >= 2 * (next?.n ?? 0) ? best.r : null;
    },
  };
}

/**
 * Reads a whole photo, where the monitor's screen may be anywhere and any size. A reading is offered only when
 * several windows agree on it and it clearly beats anything else read.
 */
export function readBpPhoto(rgba: Uint8ClampedArray, width: number, height: number): BpReading | null {
  const vote = createPhotoVote();
  for (const win of photoWindows(width, height)) {
    const r = readPhotoWindow(rgba, width, win);
    if (r) vote.add(r);
    if (vote.settled()) break;
  }
  return vote.result();
}

function readInk(ink: Uint8Array, width: number, height: number): BpReading | null {
  const rowsProfile = Array.from({ length: height }, (_, y) => {
    let n = 0;
    for (let x = 0; x < width; x++) n += ink[y * width + x] ?? 0;
    return n;
  });
  const minInk = Math.max(2, width * 0.02);
  const bands = runs(rowsProfile, minInk, Math.max(2, Math.round(height * 0.02))).filter(
    ([a, b]) => b - a + 1 >= height * 0.08,
  );
  if (bands.length < 2) return null;
  const tallest = Math.max(...bands.map(([a, b]) => b - a + 1));
  const numberRows = bands.filter(([a, b]) => b - a + 1 >= tallest * 0.45);
  // Each number stays tied to its own row: a row that cannot be read is never filled in by the one below it.
  const values: Array<number | null> = [];
  for (const [y0, y1] of numberRows) {
    let x0 = width;
    let x1 = -1;
    for (let y = y0; y <= y1; y++)
      for (let x = 0; x < width; x++)
        if (ink[y * width + x]) {
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
        }
    const v = x1 >= 0 ? readRow(ink, width, { x0, x1, y0, y1 }) : null;
    values.push(v);
  }
  const [systolic, diastolic, pulse] = values;
  if (systolic == null || diastolic == null) return null;
  // Systolic and diastolic are shown at the same size; a smaller pulse row in second place means a row was lost.
  const [first, second] = numberRows;
  if (!first || !second) return null;
  const h1 = first[1] - first[0] + 1;
  const h2 = second[1] - second[0] + 1;
  if (Math.min(h1, h2) < Math.max(h1, h2) * 0.8) return null;
  if (systolic < 60 || systolic > 260 || diastolic < 30 || diastolic > 160 || diastolic >= systolic)
    return null;
  return { systolic, diastolic, pulse: pulse != null && pulse >= 30 && pulse <= 220 ? pulse : null };
}

/** Several frames must agree before a reading is offered, which filters out blur and reflections. */
export function agreeingReading(recent: readonly BpReading[], needed = 3): BpReading | null {
  const counts = new Map<string, { n: number; r: BpReading }>();
  for (const r of recent) {
    const k = `${r.systolic}/${r.diastolic}`;
    const c = counts.get(k);
    counts.set(k, { n: (c?.n ?? 0) + 1, r });
  }
  for (const { n, r } of counts.values()) if (n >= needed) return r;
  return null;
}
