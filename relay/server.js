#!/usr/bin/env node
'use strict';
// Nudge relay: receives Claude Code hook payloads over HTTP (from hooks/nudge-hook.sh)
// and pushes normalized events to the Chrome extension over a WebSocket.
// Zero dependencies. Binds to 127.0.0.1 only.

const http = require('http');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');
const pairing = require('./pairing');

const HOST = '127.0.0.1';
const PORT = Number(process.env.CLAUDE_NUDGE_PORT || 47831);
const MAX_RECENT = 25;
const PING_INTERVAL_MS = 20000; // keeps the MV3 service worker alive (Chrome extends SW life on WS activity)

const recent = [];
const sockets = new Set();
const pending = new Map(); // session_id -> kind of the nudge Claude is blocked on (question/permission)
// Time-based so ids stay unique across relay restarts (the hosted relay keeps events from earlier runs).
let nextId = Date.now();

// Optional hosted relay (phone app). Written by `npx nudge-mascot pair`; read on every use so pairing
// takes effect without a restart. Nothing here runs unless the file exists.
const CLOUD_FILE = process.env.CLAUDE_NUDGE_CLOUD || path.join(os.homedir(), '.claude-nudge', 'cloud.json');
const decisions = new Map(); // `${session_id}:${tool_use_id}` -> decision from the bubble or the phone
const lastPermission = new Map(); // session_id -> ts of the last PermissionRequest event (dedupes the Notification that follows it)

function cloud() {
  try {
    const c = JSON.parse(fs.readFileSync(CLOUD_FILE, 'utf8'));
    return c && c.relay && c.laptopToken ? c : null;
  } catch (_) { return null; }
}

// Both nudge-hook.sh and nudge-approve.js post the same PreToolUse payload; emit it once.
const seenToolUse = new Map(); // tool_use_id -> ts
function isDuplicate(toolUseId) {
  const now = Date.now();
  for (const [k, t] of seenToolUse) if (now - t > 60000) seenToolUse.delete(k);
  if (seenToolUse.has(toolUseId)) return true;
  seenToolUse.set(toolUseId, now);
  return false;
}

function toolSummary(name, input) {
  if (!input || typeof input !== 'object') return '';
  if (name === 'Bash') return input.command || '';
  if (input.file_path) return input.file_path;
  if (input.url) return input.url;
  if (input.pattern) return input.pattern;
  try { return JSON.stringify(input); } catch (_) { return ''; }
}

// ---------- event normalization ----------

function clip(text, max) {
  text = String(text || '').trim();
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

function normalize(hook) {
  if (!hook || typeof hook !== 'object') return null;
  const base = {
    id: nextId++,
    ts: Date.now(),
    session_id: hook.session_id || '',
    project: hook.cwd ? path.basename(hook.cwd) : '',
    cwd: hook.cwd || '',
    hook_event: hook.hook_event_name || '',
  };

  const resolved = () => {
    pending.delete(base.session_id);
    return { ...base, kind: 'resolved', title: 'Resolved', message: '' };
  };

  switch (hook.hook_event_name) {
    case 'Stop':
      pending.delete(base.session_id);
      return {
        ...base,
        kind: 'done',
        title: 'Claude is done',
        message: clip(hook.last_assistant_message || 'Finished working. Come take a look.', 1200),
      };

    // The user acted in the terminal: answered a question, approved a tool, or typed a prompt.
    case 'UserPromptSubmit':
      return resolved();
    case 'PostToolUse':
      if (hook.tool_name === 'AskUserQuestion' || pending.has(base.session_id)) return resolved();
      return null;

    case 'PreToolUse': {
      if (hook.tool_name !== 'AskUserQuestion') return null;
      const questions = (hook.tool_input && hook.tool_input.questions) || [];
      const text = questions.map((q) => q.question).filter(Boolean).join('\n\n');
      if (hook.tool_use_id && isDuplicate(hook.tool_use_id)) return null;
      pending.set(base.session_id, 'question');
      return {
        ...base,
        kind: 'question',
        title: 'Claude has a question',
        message: clip(text || 'Claude is waiting for your answer.', 1200),
        tool_name: 'AskUserQuestion',
        tool_use_id: hook.tool_use_id || '',
        approvable: !!hook.tool_use_id, // answerable from the phone when the approval hook is waiting
        options: questions.map((q) => ({
          header: q.header || '',
          question: q.question || '',
          multiSelect: !!q.multiSelect,
          choices: (q.options || []).map((o) => o.label).filter(Boolean),
        })),
      };
    }

    // Only arrives when the approval hook is installed (npx nudge-mascot pair). Carries what a phone needs to answer.
    case 'PermissionRequest':
      pending.set(base.session_id, 'permission');
      lastPermission.set(base.session_id, Date.now());
      return {
        ...base,
        kind: 'permission',
        title: 'Claude needs permission',
        message: clip(`${hook.tool_name || 'Tool'}: ${toolSummary(hook.tool_name, hook.tool_input)}`, 600),
        tool_name: hook.tool_name || '',
        tool_use_id: hook.tool_use_id || '',
        approvable: true,
      };

    case 'Notification': {
      switch (hook.notification_type) {
        case 'permission_prompt':
          // The approval hook already emitted this request with the tool details; skip the duplicate.
          if (Date.now() - (lastPermission.get(base.session_id) || 0) < 5000) return null;
          pending.set(base.session_id, 'permission');
          return { ...base, kind: 'permission', title: 'Claude needs permission', message: clip(hook.message || 'Claude is waiting for your approval.', 600) };
        case 'idle_prompt':
          return { ...base, kind: 'idle', title: 'Claude is waiting', message: clip(hook.message || 'Claude is waiting for your input.', 600) };
        case 'agent_needs_input':
          pending.set(base.session_id, 'question');
          return { ...base, kind: 'question', title: 'Claude needs input', message: clip(hook.message || 'Claude is waiting for your input.', 600) };
        case 'agent_completed':
          return { ...base, kind: 'done', title: 'Claude is done', message: clip(hook.message || 'Finished working.', 600) };
        default:
          return null;
      }
    }

    default:
      return null;
  }
}

// A fake hook payload of the given kind, normalized like a real one. `undefined` for an unknown kind.
// phoneDelay=N: the paired phone raises its notification N seconds later (time to lock the screen).
function testEvent(kind, phoneDelay) {
  const common = { cwd: process.cwd(), session_id: 'test' };
  const samples = {
    question: { ...common, hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_use_id: `test-q-${Date.now()}`,
      tool_input: { questions: [{ header: 'Approach', question: 'This is a test nudge. Which approach should I take for the auth refactor?', options: [{ label: 'Keep sessions' }, { label: 'Move to JWT' }] }] } },
    permission: { ...common, hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'Claude needs your permission to use Bash' },
    done: { ...common, hook_event_name: 'Stop', last_assistant_message: 'Test run finished. All 42 tests pass and the branch is ready for review.' },
    resolved: { ...common, hook_event_name: 'UserPromptSubmit' },
    approve: { ...common, hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_use_id: `test-${Date.now()}`, tool_input: { command: 'npm publish --access public' } },
  };
  if (!samples[kind]) return undefined;
  const event = normalize(samples[kind]);
  if (event && phoneDelay > 0) event.notifyAfter = Math.min(phoneDelay, 60);
  return event;
}

function emit(event) {
  recent.push(event);
  if (recent.length > MAX_RECENT) recent.shift();
  const frame = encodeFrame(JSON.stringify({ type: 'event', event }));
  for (const s of sockets) safeWrite(s, frame);
  log(`event #${event.id} ${event.kind} [${event.project}] -> ${sockets.size} client(s)`);
  forward(event);
}

// Mirror the event to the hosted relay when a phone is paired. Fire-and-forget; the bubble never waits on it.
function forward(event) {
  const c = cloud();
  if (!c || typeof fetch !== 'function') return;
  fetch(`${c.relay}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.laptopToken}` },
    body: JSON.stringify({ event }),
    signal: AbortSignal.timeout(5000),
  }).then((r) => { if (!r.ok) log(`cloud rejected event #${event.id}: HTTP ${r.status}`); })
    .catch((e) => log(`cloud forward failed: ${e.message}`));
}

// ---------- hosted relay link ----------
// While paired, keep a WebSocket to the hosted relay: phones' decisions and "run a test nudge" commands arrive
// here, and the hosted relay can tell phones whether this laptop is online. Re-checked every 5 s, so pairing
// or unpairing from the popup takes effect without a restart.
let cloudWs = null, cloudWsToken = null;
function connectCloud() {
  const c = cloud();
  if (!c || typeof WebSocket === 'undefined') {
    if (cloudWs) { try { cloudWs.close(); } catch (_) {} cloudWs = null; cloudWsToken = null; }
    return;
  }
  if (cloudWs && cloudWsToken === c.laptopToken && cloudWs.readyState <= 1) return; // open or connecting
  if (cloudWs) { try { cloudWs.close(); } catch (_) {} }
  cloudWsToken = c.laptopToken;
  const ws = new WebSocket(`${c.relay.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(c.laptopToken)}`);
  cloudWs = ws;
  ws.onopen = () => log(`cloud link up (${c.relay})`);
  ws.onmessage = (m) => {
    let msg;
    try { msg = JSON.parse(String(m.data)); } catch (_) { return; }
    if (msg.type === 'decision' && msg.decision) decisions.set(`${msg.decision.session_id}:${msg.decision.tool_use_id}`, msg.decision);
    if (msg.type === 'command' && msg.command === 'test') {
      const event = testEvent(msg.kind || 'approve', Number(msg.phoneDelay) || 0);
      if (event) { emit(event); log(`test "${msg.kind}" requested from a phone`); }
    }
  };
  ws.onclose = () => { if (cloudWs === ws) { cloudWs = null; log('cloud link closed'); } };
  ws.onerror = () => { try { ws.close(); } catch (_) {} };
}
setInterval(connectCloud, 5000).unref();
setInterval(() => { if (cloudWs && cloudWs.readyState === 1) { try { cloudWs.send(JSON.stringify({ type: 'ping' })); } catch (_) {} } }, PING_INTERVAL_MS).unref();
connectCloud();

// A decision for the approval hook: from the bubble (POST /decision) or, when paired, from the phone via the cloud.
async function awaitDecision(sessionId, toolUseId, waitMs) {
  const key = `${sessionId}:${toolUseId}`;
  const deadline = Date.now() + waitMs;
  const c = cloud();
  for (;;) {
    if (decisions.has(key)) return decisions.get(key);
    const left = deadline - Date.now();
    if (left <= 0) return null;
    if (c && typeof fetch === 'function') {
      try {
        const wait = Math.min(25000, left);
        const r = await fetch(`${c.relay}/decisions?session_id=${encodeURIComponent(sessionId)}&tool_use_id=${encodeURIComponent(toolUseId)}&wait=${wait}`, {
          headers: { Authorization: `Bearer ${c.laptopToken}` },
          signal: AbortSignal.timeout(wait + 5000),
        });
        if (r.status === 200) {
          const d = (await r.json()).decision;
          if (d) { decisions.set(key, d); return d; }
        }
      } catch (e) {
        log(`cloud poll failed: ${e.message}`);
        await new Promise((res) => setTimeout(res, 2000));
      }
    } else {
      await new Promise((res) => setTimeout(res, 500));
    }
  }
}

// ---------- minimal WebSocket server ----------

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function encodeFrame(data, opcode = 0x1) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(String(data));
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x80 | opcode, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function safeWrite(socket, buf) {
  try {
    if (!socket.destroyed) socket.write(buf);
  } catch (_) {
    sockets.delete(socket);
  }
}

// Parses complete client frames from socket._buf; returns when more data is needed.
function handleFrames(socket) {
  for (;;) {
    const buf = socket._buf;
    if (buf.length < 2) return;
    const opcode = buf[0] & 0x0f;
    const masked = (buf[1] & 0x80) !== 0;
    let len = buf[1] & 0x7f;
    let offset = 2;
    if (len === 126) {
      if (buf.length < 4) return;
      len = buf.readUInt16BE(2);
      offset = 4;
    } else if (len === 127) {
      if (buf.length < 10) return;
      len = Number(buf.readBigUInt64BE(2));
      offset = 10;
    }
    const maskLen = masked ? 4 : 0;
    if (buf.length < offset + maskLen + len) return;
    const mask = masked ? buf.subarray(offset, offset + 4) : null;
    const payload = Buffer.from(buf.subarray(offset + maskLen, offset + maskLen + len));
    if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
    socket._buf = buf.subarray(offset + maskLen + len);

    if (opcode === 0x8) { // close
      safeWrite(socket, encodeFrame(payload, 0x8));
      socket.end();
      sockets.delete(socket);
      return;
    }
    if (opcode === 0x9) { // ping -> pong
      safeWrite(socket, encodeFrame(payload, 0xa));
    } else if (opcode === 0x1) {
      let msg = null;
      try { msg = JSON.parse(payload.toString('utf8')); } catch (_) {}
      if (msg && msg.type === 'ping') safeWrite(socket, encodeFrame(JSON.stringify({ type: 'pong' })));
    }
  }
}

function isTrustedOrigin(req) {
  // The extension sends chrome-extension://... ; curl sends none. Any web page would send http(s)://...
  const origin = req.headers.origin;
  return !origin || origin.startsWith('chrome-extension://');
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const json = (code, body) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  if (!isTrustedOrigin(req)) return json(403, { error: 'forbidden origin' });

  if (req.method === 'GET' && url.pathname === '/health') {
    return json(200, { ok: true, clients: sockets.size, events: recent.length, port: PORT, cloud: !!cloud() });
  }
  if (req.method === 'GET' && url.pathname === '/events') {
    return json(200, { events: recent });
  }
  if (req.method === 'POST' && (url.pathname === '/hook' || url.pathname === '/test')) {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { body += c; if (body.length > 2e6) req.destroy(); });
    req.on('end', () => {
      if (url.pathname === '/test') {
        const kind = url.searchParams.get('kind') || 'question';
        const event = testEvent(kind, Number(url.searchParams.get('phoneDelay') || 0));
        if (event === undefined) return json(400, { error: 'unknown kind' });
        if (event) emit(event);
        return json(200, { ok: true, emitted: !!event });
      }
      let hook;
      try { hook = JSON.parse(body); } catch (_) { return json(400, { error: 'invalid json' }); }
      const event = normalize(hook);
      if (event) emit(event);
      else log(`ignored ${hook.hook_event_name || '?'}${hook.notification_type ? '/' + hook.notification_type : ''}${hook.tool_name ? '/' + hook.tool_name : ''}`);
      // canDecide tells the approval hook whether anything can answer (a paired phone); otherwise it won't wait.
      const duplicate = !event && !!hook.tool_use_id && seenToolUse.has(hook.tool_use_id);
      return json(200, { ok: true, emitted: !!event, duplicate, canDecide: !!cloud() });
    });
    return;
  }
  // Long poll used by hooks/nudge-approve.js. 200 with the decision, or 204 when `wait` ms pass without one.
  if (req.method === 'GET' && url.pathname === '/decision') {
    const sid = url.searchParams.get('session_id') || '', tid = url.searchParams.get('tool_use_id') || '';
    if (!sid || !tid) return json(400, { error: 'session_id and tool_use_id required' });
    const wait = Math.min(Number(url.searchParams.get('wait') || 0), 30000);
    awaitDecision(sid, tid, wait).then((d) => {
      if (d) return json(200, { decision: d });
      res.writeHead(204); res.end();
    });
    return;
  }
  // A decision made in the bubble (extension only, by the origin check). Mirrored to the cloud so phones dismiss it.
  if (req.method === 'POST' && url.pathname === '/decision') {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { body += c; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      let d;
      try { d = JSON.parse(body); } catch (_) { return json(400, { error: 'invalid json' }); }
      if (!d.session_id || !d.tool_use_id || !(d.behavior === 'allow' || d.behavior === 'deny' || d.answer || d.answers)) return json(400, { error: 'session_id, tool_use_id and behavior|answer|answers required' });
      const decision = { ...d, by: 'browser', ts: Date.now() };
      decisions.set(`${d.session_id}:${d.tool_use_id}`, decision);
      const c = cloud();
      if (c && typeof fetch === 'function') {
        fetch(`${c.relay}/decisions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.laptopToken.replace(/^([a-z2-7]+)\.l/, '$1.b')}` },
          body: JSON.stringify(decision),
          signal: AbortSignal.timeout(5000),
        }).catch(() => {});
      }
      return json(200, { ok: true });
    });
    return;
  }
  // Phone pairing, driven from the extension popup. The relay owns cloud.json and the approval hooks.
  if (req.method === 'POST' && url.pathname === '/pair/start') {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { body += c; if (body.length > 1e4) req.destroy(); });
    req.on('end', () => {
      let relay;
      try { relay = body ? JSON.parse(body).relay : undefined; } catch (_) { /* default relay */ }
      pairing.start(relay)
        .then((r) => { log(`pairing started on ${r.relay} (user ${r.userId})`); json(200, r); })
        .catch((e) => json(502, { error: e.message }));
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/pair/stop') {
    const r = pairing.stop();
    log('pairing removed');
    return json(200, r);
  }
  if (req.method === 'GET' && url.pathname === '/pair/status') {
    pairing.status().then((s) => json(200, s));
    return;
  }
  json(404, { error: 'not found' });
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (req.url !== '/ws' || !key || !isTrustedOrigin(req)) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  socket._buf = Buffer.alloc(0);
  socket.setNoDelay(true);
  sockets.add(socket);
  socket.on('data', (chunk) => {
    socket._buf = Buffer.concat([socket._buf, chunk]);
    handleFrames(socket);
  });
  socket.on('close', () => sockets.delete(socket));
  socket.on('error', () => sockets.delete(socket));
  safeWrite(socket, encodeFrame(JSON.stringify({ type: 'hello', recent: recent.slice(-5) })));
  log(`extension connected (${sockets.size} client(s))`);
});

setInterval(() => {
  const frame = encodeFrame(JSON.stringify({ type: 'ping', ts: Date.now() }));
  for (const s of sockets) safeWrite(s, frame);
}, PING_INTERVAL_MS).unref();

function log(msg) {
  console.log(`[nudge ${new Date().toLocaleTimeString()}] ${msg}`);
}

server.listen(PORT, HOST, () => {
  log(`relay listening on http://${HOST}:${PORT}  (ws://${HOST}:${PORT}/ws)`);
});
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // If another nudge relay already owns the port, exit cleanly so a service manager doesn't restart-loop us.
    http.get({ host: HOST, port: PORT, path: '/health', timeout: 1500 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        let ours = false;
        try { ours = JSON.parse(body).ok === true; } catch (_) {}
        if (ours) { log(`another relay is already running on port ${PORT}; exiting`); process.exit(0); }
        console.error(`[nudge] port ${PORT} is in use by something else. Set CLAUDE_NUDGE_PORT to change it.`);
        process.exit(1);
      });
    }).on('error', () => { console.error(`[nudge] port ${PORT} is in use. Set CLAUDE_NUDGE_PORT to change it.`); process.exit(1); });
    return;
  }
  throw err;
});
