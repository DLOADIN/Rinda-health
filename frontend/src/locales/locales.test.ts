import { describe, expect, it } from 'vitest';
import en from './en/common.json';
import rw from './rw/common.json';
import enLanding from './en/landing.json';
import rwLanding from './rw/landing.json';
import enStaff from './en/staff.json';
import rwStaff from './rw/staff.json';
import enCamera from './en/camera.json';
import rwCamera from './rw/camera.json';

const keys = (obj: object, prefix = ''): string[] =>
  Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );

describe('interface strings', () => {
  it('en and rw have the same keys', () => {
    expect(keys(rw).sort()).toEqual(keys(en).sort());
    expect(keys(rwLanding).sort()).toEqual(keys(enLanding).sort());
    expect(keys(rwStaff).sort()).toEqual(keys(enStaff).sort());
    expect(keys(rwCamera).sort()).toEqual(keys(enCamera).sort());
  });

  it('every English string is filled in', () => {
    const flat = (obj: object): string[] =>
      Object.values(obj).flatMap((v) => (typeof v === 'object' ? flat(v) : [v]));
    expect(flat(en).every((s) => typeof s === 'string' && s.length > 0)).toBe(true);
  });
});
