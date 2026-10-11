import { describe, expect, it } from 'vitest';
import en from './en/common.json';
import rw from './rw/common.json';

const keys = (obj: object, prefix = ''): string[] =>
  Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );

describe('interface strings', () => {
  it('en and rw have the same keys', () => {
    expect(keys(rw).sort()).toEqual(keys(en).sort());
  });

  it('every English string is filled in', () => {
    const flat = (obj: object): string[] =>
      Object.values(obj).flatMap((v) => (typeof v === 'object' ? flat(v) : [v]));
    expect(flat(en).every((s) => typeof s === 'string' && s.length > 0)).toBe(true);
  });
});
