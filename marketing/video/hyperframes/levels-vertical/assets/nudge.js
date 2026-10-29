// Nudge for Claude Code: shared rig for the HyperFrames marketing films.
// Builds the 14x13 pixel mascot as crisp SVG rects (same map as extension/content.js),
// the speech bubble, a terminal mock and a feed mock, and schedules deterministic GSAP
// tweens on a paused timeline (finite repeats only; everything is a function of time).
(function () {
  const P = { BODY: '#FFC53D', DARK: '#C98A12', INK: '#2B2118', GLINT: '#FFFFFF', BULB: '#7ED957', BULB_L1: '#FFB020', BULB_L2: '#FF4D4D' };
  const PX = {
    body: [], bulb: [[5,0],[6,0],[7,0]], stalk: [[6,1],[6,2]],
    eyes: [[3,6],[4,6],[3,7],[4,7],[8,6],[9,6],[8,7],[9,7]], glint: [[3,6],[8,6]],
    smile: [[4,9],[5,10],[6,10],[7,10],[8,9]], frown: [[4,10],[5,9],[6,9],[7,9],[8,10]],
    browL: [[3,4],[4,5]], browR: [[9,4],[8,5]], footL: [[3,12],[4,12]], footR: [[8,12],[9,12]],
    armLeft: [[0,7],[0,8]], armUp: [[12,4],[12,5],[12,6],[12,7]], armOut: [[12,7],[12,6],[13,5],[13,4]],
    base: [[2,11],[3,11],[4,11],[5,11],[6,11],[7,11],[8,11],[9,11],[10,11]],
  };
  for (let y = 3; y <= 11; y++) for (let x = 1; x <= 11; x++) {
    if (!((y === 3 || y === 11) && (x === 1 || x === 11))) PX.body.push([x, y]);
  }
  const rects = (pts, fill) => pts.map(([x, y]) => `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`).join('');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Mounts the mascot into `el` (a sized box). Returns the part handles for the rig.
  function mount(el, id) {
    el.innerHTML = `<svg class="nudge-svg" viewBox="0 -1 14 14" shape-rendering="crispEdges" style="width:100%;height:100%;display:block;overflow:visible" aria-hidden="true">
      <g class="n-hop">
        <g class="n-body">
          ${rects(PX.stalk, P.DARK)}
          <g class="n-bulb">${rects(PX.bulb, P.BULB)}</g>
          ${rects(PX.body, P.BODY)}${rects(PX.base, P.DARK)}${rects(PX.armLeft, P.BODY)}
          <g class="n-eyes">${rects(PX.eyes, P.INK)}${rects(PX.glint, P.GLINT)}</g>
          <g class="n-brows" opacity="0">${rects(PX.browL, P.INK)}${rects(PX.browR, P.INK)}</g>
          <g class="n-smile">${rects(PX.smile, P.INK)}</g>
          <g class="n-frown" opacity="0">${rects(PX.frown, P.INK)}</g>
        </g>
        <g class="n-footL">${rects(PX.footL, P.DARK)}</g>
        <g class="n-footR">${rects(PX.footR, P.DARK)}</g>
        <g class="n-armUp">${rects(PX.armUp, P.BODY)}</g>
        <g class="n-armOut" opacity="0">${rects(PX.armOut, P.BODY)}</g>
      </g>
    </svg>`;
    const q = (c) => el.querySelector('.' + c);
    return {
      el, hop: q('n-hop'), body: q('n-body'), bulb: q('n-bulb'), bulbRects: el.querySelectorAll('.n-bulb rect'),
      eyes: q('n-eyes'), brows: q('n-brows'), smile: q('n-smile'), frown: q('n-frown'),
      footL: q('n-footL'), footR: q('n-footR'), armUp: q('n-armUp'), armOut: q('n-armOut'),
    };
  }

  // Idle life over [from, to): bob, blink, bulb glow. Level changes the bulb colour and blink rate.
  function idle(tl, h, from, to, level) {
    level = level || 0;
    const span = Math.max(0.1, to - from);
    const bobs = Math.max(0, Math.floor(span / 0.6) - 1);
    tl.fromTo(h.body, { y: 0 }, { y: -0.35, duration: 0.6, ease: 'sine.inOut', yoyo: true, repeat: bobs }, from);
    const bulbFill = level >= 2 ? P.BULB_L2 : level === 1 ? P.BULB_L1 : P.BULB;
    tl.set(h.bulbRects, { attr: { fill: bulbFill } }, from);
    if (level >= 2) {
      const step = level === 3 ? 0.1 : 0.25;
      for (let t = from; t < to - step; t += step * 2) {
        tl.set(h.bulb, { opacity: 0.15 }, t);
        tl.set(h.bulb, { opacity: 1 }, t + step);
      }
    } else {
      const glows = Math.max(0, Math.floor(span / 1) - 1);
      tl.fromTo(h.bulb, { opacity: 0.55 }, { opacity: 1, duration: 1, ease: 'sine.inOut', yoyo: true, repeat: glows }, from);
    }
    if (level < 2) {
      for (let t = from + 1.3; t < to - 0.3; t += 3.7) {
        tl.fromTo(h.eyes, { scaleY: 1 }, { scaleY: 0.15, duration: 0.07, yoyo: true, repeat: 1, transformOrigin: '50% 50%', ease: 'none' }, t);
      }
    }
  }

  // Wave over [from, to) alternating the two arm frames every `cycle`/2 seconds.
  function wave(tl, h, from, to, cycle) {
    cycle = cycle || 0.5;
    let up = true;
    for (let t = from; t < to; t += cycle / 2) {
      tl.set(h.armUp, { opacity: up ? 1 : 0 }, t);
      tl.set(h.armOut, { opacity: up ? 0 : 1 }, t);
      up = !up;
    }
    tl.set(h.armUp, { opacity: 1 }, to);
    tl.set(h.armOut, { opacity: 0 }, to);
  }

  // Level 2/3 face: squint, brows and frown in, smile out. A short take: anticipation squash, then the new face.
  function annoyed(tl, h, at) {
    tl.fromTo(h.body, { scaleY: 1 }, { scaleY: 0.86, duration: 0.12, ease: 'power2.in', transformOrigin: '50% 100%' }, at);
    tl.to(h.body, { scaleY: 1, duration: 0.25, ease: 'back.out(2)' }, at + 0.12);
    tl.set(h.eyes, { scaleY: 0.5, transformOrigin: '50% 50%' }, at + 0.12);
    tl.set(h.brows, { opacity: 1 }, at + 0.12);
    tl.set(h.frown, { opacity: 1 }, at + 0.12);
    tl.set(h.smile, { opacity: 0 }, at + 0.12);
  }
  function calm(tl, h, at) {
    tl.set(h.eyes, { scaleY: 1 }, at);
    tl.set(h.brows, { opacity: 0 }, at);
    tl.set(h.frown, { opacity: 0 }, at);
    tl.set(h.smile, { opacity: 1 }, at);
  }

  // Foot tapping over [from, to): left foot at `step`, right foot too when `both`.
  function tap(tl, h, from, to, step, both) {
    for (let t = from; t < to - step; t += step) {
      const k = Math.round((t - from) / step);
      tl.set(h.footL, { y: k % 2 ? 0 : -1 }, t);
      if (both) tl.set(h.footR, { y: k % 2 ? -1 : 0 }, t);
    }
    tl.set(h.footL, { y: 0 }, to);
    tl.set(h.footR, { y: 0 }, to);
  }

  // Level 3 fume (jitter) and hop on the hop group, in SVG units (1 unit = one pixel of the sprite).
  function fume(tl, h, from, to) {
    for (let t = from; t < to - 0.15; t += 0.15) {
      tl.set(h.body, { x: Math.round((t - from) / 0.15) % 2 ? 0.3 : -0.3 }, t);
    }
    tl.set(h.body, { x: 0 }, to);
  }
  function hop(tl, h, from, to) {
    for (let t = from; t + 1 <= to + 0.01; t += 1) {
      tl.fromTo(h.hop, { y: 0 }, { y: -2.6, duration: 0.3, ease: 'power2.out' }, t);
      tl.to(h.hop, { y: 0, duration: 0.15, ease: 'power2.in' }, t + 0.3);
      tl.to(h.hop, { y: -1, duration: 0.15, ease: 'power2.out' }, t + 0.45);
      tl.to(h.hop, { y: 0, duration: 0.1, ease: 'power2.in' }, t + 0.6);
    }
  }

  // Speech bubble markup. kind: question | permission | done | idle. level 2+ turns it red.
  function bubble({ title, kind, message, options, hint, level, project, buttons, timer }) {
    kind = kind || 'question'; level = level || 0;
    const opts = (options || []).map((c) => `<span class="nb-opt">${esc(c)}</span>`).join('');
    const btns = buttons === false ? '' : `<span class="nb-spacer"></span>${level > 0 ? '<span class="nb-btn">Snooze 5m</span>' : ''}<span class="nb-btn nb-primary">Got it</span>`;
    return `<div class="nb ${level >= 2 ? 'nb-red' : ''} nb-${kind}">
      <div class="nb-head"><span class="nb-dot nb-dot-${kind}"></span><span class="nb-title">${esc(title)}</span>${project ? `<span class="nb-project">${esc(project)}</span>` : ''}</div>
      <div class="nb-msg">${esc(message)}</div>
      ${opts ? `<div class="nb-opts">${opts}</div>` : ''}
      <div class="nb-foot"><span class="nb-hint">${esc(hint || '')}</span>${btns}</div>
      ${timer ? '<div class="nb-timer"><i></i></div>' : ''}
    </div>`;
  }

  // The shared CSS for bubbles, terminal and feed mocks. Inject once per scene via Nudge.css.
  const css = `
    .nb { position:relative; background:#FFFDF9; color:#1F1D1A; border:3px solid #1F1D1A; border-radius:21px; box-shadow:6px 6px 0 #1F1D1A; padding:18px 21px 15px; font-family:Inter, sans-serif; font-size:27px; line-height:1.4; width:560px; text-align:left; }
    .nb::before { content:""; position:absolute; bottom:-18px; left:calc(50% - 15px); border-width:18px 15px 0 15px; border-style:solid; border-color:#1F1D1A transparent; }
    .nb::after  { content:""; position:absolute; bottom:-12px; left:calc(50% - 12px); border-width:13px 12px 0 12px; border-style:solid; border-color:#FFFDF9 transparent; }
    .nb.nb-red { border-color:#B3261E; box-shadow:6px 6px 0 #B3261E; }
    .nb.nb-red::before { border-color:#B3261E transparent; }
    .nb-head { display:flex; align-items:center; gap:12px; margin-bottom:9px; }
    .nb-dot { width:14px; height:14px; border-radius:50%; background:#FFC53D; flex:none; }
    .nb-dot-done { background:#2E8B57; } .nb-dot-permission { background:#D9A400; } .nb-dot-idle { background:#888; }
    .nb-title { font-weight:700; font-size:25px; letter-spacing:.01em; }
    .nb-project { margin-left:auto; font-size:20px; padding:3px 10px; border-radius:999px; background:#F1E9DF; color:#5A4A3A; }
    .nb-msg { white-space:pre-wrap; word-break:break-word; }
    .nb-opts { display:flex; flex-wrap:wrap; gap:9px; margin-top:12px; }
    .nb-opt { font-size:23px; padding:4px 14px; border:2px solid #1F1D1A; border-radius:999px; background:#FFF3EA; }
    .nb-foot { display:flex; align-items:center; gap:15px; margin-top:15px; }
    .nb-hint { font-size:21px; color:#7A6A5A; flex:1; min-width:0; }
    .nb-red .nb-hint { color:#B3261E; font-weight:600; }
    .nb-spacer { flex:1; }
    .nb-btn { font-size:23px; font-weight:600; border:2px solid #1F1D1A; border-radius:12px; padding:6px 15px; background:#fff; color:#1F1D1A; white-space:nowrap; }
    .nb-btn.nb-primary { background:#FFC53D; }
    .nb-timer { position:absolute; left:15px; right:15px; bottom:6px; height:4px; border-radius:2px; background:#EADFD2; overflow:hidden; }
    .nb-timer > i { display:block; height:100%; background:#FFC53D; transform-origin:left; }

    .term { background:#0F0E0D; color:#E8E2D9; font-family:"JetBrains Mono", monospace; font-size:24px; line-height:1.6; border-radius:18px; border:2px solid #2B2724; box-shadow:0 24px 60px rgba(0,0,0,.35); overflow:hidden; text-align:left; }
    .term-bar { height:44px; background:#1C1917; display:flex; align-items:center; gap:10px; padding:0 18px; border-bottom:1px solid #2B2724; }
    .term-bar i { width:14px; height:14px; border-radius:50%; background:#3A3531; display:block; }
    .term-bar i:nth-child(1){background:#FF5F57} .term-bar i:nth-child(2){background:#FEBC2E} .term-bar i:nth-child(3){background:#28C840}
    .term-bar span { margin-left:auto; font-size:16px; color:#8A827A; }
    .term-body { padding:22px 28px; }
    .term .dim { color:#8A827A; } .term .you { color:#FFC53D; } .term .ok { color:#7ED957; } .term .tool { color:#9EC5FF; } .term .ask { color:#FFC53D; font-weight:700; }
    .term .cursor { display:inline-block; width:13px; height:26px; background:#E8E2D9; vertical-align:-4px; margin-left:4px; }

    .browser { background:#FFFFFF; border-radius:18px; border:2px solid #D9D2C7; box-shadow:0 24px 60px rgba(43,33,24,.18); overflow:hidden; text-align:left; }
    .browser-bar { height:56px; background:#F3EFE8; display:flex; align-items:center; gap:14px; padding:0 18px; border-bottom:1px solid #E2DBD0; }
    .browser-bar i { width:14px; height:14px; border-radius:50%; background:#D4CCC0; display:block; }
    .browser-bar .url { margin-left:12px; flex:1; height:34px; border-radius:10px; background:#fff; border:1px solid #E2DBD0; color:#8A827A; font:17px/34px Inter, sans-serif; padding:0 14px; }
    .feed { padding:28px 0; display:flex; flex-direction:column; align-items:center; gap:22px; }
    .card { width:70%; background:#F6F2EC; border-radius:16px; padding:20px; display:flex; gap:16px; }
    .card .av { width:52px; height:52px; border-radius:50%; background:#DDD5C8; flex:none; }
    .card .ln { height:14px; border-radius:7px; background:#E4DDD2; margin:8px 0; }
    .card .pic { height:150px; border-radius:12px; background:#E9E3DA; margin-top:12px; }
  `;

  // Terminal lines for the demo transcript. Returns HTML.
  function terminal(lines, title) {
    return `<div class="term-bar"><i></i><i></i><i></i><span>${esc(title || 'claude — ~/work/app')}</span></div><div class="term-body">${lines.map((l) => `<div class="tl">${l}</div>`).join('')}</div>`;
  }
  function feed(n) {
    let s = '<div class="browser-bar"><i></i><i></i><i></i><div class="url">feed.example</div></div><div class="feed">';
    for (let i = 0; i < n; i++) s += `<div class="card"><div class="av"></div><div style="flex:1"><div class="ln" style="width:${40 + ((i * 37) % 30)}%"></div><div class="ln" style="width:${70 + ((i * 53) % 25)}%"></div>${i % 2 ? '<div class="pic"></div>' : '<div class="ln" style="width:55%"></div>'}</div></div>`;
    return s + '</div>';
  }

  window.Nudge = { P, PX, mount, idle, wave, annoyed, calm, tap, fume, hop, bubble, css, terminal, feed, esc };
})();
