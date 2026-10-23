import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(frontend, 'public', 'ocr');
const require = createRequire(path.join(frontend, 'package.json'));
const tesseract = path.dirname(require.resolve('tesseract.js/package.json'));
const core = path.dirname(require.resolve('tesseract.js-core/package.json'));

mkdirSync(out, { recursive: true });
copyFileSync(path.join(tesseract, 'dist', 'worker.min.js'), path.join(out, 'worker.min.js'));
for (const name of [
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js',
])
  copyFileSync(path.join(core, name), path.join(out, name));
copyFileSync(path.join(frontend, 'ocr', 'ssd_int.traineddata'), path.join(out, 'ssd_int.traineddata'));
