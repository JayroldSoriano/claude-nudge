#!/usr/bin/env node
'use strict';
// Nudge relay: receives Claude Code hook payloads over HTTP (from hooks/nudge-hook.sh)
// and pushes normalized events to the Chrome extension over a WebSocket.
// Zero dependencies. Binds to 127.0.0.1 only.

const http = require('http');
const crypto = require('crypto');
const path = require('path');

const HOST = '127.0.0.1';
const PORT = Number(process.env.CLAUDE_NUDGE_PORT || 47831);
const MAX_RECENT = 25;
const PING_INTERVAL_MS = 20000; // keeps the MV3 service worker alive (Chrome extends SW life on WS activity)

const recent = [];
const sockets = new Set();
const pending = new Map(); // session_id -> kind of the nudge Claude is blocked on (question/permission)
let nextId = 1;

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
      pending.set(base.session_id, 'question');
      return {
        ...base,
        kind: 'question',
        title: 'Claude has a question',
        message: clip(text || 'Claude is waiting for your answer.', 1200),
        options: questions.map((q) => ({
          header: q.header || '',
          choices: (q.options || []).map((o) => o.label).filter(Boolean),
        })),
      };
    }

    case 'Notification': {
      switch (hook.notification_type) {
        case 'permission_prompt':
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

function emit(event) {
  recent.push(event);
  if (recent.length > MAX_RECENT) recent.shift();
  const frame = encodeFrame(JSON.stringify({ type: 'event', event }));
  for (const s of sockets) safeWrite(s, frame);
  log(`event #${event.id} ${event.kind} [${event.project}] -> ${sockets.size} client(s)`);
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
    return json(200, { ok: true, clients: sockets.size, events: recent.length, port: PORT });
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
        const common = { cwd: process.cwd(), session_id: 'test' };
        const samples = {
          question: { ...common, hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion',
            tool_input: { questions: [{ header: 'Approach', question: 'This is a test nudge. Which approach should I take for the auth refactor?', options: [{ label: 'Keep sessions' }, { label: 'Move to JWT' }] }] } },
          permission: { ...common, hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'Claude needs your permission to use Bash' },
          done: { ...common, hook_event_name: 'Stop', last_assistant_message: 'Test run finished. All 42 tests pass and the branch is ready for review.' },
          resolved: { ...common, hook_event_name: 'UserPromptSubmit' },
        };
        if (!samples[kind]) return json(400, { error: 'unknown kind' });
        const event = normalize(samples[kind]);
        if (event) emit(event);
        return json(200, { ok: true, emitted: !!event });
      }
      let hook;
      try { hook = JSON.parse(body); } catch (_) { return json(400, { error: 'invalid json' }); }
      const event = normalize(hook);
      if (event) emit(event);
      else log(`ignored ${hook.hook_event_name || '?'}${hook.notification_type ? '/' + hook.notification_type : ''}${hook.tool_name ? '/' + hook.tool_name : ''}`);
      return json(200, { ok: true, emitted: !!event });
    });
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
