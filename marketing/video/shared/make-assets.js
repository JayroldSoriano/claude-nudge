#!/usr/bin/env node
// Generates shared marketing assets from the extension's own definitions so every video uses the real mascot and sounds.
//   mascot.svg / mascot-annoyed.svg   the 14x13 pixel mascot (smile / level-2 face)
//   mascot-pixels.json                the pixel map + palette for re-drawing in React/HTML
//   sfx-blip.wav, sfx-done.wav, sfx-alarm.wav   the extension's Web Audio tones rendered to WAV
'use strict';
const fs = require('fs');
const path = require('path');

const PALETTE = { BODY: '#FFC53D', DARK: '#C98A12', INK: '#2B2118', GLINT: '#FFFFFF', BULB: '#7ED957', BULB_L1: '#FFB020', BULB_L2: '#FF4D4D' };
const PX = {
  body: [], bulb: [[5,0],[6,0],[7,0]], stalk: [[6,1],[6,2]],
  eyes: [[3,6],[4,6],[3,7],[4,7],[8,6],[9,6],[8,7],[9,7]], glint: [[3,6],[8,6]],
  smile: [[4,9],[5,10],[6,10],[7,10],[8,9]], frown: [[4,10],[5,9],[6,9],[7,9],[8,10]],
  browL: [[3,4],[4,5]], browR: [[9,4],[8,5]], footL: [[3,12],[4,12]], footR: [[8,12],[9,12]],
  armLeft: [[0,7],[0,8]], armUp: [[12,4],[12,5],[12,6],[12,7]], armOut: [[12,7],[12,6],[13,5],[13,4]],
  base: [[2,11],[3,11],[4,11],[5,11],[6,11],[7,11],[8,11],[9,11],[10,11]],
};
for (let y = 3; y <= 11; y++) for (let x = 1; x <= 11; x++) {
  const corner = (y === 3 || y === 11) && (x === 1 || x === 11);
  if (!corner) PX.body.push([x, y]);
}
const rects = (pts, fill) => pts.map(([x, y]) => `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`).join('');
function svg({ annoyed = false, armUp = true, bulb = PALETTE.BULB } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 13" shape-rendering="crispEdges">
${rects(PX.stalk, PALETTE.DARK)}${rects(PX.bulb, bulb)}${rects(PX.body, PALETTE.BODY)}${rects(PX.base, PALETTE.DARK)}${rects(PX.armLeft, PALETTE.BODY)}
${rects(PX.eyes, PALETTE.INK)}${rects(PX.glint, PALETTE.GLINT)}
${annoyed ? rects(PX.browL, PALETTE.INK) + rects(PX.browR, PALETTE.INK) + rects(PX.frown, PALETTE.INK) : rects(PX.smile, PALETTE.INK)}
${rects(PX.footL, PALETTE.DARK)}${rects(PX.footR, PALETTE.DARK)}
${rects(armUp ? PX.armUp : PX.armOut, PALETTE.BODY)}
</svg>`;
}
fs.writeFileSync('mascot.svg', svg());
fs.writeFileSync('mascot-wave2.svg', svg({ armUp: false }));
fs.writeFileSync('mascot-annoyed.svg', svg({ annoyed: true, bulb: PALETTE.BULB_L2 }));
fs.writeFileSync('mascot-annoyed-wave2.svg', svg({ annoyed: true, bulb: PALETTE.BULB_L2, armUp: false }));
fs.writeFileSync('mascot-pixels.json', JSON.stringify({ grid: { w: 14, h: 13 }, palette: PALETTE, pixels: PX }, null, 2));

// --- WAV synthesis matching content.js tones(): square wave, 10ms attack, exponential decay to `len`.
const SR = 44100;
function tones(notes, gain, step, len) {
  const total = Math.ceil((notes.length * step + len + 0.15) * SR);
  const buf = new Float32Array(total);
  notes.forEach((f, i) => {
    const t0 = i * step;
    for (let n = 0; n < Math.ceil((len + 0.01) * SR); n++) {
      const t = n / SR;
      const env = t < 0.01 ? 0.0001 * Math.pow(gain / 0.0001, t / 0.01) : gain * Math.pow(0.0001 / gain, (t - 0.01) / (len - 0.01));
      const sq = Math.sign(Math.sin(2 * Math.PI * f * t)) || 1;
      const idx = Math.floor((t0 + t) * SR);
      if (idx < total) buf[idx] += sq * env;
    }
  });
  return buf;
}
function wav(samples, file) {
  const pcm = Buffer.alloc(samples.length * 2);
  // The extension plays at low gain; scale up ~8x so the files sit at a normal level for video mixing.
  for (let i = 0; i < samples.length; i++) pcm.writeInt16LE(Math.max(-1, Math.min(1, samples[i] * 8)) * 32767, i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, pcm]));
}
wav(tones([523, 659, 784], 0.05, 0.09, 0.08), 'sfx-blip.wav');
wav(tones([660, 880], 0.05, 0.09, 0.08), 'sfx-done.wav');
wav(tones([880, 660, 880, 660, 1046, 784, 1046], 0.09, 0.13, 0.11), 'sfx-alarm.wav');
console.log(fs.readdirSync('.').join('\n'));
