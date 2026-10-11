#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = 'frontend/dist';
const KB = 1024;
const JS_BUDGET = 250 * KB;
const DOWNLOAD_BUDGET = 1024 * KB;
const LAZY = /assets\/(staff-routes|charts|guide-panel|clinic-card)-/;

if (!existsSync(path.join(dist, 'index.html'))) {
  console.error(`No build in ${dist}. Run npm run build first.`);
  process.exit(1);
}
const gz = (file) => gzipSync(readFileSync(path.join(dist, file))).length;
const html = readFileSync(path.join(dist, 'index.html'), 'utf8');

const initial = new Set();
const queue = [...html.matchAll(/<script[^>]+src="\/([^"]+\.js)"/g)].map((m) => m[1]);
while (queue.length) {
  const file = queue.shift();
  if (initial.has(file)) continue;
  initial.add(file);
  const code = readFileSync(path.join(dist, file), 'utf8');
  for (const m of code.matchAll(
    /(?:^|[;\n}])\s*import\s*(?:[\w*{}\s,$]+from\s*)?["']\.\/([^"']+\.js)["']/g,
  )) {
    queue.push(path.posix.join(path.posix.dirname(file), m[1]));
  }
}
const css = [...html.matchAll(/<link[^>]+href="\/([^"]+\.css)"/g)].map((m) => m[1]);

const jsBytes = [...initial].reduce((sum, f) => sum + gz(f), 0);
const downloadBytes = jsBytes + css.reduce((sum, f) => sum + gz(f), 0) + gz('index.html');

const errors = [];
if (jsBytes > JS_BUDGET)
  errors.push(`Initial JS ${(jsBytes / KB).toFixed(1)} KB gzip exceeds ${JS_BUDGET / KB} KB (NFR-17)`);
if (downloadBytes >= DOWNLOAD_BUDGET)
  errors.push(`Initial download ${(downloadBytes / KB).toFixed(1)} KB gzip is not under 1 MB (NFR-06)`);
for (const file of initial)
  if (LAZY.test(file)) errors.push(`${file} must load on demand, not in the initial download`);

const sw = existsSync(path.join(dist, 'sw.js')) ? readFileSync(path.join(dist, 'sw.js'), 'utf8') : '';
if (!sw) errors.push('dist/sw.js is missing (vite-plugin-pwa injectManifest)');
for (const m of sw.matchAll(/"url":"([^"]+)"|url:"([^"]+)"/g)) {
  const url = m[1] ?? m[2];
  if (LAZY.test(url)) errors.push(`${url} is in the service-worker precache (ADR-009)`);
}

console.log(
  `Initial JS: ${(jsBytes / KB).toFixed(1)} KB gzip (budget ${JS_BUDGET / KB} KB), ${initial.size} file(s)`,
);
console.log(`Initial download: ${(downloadBytes / KB).toFixed(1)} KB gzip (budget under 1024 KB)`);
if (errors.length) {
  console.error(errors.map((e) => `FAIL ${e}`).join('\n'));
  process.exit(1);
}
console.log('Size and precache checks passed.');
