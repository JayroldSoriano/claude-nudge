#!/usr/bin/env node
// Renders launch assets with headless Chrome + ffmpeg (no npm deps):
//   docs/demo.gif, dist/demo.mp4, dist/demo-9x16.mp4   (the 15s escalation demo)
//   dist/store/screenshot-{1..4}.png (1280x800), dist/store/promo-tile.png (440x280), docs/assets/og.png
// Frames are captured deterministically with --virtual-time-budget, one Chrome launch per frame.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CHROME = process.env.CHROME || (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : 'google-chrome');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nudge-assets-'));
const DIST = path.join(ROOT, 'dist', 'store');
fs.mkdirSync(DIST, { recursive: true });
fs.mkdirSync(path.join(ROOT, 'docs', 'assets'), { recursive: true });

const CONTENT_JS = fs.readFileSync(path.join(ROOT, 'extension', 'content.js'), 'utf8');

// A fake feed so the demo looks like doomscrolling. Captions mirror the script in marketing/launch-copy.md.
function scene({ w, h, event, timeline, caption, scroll = 0, endCard = false, bigType = false }) {
  const cards = Array.from({ length: 14 }, (_, i) => `
    <article class="card"><div class="avatar"></div><div class="lines"><i style="width:${30 + (i * 37) % 40}%"></i><i style="width:${60 + (i * 23) % 35}%"></i><i style="width:${40 + (i * 53) % 50}%"></i></div><div class="pic" style="height:${90 + (i * 71) % 120}px"></div></article>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; width: ${w}px; height: ${h}px; overflow: hidden; background: #f3f3f1; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .bar { position: fixed; top: 0; left: 0; right: 0; height: 56px; background: #fff; border-bottom: 1px solid #e3e3e0; display: flex; align-items: center; gap: 12px; padding: 0 20px; z-index: 5; }
    .bar b { font-size: 17px; color: #333; } .bar .pill { width: 36px; height: 36px; border-radius: 50%; background: #d8d8d4; }
    .bar .search { flex: 1; max-width: 420px; height: 34px; border-radius: 17px; background: #ededea; margin-left: 20px; }
    .feed { position: absolute; top: 56px; left: 50%; transform: translate(-50%, -${scroll}px); width: ${bigType ? Math.min(w - 40, 620) : 600}px; padding: 20px 0 100px; }
    .card { background: #fff; border: 1px solid #e3e3e0; border-radius: 14px; padding: 16px; margin-bottom: 14px; display: grid; grid-template-columns: 44px 1fr; gap: 12px 14px; }
    .avatar { width: 44px; height: 44px; border-radius: 50%; background: #d8d8d4; grid-row: span 2; }
    .lines i { display: block; height: 11px; background: #e6e6e2; border-radius: 6px; margin: 7px 0; }
    .pic { background: linear-gradient(135deg, #e9e9e5, #d9d9d4); border-radius: 10px; }
    .caption { position: fixed; top: 84px; left: 50%; transform: translateX(-50%); z-index: 6; background: #1f1d1a; color: #fff; font-weight: 700; font-size: ${bigType ? 40 : 30}px; padding: 12px 22px; border-radius: 14px; white-space: nowrap; }
    .end { position: fixed; inset: 0; z-index: 7; background: #fffdf9; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px; }
    .end h1 { font-size: ${bigType ? 56 : 54}px; margin: 0; letter-spacing: -.02em; color: #1f1d1a; text-align: center; }
    .end code { font: 700 ${bigType ? 34 : 36}px ui-monospace, SFMono-Regular, Menlo, monospace; background: #1f1d1a; color: #fff; padding: 16px 26px; border-radius: 14px; }
    .end p { color: #7a6a5a; font-size: 22px; margin: 0; }
  </style></head><body>
  <div class="bar"><div class="pill"></div><b>feed</b><div class="search"></div></div>
  <div class="feed">${cards}</div>
  ${caption ? `<div class="caption">${caption}</div>` : ''}
  ${endCard ? `<div class="end"><img src="file://${path.join(ROOT, 'extension', 'icons', 'icon128.png')}" width="96" height="96" style="image-rendering:pixelated"><h1>Nudge for Claude Code</h1><code>npx nudge-for-claude-code setup</code><p>Free · open source · local only</p></div>` : ''}
  <script>
    window.chrome = { runtime: { onMessage: { addListener(fn) { window.__l = fn; } }, sendMessage() { return Promise.resolve(); } } };
  </script>
  <script>${CONTENT_JS}</script>
  <script>
    const ev = ${JSON.stringify(event)};
    const send = (m) => window.__l(m, {}, () => {});
    ${timeline.map(([t, msg]) => `setTimeout(() => send(${JSON.stringify(msg)}), ${t});`).join('\n')}
  </script></body></html>`;
}

function shoot(html, out, w, h, budget) {
  const file = path.join(TMP, `${path.basename(out, '.png')}.html`);
  fs.writeFileSync(file, html);
  // Headless Chrome occasionally exits non-zero under load; retry a few times before giving up.
  for (let attempt = 1; ; attempt++) {
    try {
      execFileSync(CHROME, [
        '--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', '--force-device-scale-factor=1',
        // Isolated profile: with the default profile, headless Chrome can write the screenshot and then never exit.
        `--user-data-dir=${path.join(TMP, 'chrome-profile')}`, '--no-first-run', '--no-default-browser-check',
        `--window-size=${w},${h}`, `--virtual-time-budget=${budget}`, `--screenshot=${out}`, `file://${file}`,
      ], { stdio: 'ignore', timeout: 60000 });
      if (fs.existsSync(out)) return;
      throw new Error('no screenshot written');
    } catch (err) {
      if (attempt >= 4) throw err;
      execFileSync('sleep', [String(attempt)]);
    }
  }
}

const QUESTION = {
  id: 1, kind: 'question', title: 'Claude has a question', project: 'my-app', cwd: '/Users/you/my-app', session_id: 'demo',
  message: 'Run the migration against the dev database now? It drops the legacy sessions table.',
  options: [{ header: 'Migration', choices: ['Run it', 'Hold off'] }],
};
const DONE = {
  id: 2, kind: 'done', title: 'Claude is done', project: 'my-app', cwd: '/Users/you/my-app', session_id: 'demo',
  message: 'Migration applied and the auth module refactored. All 42 tests pass. The branch is ready for review.',
};
const SETTINGS = { position: 'bottom-right', snoozeMin: 5 };
const nudge = (event, extra = {}) => ({ type: 'nudge', event, settings: SETTINGS, ...extra });
const esc = (level, waitingMs) => ({ type: 'escalate', id: 1, level, waitingMs, noise: false });

// ---------- demo video (15s): compressed escalation ----------
// Timeline (ms): 0-3000 doomscroll, 3000 nudge, 5000 level 1, 8000 level 2, 11000 level 3, 13000 dismissed, 13000-15000 end card.
function demoFrames(w, h, bigType, fps) {
  const total = 15000;
  const frames = [];
  const base = {
    w, h, bigType, event: QUESTION,
    timeline: [[3000, nudge(QUESTION)], [5000, esc(1, 15000)], [8000, esc(2, 30000)], [11000, esc(3, 60000)], [13000, { type: 'dismiss' }]],
  };
  for (let t = 0; t <= total; t += 1000 / fps) {
    const caption = t < 3000 ? 'You: just checking one thing' : t < 5000 ? 'Claude: hey' : t < 8000 ? 'Claude: hey.' : t < 11000 ? 'Claude: HEY.' : t < 13000 ? 'Claude: !!!' : '';
    const scroll = t < 3000 ? Math.round(t * 0.25) : 750;
    frames.push({ ...base, caption, scroll, endCard: t >= 13000, budget: Math.max(100, Math.round(t)) });
  }
  return frames;
}

function renderVideo(name, w, h, bigType, fps) {
  const dir = path.join(TMP, name);
  fs.mkdirSync(dir, { recursive: true });
  const frames = demoFrames(w, h, bigType, fps);
  frames.forEach((f, i) => {
    const out = path.join(dir, `f${String(i).padStart(4, '0')}.png`);
    shoot(scene(f), out, w, h, f.budget);
    process.stdout.write(`\r${name}: frame ${i + 1}/${frames.length}`);
  });
  process.stdout.write('\n');
  return { dir, fps };
}

function ffmpeg(args) { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' }); }

const only = process.argv[2]; // "video" | "stills" | undefined (both)

if (!only || only === 'stills') {
  // Web Store screenshots, 1280x800.
  shoot(scene({ w: 1280, h: 800, event: QUESTION, timeline: [[0, nudge(QUESTION)]], scroll: 300 }), path.join(DIST, 'screenshot-1.png'), 1280, 800, 4500);
  shoot(scene({ w: 1280, h: 800, event: QUESTION, timeline: [[0, nudge(QUESTION)], [200, esc(2, 30000)]], scroll: 300, caption: 'The longer you wait, the harder it tries.' }), path.join(DIST, 'screenshot-2.png'), 1280, 800, 4500);
  shoot(scene({ w: 1280, h: 800, event: DONE, timeline: [[0, nudge(DONE, { expiresAt: Date.now() + 15000 })]], scroll: 300 }), path.join(DIST, 'screenshot-3.png'), 1280, 800, 4500);
  shoot(scene({ w: 1280, h: 800, event: QUESTION, timeline: [[0, nudge(QUESTION)], [200, esc(3, 60000)]], scroll: 300, caption: 'Level 3. You were warned.' }), path.join(DIST, 'screenshot-4.png'), 1280, 800, 4500);
  // Promo tile 440x280 and OG image 1200x630: mascot large, mid-wave, tagline. Mascot only, no bubble.
  const tile = (w, h) => `<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; width: ${w}px; height: ${h}px; overflow: hidden; background: #fffdf9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body::before { content: ""; position: absolute; inset: 0; background: radial-gradient(circle at 78% 60%, #ffe9a8 0, transparent 42%); }
    .t { position: absolute; left: ${Math.round(w * 0.07)}px; top: 50%; transform: translateY(-50%); color: #1f1d1a; }
    .t h1 { margin: 0 0 6px; font-size: ${Math.round(h * 0.17)}px; line-height: 1.05; letter-spacing: -.02em; }
    .t p { margin: 0; font-size: ${Math.round(h * 0.075)}px; font-weight: 600; color: #C98A12; }
    .m { position: absolute; right: ${Math.round(w * 0.08)}px; bottom: ${Math.round(h * 0.12)}px; width: ${Math.round(h * 0.78)}px; height: ${Math.round(h * 0.72)}px; }
    .m svg { width: 100%; height: 100%; overflow: visible; }
    .m .arm-up, .m .brows, .m .frown { opacity: 0; }
    .m .arm-out { opacity: 1; }
    #claude-nudge-host { display: none; }
  </style></head><body>
  <div class="t"><h1>Claude is<br>waiting.</h1><p>Nudge for Claude Code</p></div>
  <div class="m" id="m"></div>
  <script>window.chrome = { runtime: { onMessage: { addListener() {} }, sendMessage() { return Promise.resolve(); } } };</script>
  <script>${CONTENT_JS}</script>
  <script>document.getElementById('m').innerHTML = window.__claudeNudgeMascotSvg;</script>
  </body></html>`;
  shoot(tile(440, 280), path.join(DIST, 'promo-tile.png'), 440, 280, 1500);
  shoot(tile(1200, 630), path.join(ROOT, 'docs', 'assets', 'og.png'), 1200, 630, 1500);
  console.log(`stills -> ${DIST}`);
}

if (!only || only === 'video') {
  const land = renderVideo('landscape', 1280, 800, false, 8);
  const vert = renderVideo('vertical', 720, 1280, true, 8);
  const distRoot = path.join(ROOT, 'dist');
  // GIF via palette for quality; 640px wide keeps it under a few MB for README/X.
  ffmpeg(['-framerate', String(land.fps), '-i', path.join(land.dir, 'f%04d.png'), '-vf', 'scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=3', path.join(ROOT, 'docs', 'demo.gif')]);
  ffmpeg(['-framerate', String(land.fps), '-i', path.join(land.dir, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', '-crf', '20', path.join(distRoot, 'demo.mp4')]);
  ffmpeg(['-framerate', String(vert.fps), '-i', path.join(vert.dir, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', '-crf', '20', path.join(distRoot, 'demo-9x16.mp4')]);
  console.log(`video -> docs/demo.gif, dist/demo.mp4, dist/demo-9x16.mp4`);
}
fs.rmSync(TMP, { recursive: true, force: true });
