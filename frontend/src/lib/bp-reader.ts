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

interface Box {
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

/** Marks pixels clearly darker and clearly lighter than their surroundings; either can be the digits. */
function binarize(img: Gray): { dark: Uint8Array; light: Uint8Array } {
  const { data, width, height } = img;
  // Local threshold against a blurred background copes with uneven light and reflections on the screen.
  const r = Math.max(4, Math.round(Math.min(width, height) / 8));
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += data[y * width + x] ?? 0;
      integral[(y + 1) * (width + 1) + x + 1] = (integral[y * (width + 1) + x + 1] ?? 0) + row;
    }
  }
  const dark = new Uint8Array(width * height);
  const light = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const ya = Math.max(0, y - r);
    const yb = Math.min(height, y + r + 1);
    for (let x = 0; x < width; x++) {
      const xa = Math.max(0, x - r);
      const xb = Math.min(width, x + r + 1);
      const sum =
        (integral[yb * (width + 1) + xb] ?? 0) -
        (integral[ya * (width + 1) + xb] ?? 0) -
        (integral[yb * (width + 1) + xa] ?? 0) +
        (integral[ya * (width + 1) + xa] ?? 0);
      const mean = sum / ((yb - ya) * (xb - xa));
      const v = data[y * width + x] ?? 0;
      if (v < mean - 12) {
        dark[y * width + x] = 1;
      } else if (v > mean + 12) {
        light[y * width + x] = 1;
      }
    }
  }
  return { dark, light };
}

/** Drops lone specks: an ink pixel needs at least two ink neighbours to count. */
function despeckle(ink: Uint8Array, width: number, height: number): Uint8Array {
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

function readRow(ink: Uint8Array, width: number, row: Box): number | null {
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
  if (digits.length === 0 || digits.length > 3) return null;
  let value = 0;
  for (const box of digits) {
    const d = readDigit(get, box, tallest);
    if (d === null) return null;
    value = value * 10 + d;
  }
  return value;
}

/**
 * Reads systolic, diastolic and (if shown) pulse from a grey image of the monitor's screen. Returns null when it
 * is not sure, so the person is never shown a guess that does not look like a real reading.
 */
export function readBpDisplay(img: Gray): BpReading | null {
  const { width, height } = img;
  const { dark, light } = binarize(smooth(img));
  // Screens can be dark-on-light or backlit. Both are tried, and a reading is offered only if they do not disagree.
  const found = [dark, light]
    .map((ink) => readInk(keepDigitShapes(despeckle(ink, width, height), width, height), width, height))
    .filter((r): r is BpReading => r !== null);
  const [first, second] = found;
  if (!first) return null;
  if (second && (second.systolic !== first.systolic || second.diastolic !== first.diastolic)) return null;
  return first;
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
  if (Math.min(h1, h2) < Math.max(h1, h2) * 0.7) return null;
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
