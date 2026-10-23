import { describe, expect, it } from 'vitest';
import { readBpInBox, rotateGray, rowValues, type RowOcr } from '@/lib/bp-photo';
import { drawScreen, MONITOR } from '@/lib/bp-test-screen';

const silentOcr: RowOcr = async () => ({ text: '', confidence: 0 });
const sayingOcr =
  (text: string, confidence = 90): RowOcr =>
  async () => ({ text, confidence });

describe('rowValues', () => {
  it('keeps two- and three-digit numbers', () => {
    expect(rowValues('128')).toEqual([128]);
    expect(rowValues(' 84 ')).toEqual([84]);
  });

  it('offers the number without the thin bar many monitors draw after the digits', () => {
    expect(rowValues('1141')).toEqual([114]);
    expect(rowValues('621')).toEqual(expect.arrayContaining([621, 62]));
  });

  it('gives nothing for text that cannot be a reading', () => {
    expect(rowValues('')).toEqual([]);
    expect(rowValues('7')).toEqual([]);
    expect(rowValues('123456')).toEqual([]);
  });
});

describe('readBpInBox', () => {
  it('reads systolic and diastolic from a boxed screen', async () => {
    const r = await readBpInBox(drawScreen({ rows: MONITOR(128, 84, 72) }), { ocr: silentOcr, now: () => 0 });
    expect(r).toMatchObject({ systolic: 128, diastolic: 84 });
  });

  it('reads slanted digits with camera grain', async () => {
    const r = await readBpInBox(drawScreen({ rows: MONITOR(141, 92), slant: 0.12, noise: 12 }), {
      ocr: silentOcr,
    });
    expect(r).toMatchObject({ systolic: 141, diastolic: 92 });
  });

  it('reads a screen photographed at an angle', async () => {
    const tilted = rotateGray(drawScreen({ rows: MONITOR(118, 76) }), 8);
    const r = await readBpInBox(tilted, { ocr: silentOcr, now: () => 0 });
    expect(r).toMatchObject({ systolic: 118, diastolic: 76 });
  });

  it('says nothing was read for an empty box', async () => {
    const r = await readBpInBox(drawScreen({ rows: [] }), { ocr: sayingOcr('120'), now: () => 0 });
    expect(r).toBeNull();
  });

  it('refuses a pair where the lower number is not smaller', async () => {
    const r = await readBpInBox(drawScreen({ rows: MONITOR(84, 128) }), { ocr: silentOcr, now: () => 0 });
    expect(r).toBeNull();
  });

  it('never accepts a number only one weak read supports', async () => {
    const r = await readBpInBox(drawScreen({ rows: [] }), { ocr: sayingOcr('150', 20), now: () => 0 });
    expect(r).toBeNull();
  });

  it('gives up when the time is up', async () => {
    let t = 0;
    const r = await readBpInBox(drawScreen({ rows: MONITOR(128, 84) }), {
      ocr: silentOcr,
      deadline: 1,
      now: () => (t += 10),
    });
    expect(r).toBeNull();
  });
});
