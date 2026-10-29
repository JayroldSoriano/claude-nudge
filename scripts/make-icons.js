#!/usr/bin/env node
// Generates extension/icons/icon{16,48,128}.png (pixel Clawd) with no dependencies.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ORANGE = [0xda, 0x77, 0x56, 255];
const DARK = [0xb8, 0x5c, 0x3e, 255];
const EYE = [0x1b, 0x1b, 0x1b, 255];
const NONE = [0, 0, 0, 0];

// 12x11 grid
const W = 12, H = 11;
function pixel(x, y) {
  if (y >= 0 && y <= 8 && x >= 1 && x <= 10) {
    if ((y === 0 || y === 8) && (x === 1 || x === 10)) return NONE;
    if ((x === 4 || x === 7) && (y === 3 || y === 4)) return EYE;
    if (y === 8) return DARK;
    return ORANGE;
  }
  if (y === 9 && ((x >= 2 && x <= 3) || (x >= 8 && x <= 9))) return DARK;
  if (x === 0 && (y === 5 || y === 6)) return ORANGE;
  if (x === 11 && y >= 2 && y <= 5) return ORANGE;
  return NONE;
}

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size) {
  const scale = size / W;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const gx = Math.floor(x / scale), gy = Math.floor((y - (size - H * scale) / 2) / scale);
      const p = gy >= 0 && gy < H ? pixel(gx, gy) : NONE;
      raw.set(p, y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = path.join(__dirname, '..', 'extension', 'icons');
fs.mkdirSync(out, { recursive: true });
for (const s of [16, 48, 128]) {
  fs.writeFileSync(path.join(out, `icon${s}.png`), png(s));
  console.log(`wrote icon${s}.png`);
}
