import { describe, expect, it } from 'vitest';
import { agreeingReading, readBpDisplay, readBpPhoto, toGray, type Gray } from '@/lib/bp-reader';
import { drawScreen, MONITOR } from '@/lib/bp-test-screen';

describe('readBpDisplay', { timeout: 20_000 }, () => {
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
  }, 30_000);

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
  }, 120_000);

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

describe('readBpPhoto', { timeout: 20_000 }, () => {
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
