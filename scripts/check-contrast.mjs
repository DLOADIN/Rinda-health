#!/usr/bin/env node
// Checks WCAG 2.2 contrast for every Rinda theme token pair (NFR-15).
// Usage: node scripts/check-contrast.mjs [path/to/theme.css]
// Default: frontend/src/index.css if it exists, otherwise docs/design/rinda-theme.css.
import { existsSync, readFileSync } from 'node:fs';

const file =
  process.argv[2] ??
  (existsSync('frontend/src/index.css') ? 'frontend/src/index.css' : 'docs/design/rinda-theme.css');
const css = readFileSync(file, 'utf8');

const readBlock = (selector) => {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`No "${selector} {" block in ${file}`);
  const body = css.slice(start, css.indexOf('\n}', start));
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map(([, k, v]) => [k, v.toUpperCase()]),
  );
};
const light = readBlock(':root');
const dark = { ...light, ...readBlock('.dark') };

const channel = (v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// [use, foreground token, background token, minimum ratio]
const pairs = [
  ['Body text', 'foreground', 'background', 4.5],
  ['Text on cards', 'card-foreground', 'card', 4.5],
  ['Primary button', 'primary-foreground', 'primary', 4.5],
  ['Secondary button', 'secondary-foreground', 'secondary', 4.5],
  ['Muted text on page', 'muted-foreground', 'background', 4.5],
  ['Muted text on cards', 'muted-foreground', 'card', 4.5],
  ['Muted text on muted', 'muted-foreground', 'muted', 4.5],
  ['Hover / accent', 'accent-foreground', 'accent', 4.5],
  ['Destructive button', 'destructive-foreground', 'destructive', 4.5],
  ['Ember link on page', 'brand-ember-strong', 'background', 4.5],
  ['Ember link on cards', 'brand-ember-strong', 'card', 4.5],
  ['Input border vs card', 'input', 'card', 3],
  ['Input border vs page', 'input', 'background', 3],
  ['Focus ring vs page', 'ring', 'background', 3],
  ['Focus ring vs card', 'ring', 'card', 3],
  ['Band: ok', 'band-ok-foreground', 'band-ok', 4.5],
  ['Band: attention', 'band-attention-foreground', 'band-attention', 4.5],
  ['Band: confirm', 'band-confirm-foreground', 'band-confirm', 4.5],
  ['Band: urgent', 'band-urgent-foreground', 'band-urgent', 4.5],
  ['Band: wellness', 'band-wellness-foreground', 'band-wellness', 4.5],
  ['Chart 1 on cards', 'chart-1', 'card', 3],
  ['Chart 2 on cards', 'chart-2', 'card', 3],
  ['Chart 5 on cards', 'chart-5', 'card', 3],
  ['Amber stroke on cards', 'brand-amber-strong', 'card', 3],
  ['Blush stroke on cards', 'brand-blush-strong', 'card', 3],
  ['Sidebar active item', 'sidebar-primary-foreground', 'sidebar-primary', 4.5],
];

let failures = 0;
for (const [use, fg, bg, min] of pairs) {
  for (const [mode, theme] of [
    ['light', light],
    ['dark', dark],
  ]) {
    if (!theme[fg] || !theme[bg]) {
      console.error(`MISSING ${mode}: --${fg} or --${bg}`);
      failures++;
      continue;
    }
    const r = ratio(theme[fg], theme[bg]);
    const ok = r >= min;
    if (!ok) failures++;
    console.log(
      `${ok ? 'pass' : 'FAIL'}  ${mode.padEnd(5)} ${use.padEnd(24)} ${r.toFixed(2)}:1 (needs ${min}:1)`,
    );
  }
}
if (failures) {
  console.error(`\n${failures} contrast check(s) failed in ${file}`);
  process.exit(1);
}
console.log(`\nAll ${pairs.length * 2} checks passed in ${file}`);
