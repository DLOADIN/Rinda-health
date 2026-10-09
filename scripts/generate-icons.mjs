#!/usr/bin/env node
// Writes the placeholder PWA icons (Ember background, Bone ring) with no image dependencies.
// Usage: node scripts/generate-icons.mjs. Replace with designed artwork before the pilot if wanted.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const EMBER = [0xe4, 0x3d, 0x12];
const BONE = [0xeb, 0xe9, 0xe1];
const out = 'frontend/public/icons';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

/** ringScale: outer radius of the ring as a fraction of half the size (smaller for maskable safe zone). */
function png(size, ringScale) {
  const rows = [];
  const c = size / 2;
  const outer = c * ringScale;
  const inner = outer * 0.62;
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      const [r, g, b] = d <= outer && d >= inner ? BONE : EMBER;
      row.set([r, g, b], 1 + x * 3);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(out, { recursive: true });
writeFileSync(`${out}/192.png`, png(192, 0.72));
writeFileSync(`${out}/512.png`, png(512, 0.72));
writeFileSync(`${out}/maskable-512.png`, png(512, 0.5));
console.log(`Icons written to ${out}`);
