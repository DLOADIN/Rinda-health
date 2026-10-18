import { describe, expect, it } from 'vitest';
import { agreeingReading, readBpDisplay, readBpPhoto, toGray, type Gray } from '@/lib/bp-reader';

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

interface Screen {
  casing?: boolean;
  rows: Array<{ value: number; height: number }>;
  slant?: number;
  inverted?: boolean;
  noise?: number;
  seed?: number;
}

// This draws a fake monitor screen the way an LCD shows it: separate bars with small gaps between them.
function drawScreen({
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

const MONITOR = (sys: number, dia: number, pulse?: number): Screen['rows'] => [
  { value: sys, height: 90 },
  { value: dia, height: 90 },
  ...(pulse === undefined ? [] : [{ value: pulse, height: 50 }]),
];

describe('readBpDisplay', () => {
  it('reads an upright dark-on-light screen with pulse', () => {
    expect(readBpDisplay(drawScreen({ rows: MONITOR(128, 82, 74) }))).toEqual({
      systolic: 128,
      diastolic: 82,
      pulse: 74,
    });
  });

  it('reads every digit 0 to 9', () => {
    for (const [sys, dia] of [
      [120, 80],
      [134, 96],
      [157, 103],
      [99, 65],
      [248, 149],
    ] as const)
      expect(readBpDisplay(drawScreen({ rows: MONITOR(sys, dia) }))).toMatchObject({
        systolic: sys,
        diastolic: dia,
      });
  });

  it('ignores the monitor casing around the screen', () => {
    expect(
      readBpDisplay(drawScreen({ rows: MONITOR(128, 82, 74), casing: true, slant: 0.12 })),
    ).toMatchObject({
      systolic: 128,
      diastolic: 82,
    });
  });

  it('ignores a line drawn around the digits', () => {
    const g = drawScreen({ rows: MONITOR(152, 97, 66) });
    for (let x = 8; x < g.width - 8; x++)
      for (const y of [4, 5, g.height - 6, g.height - 5]) g.data[y * g.width + x] = 40;
    for (let y = 4; y < g.height - 4; y++)
      for (const x of [8, 9, g.width - 9, g.width - 10]) g.data[y * g.width + x] = 40;
    expect(readBpDisplay(g)).toMatchObject({ systolic: 152, diastolic: 97 });
  });

  it('reads slanted digits', () => {
    expect(readBpDisplay(drawScreen({ rows: MONITOR(141, 92, 68), slant: 0.18 }))).toMatchObject({
      systolic: 141,
      diastolic: 92,
    });
  });

  it('reads a backlit light-on-dark screen with noise', () => {
    expect(
      readBpDisplay(drawScreen({ rows: MONITOR(117, 76, 80), inverted: true, noise: 20 })),
    ).toMatchObject({
      systolic: 117,
      diastolic: 76,
    });
  });

  it('reads a dark-on-light screen with camera grain', () => {
    expect(readBpDisplay(drawScreen({ rows: MONITOR(117, 76, 80), noise: 20 }))).toMatchObject({
      systolic: 117,
      diastolic: 76,
    });
  });

  it('never offers a wrong number, even when the picture is very poor', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const noise = 22 + (seed % 4) * 6;
      const r = readBpDisplay(
        drawScreen({ rows: MONITOR(136, 88, 71), noise, slant: (seed % 3) * 0.08, seed }),
      );
      if (r) expect(r).toMatchObject({ systolic: 136, diastolic: 88 });
    }
  }, 120_000); // 60 pictures; slower machines and a busy test run need the extra time

  it('refuses a blank or implausible screen rather than guessing', () => {
    expect(readBpDisplay(drawScreen({ rows: [] }))).toBeNull();
    expect(readBpDisplay(drawScreen({ rows: MONITOR(80, 120) }))).toBeNull();
  });

  it('works from RGBA camera pixels', () => {
    const g = drawScreen({ rows: MONITOR(128, 82) });
    const rgba = new Uint8ClampedArray(g.width * g.height * 4);
    g.data.forEach((v, i) => rgba.set([v, v, v, 255], i * 4));
    expect(readBpDisplay(toGray(rgba, g.width, g.height))).toMatchObject({ systolic: 128, diastolic: 82 });
  });
});

// This puts a drawn monitor screen into a bigger photo with a light casing, round buttons and a label, the way a
// person photographs the whole monitor on a table.
function photoOf(screen: Gray, at: { x: number; y: number }) {
  const width = 900;
  const height = 560;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const put = (x: number, y: number, v: number) => {
    if (x >= 0 && y >= 0 && x < width && y < height) rgba.set([v, v, v, 255], (y * width + x) * 4);
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) put(x, y, 205);
  for (let y = at.y - 40; y < at.y + screen.height + 40; y++)
    for (let x = at.x - 40; x < at.x + screen.width + 160; x++) put(x, y, 238);
  for (const [cx, cy] of [
    [at.x + screen.width + 80, at.y + 60],
    [at.x + screen.width + 80, at.y + 160],
  ] as const)
    for (let y = -22; y <= 22; y++)
      for (let x = -22; x <= 22; x++) if (x * x + y * y < 484) put(cx + x, cy + y, 120);
  for (let y = 0; y < 14; y++) for (let x = 0; x < 50; x++) put(at.x - 70 + x, at.y + 30 + y, 90);
  for (let y = 0; y < screen.height; y++)
    for (let x = 0; x < screen.width; x++) put(at.x + x, at.y + y, screen.data[y * screen.width + x] ?? 0);
  return { rgba, width, height };
}

describe('readBpPhoto', () => {
  it('finds the screen anywhere in a photo of the whole monitor', () => {
    const { rgba, width, height } = photoOf(drawScreen({ rows: MONITOR(132, 84, 66), casing: true }), {
      x: 300,
      y: 120,
    });
    expect(readBpPhoto(rgba, width, height)).toMatchObject({ systolic: 132, diastolic: 84 });
  }, 60_000);

  it('offers nothing for a photo without a monitor', () => {
    const rgba = new Uint8ClampedArray(400 * 300 * 4).fill(180);
    expect(readBpPhoto(rgba, 400, 300)).toBeNull();
  }, 60_000);
});

describe('agreeingReading', () => {
  it('needs three frames to agree', () => {
    const a = { systolic: 128, diastolic: 82, pulse: null };
    const b = { systolic: 126, diastolic: 82, pulse: null };
    expect(agreeingReading([a, b, a])).toBeNull();
    expect(agreeingReading([a, b, a, a])).toEqual(a);
  });
});
