#!/usr/bin/env node
// Generates extension/icons/icon{16,48,128}.png (Nudge, the pixel mascot) with no dependencies.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BODY = [0xff, 0xc5, 0x3d, 255];
const DARK = [0xc9, 0x8a, 0x12, 255];
const INK = [0x2b, 0x21, 0x18, 255];
const GLINT = [255, 255, 255, 255];
const BULB = [0x7e, 0xd9, 0x57, 255];
const NONE = [0, 0, 0, 0];

// 14x13 grid, same map as the content script's mascot.
const W = 14, H = 13;
function pixel(x, y) {
  if (y === 0 && x >= 5 && x <= 7) return BULB;
  if (x === 6 && (y === 1 || y === 2)) return DARK;
  if (y >= 3 && y <= 11 && x >= 1 && x <= 11) {
    if ((y === 3 || y === 11) && (x === 1 || x === 11)) return NONE;
    if ((x === 3 && y === 6) || (x === 8 && y === 6)) return GLINT;
    if ((x === 3 || x === 4 || x === 8 || x === 9) && (y === 6 || y === 7)) return INK;
    if ((y === 9 && (x === 4 || x === 8)) || (y === 10 && x >= 5 && x <= 7)) return INK;
    if (y === 11) return DARK;
    return BODY;
  }
  if (y === 12 && ((x >= 3 && x <= 4) || (x >= 8 && x <= 9))) return DARK;
  if (x === 0 && (y === 7 || y === 8)) return BODY;
  if (x === 12 && y >= 4 && y <= 7) return BODY;
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
