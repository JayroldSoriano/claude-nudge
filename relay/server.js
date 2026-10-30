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
          // The approval hook already emitted this request with the tool details and is still waiting on it
          // (the terminal shows its prompt a few seconds later, in parallel): skip the duplicate.
          if (pending.get(base.session_id) === 'permission' && Date.now() - (lastPermission.get(base.session_id) || 0) < 600000) return null;
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
    if (msg.type === 'decision' && msg.decision) recordDecision(msg.decision);
    if (msg.type === 'command' && msg.command === 'test') {
      const events = testEvents(msg.kind || 'approve', Number(msg.phoneDelay) || 0, null, msg.agent || DEFAULT_AGENT) || [];
      for (const event of events) emit(event);
      if (events.length) log(`test "${msg.kind}" requested from a phone`);
    }
  };
  ws.onclose = () => { if (cloudWs === ws) { cloudWs = null; log('cloud link closed'); } };
  ws.onerror = () => { try { ws.close(); } catch (_) {} };
}
setInterval(connectCloud, 5000).unref();
setInterval(() => { if (cloudWs && cloudWs.readyState === 1) { try { cloudWs.send(JSON.stringify({ type: 'ping' })); } catch (_) {} } }, PING_INTERVAL_MS).unref();
connectCloud();

// ---------- decisions ----------
// A decision for the approval hook: from the bubble (POST /decision) or, when paired, from the phone via the cloud.
// Keys carry the agent (a decision without one is Claude Code's, the only agent the bubble and phone answer).
const waiters = new Map(); // key -> Set of wake functions, one per open GET /decision long poll
const lastPoll = new Map(); // key -> ts a long poll last ended with nothing (the hook re-polls right away)
const hookGone = new Map(); // key -> ts the approval hook hung up mid-poll without a decision (answered in the terminal)
const decisionKey = (d) => `${sessionKey(d.agent, d.session_id)}:${d.tool_use_id}`;

// The short label the phone shows on a decided card: "allow", "Yes", or "A, B" for several answers.
function decisionLabel(d) {
  if (d.behavior) return d.behavior;
  const labels = d.answers ? Object.values(d.answers).flat().filter(Boolean) : [];
  return labels.length ? labels.join(', ') : String(d.answer || '');
}

// Stores a decision once (the cloud echoes the bubble's own decision back), marks its event in `recent` so a
// reconnecting extension sees it answered, wakes the waiting hook and tells every extension socket.
// An incomplete one (see incomplete()) is dropped, so it never takes the slot or settles anyone's bubble.
function recordDecision(d) {
  if (!d || !d.session_id || !d.tool_use_id) return false;
  const key = decisionKey(d);
  if (decisions.has(key)) return false;
  const req = requests.get(key);
  const bad = req && incomplete(req, d);
  if (bad) { log(`ignored a decision by ${d.by || '?'} for ${d.tool_use_id}: ${bad}`); return false; }
  decisions.set(key, d);
  const skey = sessionKey(d.agent, d.session_id);
  ctx.lastDecided.set(skey, Date.now()); // the terminal's permission_prompt may still arrive: the adapter skips it
  capped(ctx.lastDecided, 300);
  stats.finish(skey, d.by === 'phone' ? 'phone' : 'bubble');
  capped(decisions, 200);
  lastPoll.delete(key);
  const ev = recent.find((e) => e.tool_use_id && decisionKey(e) === key);
  if (ev) { ev.decided = decisionLabel(d); ev.decision = d; }
  for (const wake of waiters.get(key) || []) wake(d);
  const frame = encodeFrame(JSON.stringify({ type: 'decision', decision: d }));
  for (const s of sockets) safeWrite(s, frame);
  log(`decision ${decisionLabel(d)} by ${d.by || '?'} for ${d.tool_use_id} -> ${sockets.size} client(s)`);
  return true;
}

// True while the approval hook is long-polling this key (between two polls counts too).
function hookWaiting(key) {
  return waiters.has(key) || Date.now() - (lastPoll.get(key) || 0) < 5000;
}

// The approval hook hung up mid-poll with no decision: Claude Code killed it because the question or permission was
// answered in the terminal (a Deny there fires no PostToolUse, so nothing else would tell us). Unless it re-polls,
// emit a `resolved` for its session, which takes the nudge away and closes the wait in the stats as "terminal".
// Skipped when the session has moved on to a newer request since.
function onHookGone(key) {
  if (decisions.has(key) || hookWaiting(key)) return;
  hookGone.set(key, Date.now());
  capped(hookGone, 200);
  const ev = requests.get(key);
  if (!ev) return;
  const skey = sessionKey(ev.agent, ev.session_id);
  if (waitingOn.get(skey) !== ev.id) return;
  ctx.pending.delete(skey);
  log(`approval hook for ${ev.tool_use_id} went away: answered in the terminal`);
  emit({ ...ctx.base({ session_id: ev.session_id, cwd: ev.cwd, hook_event_name: 'ApprovalHookGone' }, ev.agent), kind: 'resolved', title: 'Resolved', message: '', tool_use_id: ev.tool_use_id });
}

// Resolves with the decision, or null after waitMs. `cancel()` ends it early (the hook went away).
function awaitDecision(key, sessionId, toolUseId, waitMs) {
  if (decisions.has(key)) return { promise: Promise.resolve(decisions.get(key)), cancel() {} };
  const ac = new AbortController();
  let finish;
  const promise = new Promise((resolve) => {
    let done = false;
    const set = waiters.get(key) || new Set();
    finish = (d, timedOut, gone) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      ac.abort();
      set.delete(finish);
      if (!set.size) waiters.delete(key);
      if (timedOut) {
        lastPoll.set(key, Date.now());
        for (const [k, t] of lastPoll) if (Date.now() - t > 60000) lastPoll.delete(k);
      }
      if (gone && !d) {
        lastPoll.delete(key); // it is not between two polls: it is gone, unless it polls again within the grace
        setTimeout(() => onHookGone(key), 1500);
      }
      resolve(d || null);
    };
    set.add(finish);
    waiters.set(key, set);
    const timer = setTimeout(() => finish(null, true), waitMs);
    // An incomplete phone answer is not recorded; this waiter then just runs to its timeout.
    pollCloud(sessionId, toolUseId, ac.signal).then((d) => { if (d && (recordDecision(d) || decisions.has(key))) finish(decisions.get(key)); });
  });
  return { promise, cancel: () => finish(null, false, true) };
}

// When paired, also long-poll the hosted relay: catches a phone decision made while the cloud socket was down.
async function pollCloud(sessionId, toolUseId, signal) {
  const c = cloud();
  if (!c || typeof fetch !== 'function') return null;
  while (!signal.aborted) {
    try {
      const r = await fetch(`${c.relay}/decisions?session_id=${encodeURIComponent(sessionId)}&tool_use_id=${encodeURIComponent(toolUseId)}&wait=25000`, {
        headers: { Authorization: `Bearer ${c.laptopToken}` },
        signal,
      });
      if (r.status === 200) {
        const d = (await r.json()).decision;
        if (d) return d;
      } else if (r.status !== 204) {
        await new Promise((res) => setTimeout(res, 2000));
      }
    } catch (e) {
      if (signal.aborted) return null;
      log(`cloud poll failed: ${e.message}`);
      await new Promise((res) => setTimeout(res, 2000));
    }
  }
  return null;
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
    const key = decisionKey({ agent: url.searchParams.get('agent'), session_id: sid, tool_use_id: tid });
    const poll = awaitDecision(key, sid, tid, wait);
    res.on('close', poll.cancel); // the hook was killed (answered in the terminal): see onHookGone()
    poll.promise.then((d) => {
      if (res.writableEnded || res.destroyed) return;
      if (d) return json(200, { decision: d });
      res.writeHead(204); res.end();
    });
    return;
  }
  // A decision made in the bubble (the extension, holding the secret). Mirrored to the cloud so phones dismiss it.
  if (req.method === 'POST' && url.pathname === '/decision') {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { body += c; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      let d;
      try { d = JSON.parse(body); } catch (_) { return json(400, { error: 'invalid json' }); }
      const hasAnswers = d && d.answers && typeof d.answers === 'object' && !Array.isArray(d.answers);
      if (!d || typeof d !== 'object' || !d.session_id || !d.tool_use_id || !(d.behavior === 'allow' || d.behavior === 'deny' || d.answer || hasAnswers)) return json(400, { error: 'session_id, tool_use_id and behavior|answer|answers required' });
      const agent = d.agent && d.agent !== DEFAULT_AGENT ? String(d.agent) : '';
      const key = decisionKey({ agent, session_id: d.session_id, tool_use_id: d.tool_use_id });
      if (decisions.has(key)) {
        const by = decisions.get(key).by;
        return json(409, { error: by === 'phone' ? 'Already answered on your phone' : 'Already answered', by, decided: decisionLabel(decisions.get(key)) });
      }
      const asked = requests.get(key);
      const bad = asked && incomplete(asked, d);
      if (bad) return json(400, { error: bad[0].toUpperCase() + bad.slice(1) });
      // Test and preview nudges have no hook behind them; everything else needs nudge-approve.js still waiting.
      // When it isn't, the bubble settles (by: 'terminal') instead of offering buttons that can no longer work.
      if (!isTestSession(d.session_id) && !hookWaiting(key)) {
        return json(409, { error: hookGone.has(key) ? 'Answered in the terminal' : 'Claude stopped waiting here. Answer in the terminal.', by: 'terminal' });
      }
      const decision = {
        eventId: Number(d.eventId) || 0, session_id: String(d.session_id), tool_use_id: String(d.tool_use_id), ...(agent ? { agent } : {}),
        ...(d.behavior ? { behavior: d.behavior } : {}), ...(d.answer ? { answer: String(d.answer) } : {}), ...(hasAnswers ? { answers: d.answers } : {}),
        by: 'browser', ts: Date.now(),
      };
      recordDecision(decision);
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
