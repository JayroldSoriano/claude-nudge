// Nudge service worker: keeps a WebSocket to the local relay and forwards
// events to the content script on the tab the user is looking at.
//
// The stage (chrome.storage.session `stage`) holds one nudge per Claude Code session, each with its own escalation
// clock, snooze and dismiss. The bubble shows the selected one; when several sessions are blocked at once it adds a
// row of session pills to switch between them, and the mascot's level follows the most urgent. With one nudge it
// looks exactly as before. Every read-modify-write of the stage goes through serial(), since relay events, tab
// events, the escalation tick and content-script messages all interleave.

const DEFAULTS = {
  port: 47831,
  showDone: true,
  showQuestion: true,
  showPermission: true,
  showIdle: false,
  autoDismissSec: 20,
  position: 'bottom-right',
  sound: false,
  escalation: 'full',       // off | gentle (levels 1-2) | full (levels 1-3)
  escalationSound: true,
  escalateAt1: 15,          // seconds of attentive time before each level
  escalateAt2: 30,
  escalateAt3: 60,
  snoozeMin: 5,
};
const ESCALATING_KINDS = new Set(['question', 'permission']);
const NOISE_EVERY_MS = 60000;

let ws = null;
let connecting = false;
let backoffMs = 1000;
let reconnectTimer = null;

async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...stored };
}

// The relay's per-install secret (~/.claude-nudge/secret), pasted into the popup or the welcome page and kept in
// chrome.storage.local (this device only, never synced). Sent as X-Nudge-Secret on every fetch and as ?secret= on
// the WebSocket. Without it the relay answers 401 and the socket only says it is locked.
async function getSecret() {
  const { relaySecret = '' } = await chrome.storage.local.get('relaySecret');
  return relaySecret;
}

// fetch() against the local relay, with the secret.
async function relayFetch(path, init = {}) {
  const [{ port }, secret] = await Promise.all([getSettings(), getSecret()]);
  return fetch(`http://127.0.0.1:${port}${path}`, { ...init, headers: { ...(init.headers || {}), 'X-Nudge-Secret': secret } });
}

// relayStatus: connected | locked (relay up, code missing or wrong) | disconnected
async function setStatus(status) {
  await chrome.storage.local.set({ relayStatus: status, relayStatusTs: Date.now() });
  chrome.action.setBadgeBackgroundColor({ color: status === 'connected' ? '#2e8b57' : status === 'locked' ? '#d9a400' : '#9a9a9a' });
  chrome.action.setBadgeText({ text: status === 'connected' ? '' : status === 'locked' ? '!' : '·' });
}

// The popup's or the welcome page's Connect: checks the code against the relay before keeping it.
async function saveSecret(code) {
  code = String(code || '').trim();
  if (!code) return { ok: false, error: 'Paste the code first.' };
  const { port } = await getSettings();
  let res;
  try {
    res = await fetch(`http://127.0.0.1:${port}/stats?range=day`, { headers: { 'X-Nudge-Secret': code }, signal: AbortSignal.timeout(5000) });
  } catch (_) {
    return { ok: false, error: 'Relay offline. Run npx nudge-mascot setup first.' };
  }
  if (res.status === 401) return { ok: false, error: "That code doesn't match. Run npx nudge-mascot status and copy the code it prints." };
  await chrome.storage.local.set({ relaySecret: code }); // storage.onChanged reconnects with it
  return { ok: true };
}

async function connect() {
  if (connecting) return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  connecting = true;
  let port, secret;
  try {
    [{ port }, secret] = await Promise.all([getSettings(), getSecret()]);
    ws = new WebSocket(`ws://127.0.0.1:${port}/ws${secret ? `?secret=${encodeURIComponent(secret)}` : ''}`);
  } catch (e) {
    connecting = false;
    scheduleReconnect();
    return;
  }
  connecting = false;
  const sock = ws;
  sock.onopen = () => {
    backoffMs = 1000;
    setStatus('connected'); // until a locked hello says otherwise
  };
  sock.onmessage = (evt) => {
    let msg;
    try { msg = JSON.parse(evt.data); } catch (_) { return; }
    if (msg.type === 'event') handleEvent(msg.event);
    else if (msg.type === 'decision') handleDecision(msg.decision);
    else if (msg.type === 'hello') {
      // Locked: the relay is up but wants the code. The socket stays open (and silent) until the code is saved.
      if (msg.locked) setStatus('locked');
      else handleHello(msg);
    }
    else if (msg.type === 'ping') { try { sock.send(JSON.stringify({ type: 'ping' })); } catch (_) {} }
  };
  // A socket replaced on purpose (port or code changed, Reconnect) closes late: it must not clear its successor.
  sock.onclose = () => { if (ws !== sock) return; ws = null; setStatus('disconnected'); scheduleReconnect(); };
  sock.onerror = () => { try { sock.close(); } catch (_) {} };
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connect, backoffMs);
  backoffMs = Math.min(backoffMs * 2, 30000);
}

// ---------- the stage ----------
const emptyStage = () => ({ nudges: {}, selected: null, shownTabs: [], level: 0, lastNoiseAt: 0 });
// The stage keys nudges by agent and session (the relay's sessionKey), so two agents sharing a session id stay apart.
const sidOf = (event) => `${event.agent || 'claude-code'}:${event.session_id || '_'}`;
// A request's key, as the relay keys decisions: `${agent}:${session_id}:${tool_use_id}`.
const requestKey = (agent, sessionId, toolUseId) => `${agent || 'claude-code'}:${sessionId}:${toolUseId}`;

let chain = Promise.resolve();
function serial(fn) {
  const run = chain.then(fn);
  chain = run.catch(() => {});
  return run;
}

async function getStage() {
  const { stage } = await chrome.storage.session.get('stage');
  const s = stage || emptyStage();
  // "done" and "idle" nudges expire; the content script counts down on its own, this just forgets them.
  let pruned = false;
  for (const [sid, n] of Object.entries(s.nudges)) {
    if (n.expiresAt && n.expiresAt <= Date.now()) { delete s.nudges[sid]; pruned = true; }
  }
  if (pruned) await refreshTabs(s);
  return s;
}

async function setStage(s) {
  await chrome.storage.session.set({ stage: s });
}

const findById = (s, id) => Object.values(s.nudges).find((n) => n.event.id === id) || null;
// Nudges on screen (not snoozed), oldest first: the order of the session pills.
const visible = (s) => Object.values(s.nudges).filter((n) => !n.snoozedUntil).sort((a, b) => (a.event.ts || 0) - (b.event.ts || 0));
// Highest level, then the longest wait.
const mostUrgent = (list) => list.reduce((top, n) => (!top || (n.level || 0) > (top.level || 0)
  || ((n.level || 0) === (top.level || 0) && (n.attentiveMs || 0) > (top.attentiveMs || 0)) ? n : top), null);

// The nudge the bubble shows; moves the selection off a snoozed or removed one. null when nothing is visible.
function selectedNudge(s) {
  const vis = visible(s);
  if (!vis.length) return null;
  let n = s.nudges[s.selected];
  if (!n || n.snoozedUntil) { n = mostUrgent(vis); s.selected = sidOf(n.event); }
  return n;
}

// What a tab renders. `sessions` is empty with a single nudge (no switcher); `quiet` skips the sound and pop.
function payloadFor(s, quiet = false) {
  const n = selectedNudge(s);
  const vis = visible(s);
  const top = mostUrgent(vis);
  return {
    type: 'nudge', event: n.event, settings: n.settings, expiresAt: n.expiresAt,
    level: top.level || 0, waitingMs: top.attentiveMs || 0, quiet,
    sessions: vis.length > 1 ? vis.map((v) => ({
      key: sidOf(v.event), id: v.event.id, project: v.event.project || '', cwd: v.event.cwd || '',
      kind: v.event.kind, ts: v.event.ts, level: v.level || 0,
    })) : [],
  };
}

// After nudges were added, removed or switched: saves the stage and re-renders every tab showing it, quietly,
// or takes Nudge away from them when nothing is left to show.
async function refreshTabs(s, { exceptTab } = {}) {
  if (!selectedNudge(s)) {
    for (const tabId of s.shownTabs) if (tabId !== exceptTab) chrome.tabs.sendMessage(tabId, { type: 'dismiss' }).catch(() => {});
    s.shownTabs = [];
    await setStage(s);
    return;
  }
  await setStage(s);
  const payload = payloadFor(s, true);
  for (const tabId of s.shownTabs) if (tabId !== exceptTab) chrome.tabs.sendMessage(tabId, payload).catch(() => {});
}

async function handleEvent(event) {
  const settings = await getSettings();
  return serial(async () => {
    const s = await getStage();
    const sid = sidOf(event);
    if (event.kind === 'resolved') {
      // The user acted in the terminal for this session: take its nudge away everywhere. A resolved that names a
      // request (the approval hook went away) only takes that request's nudge.
      const n = s.nudges[sid];
      if (n && (!event.tool_use_id || n.event.tool_use_id === event.tool_use_id)) { delete s.nudges[sid]; await refreshTabs(s); }
      return;
    }
    const allowed = {
      done: settings.showDone,
      question: settings.showQuestion,
      permission: settings.showPermission,
      idle: settings.showIdle,
    }[event.kind];
    if (!allowed || event.decided) return;

    // A blocking nudge (question/permission) keeps the stage. A "done" from another session
    // goes to a system notification instead of replacing it.
    const blocking = ESCALATING_KINDS.has(event.kind);
    if (!blocking && Object.values(s.nudges).some((n) => ESCALATING_KINDS.has(n.event.kind) && sidOf(n.event) !== sid)) {
      if (s.nudges[sid]) { delete s.nudges[sid]; await refreshTabs(s); } // this session isn't waiting any more
      showSystemNotification(event);
      return;
    }

    const { recentEvents = [] } = await chrome.storage.local.get('recentEvents');
    recentEvents.push(event);
    await chrome.storage.local.set({ recentEvents: recentEvents.slice(-10) });

    // A "done"/"idle" replaces whatever is on stage; a question/permission replaces its own session's nudge and any
    // "done", and joins other sessions' blocking nudges (the session switcher).
    for (const [k, n] of Object.entries(s.nudges)) if (!blocking || k === sid || !ESCALATING_KINDS.has(n.event.kind)) delete s.nudges[k];
    if (!Object.keys(s.nudges).length) { s.level = 0; s.lastNoiseAt = 0; }
    // The active nudge follows the user across tabs until dismissed or expired.
    const autoSec = event.kind === 'done' || event.kind === 'idle' ? Number(settings.autoDismissSec) : 0;
    s.nudges[sid] = {
      event,
      settings,
      expiresAt: autoSec > 0 ? Date.now() + autoSec * 1000 : null,
      level: 0,
      attentiveMs: 0,
      snoozedUntil: null,
    };
    s.selected = sid;
    await setStage(s);

    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const shown = !!(tab && tab.id) && await showInTab(tab.id, s);
    if (!shown) showSystemNotification(event);
    // Other tabs still showing the stage switch to it too, without a sound.
    const payload = payloadFor(s, true);
    for (const tabId of s.shownTabs) if (!tab || tabId !== tab.id) chrome.tabs.sendMessage(tabId, payload).catch(() => {});
  });
}

// ---------- reply from the bubble ----------
// The content script sends {type:'decide'}; we POST it to the relay, which wakes the approval hook and mirrors it
// to a paired phone. Decisions made elsewhere (the phone) arrive as {type:'decision'} frames on the relay socket.
const deciding = new Set(); // requestKey()s this worker is posting; their echo from the relay is ignored
const sameRequest = (ev, d) => !!(ev && d && ev.tool_use_id && requestKey(ev.agent, ev.session_id, ev.tool_use_id) === requestKey(d.agent, d.session_id, d.tool_use_id));
const SETTLE_MS = 1700; // the bubble shows "Sent to Claude" for 1.5 s; then the next session's nudge takes its place
const isTestSession = (sid) => /^test(-|$)/.test(sid || '');

async function decide(msg, senderTabId) {
  const key = requestKey(msg.agent, msg.session_id, msg.tool_use_id);
  const body = { session_id: msg.session_id, tool_use_id: msg.tool_use_id, eventId: msg.id };
  if (msg.agent && msg.agent !== 'claude-code') body.agent = msg.agent;
  if (msg.behavior === 'allow' || msg.behavior === 'deny') body.behavior = msg.behavior;
  if (msg.answers) body.answers = msg.answers;
  if (msg.answer) body.answer = msg.answer;
  deciding.add(key);
  let res, out;
  try {
    res = await relayFetch('/decision', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
    });
    out = await res.json().catch(() => ({}));
  } catch (_) {
    deciding.delete(key);
    // A preview has no hook behind it: with the relay down there is nothing to send to, so just settle it here.
    if (isTestSession(msg.session_id)) { await removeAnswered(msg.id, senderTabId); return { ok: false, settled: 'Preview answered (relay offline)' }; }
    return { ok: false, error: 'Relay offline. Answer in the terminal.' };
  }
  setTimeout(() => deciding.delete(key), 10000);
  if (res.status === 401) { deciding.delete(key); setStatus('locked'); return { ok: false, error: 'Nudge needs its connection code: open its popup and paste the code from npx nudge-mascot status.' }; }
  // 409 with `by`: someone answered first (usually the phone), or the terminal did (by: 'terminal', the approval hook
  // is gone). Settle like a remote decision, not an error.
  const answeredElsewhere = res.status === 409 && out.by;
  if (!res.ok && !answeredElsewhere) { deciding.delete(key); return { ok: false, error: out.error || `Relay answered HTTP ${res.status}` }; }
  await removeAnswered(msg.id, senderTabId);
  return answeredElsewhere ? { ok: false, settled: out.error } : { ok: true };
}

// The nudge was answered from this tab: other tabs move on right away; the one that answered settles first, then
// shows the next session's nudge.
function removeAnswered(id, senderTabId) {
  return serial(async () => {
    const s = await getStage();
    const n = findById(s, id);
    if (!n) return;
    delete s.nudges[sidOf(n.event)];
    await refreshTabs(s, { exceptTab: senderTabId });
    if (selectedNudge(s) && senderTabId != null) setTimeout(() => repaint([senderTabId]), SETTLE_MS);
  });
}

// Re-sends the stage to these tabs (default: every tab showing it), quietly.
function repaint(tabIds) {
  return serial(async () => {
    const s = await getStage();
    if (!selectedNudge(s)) return;
    const payload = payloadFor(s, true);
    for (const tabId of tabIds || s.shownTabs) chrome.tabs.sendMessage(tabId, payload).catch(() => {});
  });
}

// Answered somewhere else: every tab showing it flashes the note, then dismisses (or moves to the next session).
function handleDecision(d) {
  if (!d || deciding.has(requestKey(d.agent, d.session_id, d.tool_use_id))) return;
  return serial(async () => {
    const s = await getStage();
    const n = Object.values(s.nudges).find((v) => sameRequest(v.event, d));
    if (!n) return;
    const wasShown = s.selected === sidOf(n.event);
    delete s.nudges[sidOf(n.event)];
    if (!wasShown) { await refreshTabs(s); return; } // only its pill goes away
    const text = d.by === 'phone' ? 'Answered on your phone' : 'Answered in another window';
    for (const tabId of s.shownTabs) chrome.tabs.sendMessage(tabId, { type: 'settled', id: n.event.id, text }).catch(() => {});
    if (selectedNudge(s)) { await setStage(s); setTimeout(() => repaint(), SETTLE_MS); }
    else { s.shownTabs = []; await setStage(s); } // the tabs dismiss themselves after the note
  });
}

// After a reconnect, drop nudges answered while the socket was down. The hello carries recent events (`decided` set
// once answered), `decided` (every request key the relay holds a decision for) and `ended` (per session, its last
// resolved/done event: answered in the terminal, or Claude moved on). A nudge goes when its request was decided, or
// its session ended after it (for a resolved that names a request, only when it is this nudge's request).
function handleHello(msg) {
  return serial(async () => {
    const s = await getStage();
    const decidedIds = new Set((msg.recent || []).filter((e) => e.decided).map((e) => e.id));
    const decidedKeys = new Set(msg.decided || []);
    const ended = new Map((msg.ended || []).map((e) => [e.key, e]));
    let changed = false;
    for (const [sid, n] of Object.entries(s.nudges)) {
      const ev = n.event;
      const end = ended.get(sid);
      const gone = decidedIds.has(ev.id)
        || (ev.tool_use_id && decidedKeys.has(requestKey(ev.agent, ev.session_id, ev.tool_use_id)))
        || (end && end.id > ev.id && (!end.tool_use_id || end.tool_use_id === ev.tool_use_id));
      if (gone) { delete s.nudges[sid]; changed = true; }
    }
    if (changed) await refreshTabs(s);
  });
}

// ---------- jump back ----------
// The relay knows which terminal app each session runs in (the hooks report it) and brings it to the front.
async function jumpBack(sessionId, agent) {
  try {
    const res = await relayFetch('/focus', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sessionId, agent: agent || 'claude-code' }), signal: AbortSignal.timeout(8000),
    });
    const out = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, app: out.app || '' };
    if (res.status === 401) { setStatus('locked'); return { ok: false, error: 'Nudge needs its connection code: open its popup and paste the code from npx nudge-mascot status.' }; }
    if (res.status === 404 && (!out.error || out.error === 'not found')) return { ok: false, error: 'This relay is too old for Jump back. Run npx nudge-mascot setup.' };
    return { ok: false, error: out.error || `Relay answered HTTP ${res.status}` };
  } catch (_) {
    return { ok: false, error: 'Relay offline. Switch to the terminal yourself.' };
  }
}

// Waiting stats: a dismissed question/permission ends its wait. Fire-and-forget.
async function reportDismissed(event) {
  if (!ESCALATING_KINDS.has(event.kind) || event.test || !event.session_id) return;
  try {
    relayFetch('/dismissed', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: event.session_id, agent: event.agent || 'claude-code', id: event.id }), signal: AbortSignal.timeout(5000),
    }).catch(() => {});
  } catch (_) { /* relay offline */ }
}

async function showInActiveTab(s, quiet = false) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || !tab.id) return false;
  return showInTab(tab.id, s, quiet);
}

async function showInTab(tabId, s, quiet = false) {
  if (!selectedNudge(s)) return false;
  const payload = payloadFor(s, quiet);
  let ok = false;
  try {
    await chrome.tabs.sendMessage(tabId, payload);
    ok = true;
  } catch (_) {
    // Content script not present (tab opened before install, or restricted page). Try injecting once.
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      await chrome.tabs.sendMessage(tabId, payload);
      ok = true;
    } catch (_) {
      ok = false;
    }
  }
  if (ok && !s.shownTabs.includes(tabId)) {
    s.shownTabs.push(tabId);
    await setStage(s);
  }
  return ok;
}

// Re-show the stage wherever the user goes.
function followUser(tabId) {
  return serial(async () => {
    const s = await getStage();
    if (!selectedNudge(s)) return;
    if (tabId == null) {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      tabId = tab && tab.id;
    }
    if (tabId != null) await showInTab(tabId, s);
  });
}

chrome.tabs.onActivated.addListener(({ tabId }) => followUser(tabId));
chrome.windows.onFocusChanged.addListener((windowId) => {
  chromeFocused = windowId !== chrome.windows.WINDOW_ID_NONE;
  if (chromeFocused) followUser(null);
});

// ---------- escalation ----------
// Clawd escalates only while the user is actually looking at Chrome (window focused).
// Time spent in the terminal or elsewhere doesn't count against them. Each session has its own clock.
let chromeFocused = true;
chrome.windows.getLastFocused().then((w) => { chromeFocused = !!(w && w.focused); }).catch(() => {});

function levelFor(n) {
  const st = { ...DEFAULTS, ...n.settings };
  const maxLevel = st.escalation === 'gentle' ? 2 : 3;
  let level = 0;
  [st.escalateAt1, st.escalateAt2, st.escalateAt3].forEach((sec, i) => {
    if (n.attentiveMs >= Number(sec) * 1000) level = i + 1;
  });
  return Math.min(level, maxLevel);
}

function escalationTick() {
  return serial(async () => {
    const s = await getStage();
    const all = Object.values(s.nudges);
    if (!all.length) return;
    const now = Date.now();

    // A snooze ran out: that session's nudge comes back fresh and takes the bubble.
    const woke = all.filter((n) => n.snoozedUntil && now >= n.snoozedUntil);
    if (woke.length) {
      for (const n of woke) { n.snoozedUntil = null; n.attentiveMs = 0; n.level = 0; }
      s.selected = sidOf(woke[0].event);
      await setStage(s);
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab && tab.id) await showInTab(tab.id, s);
      const payload = payloadFor(s, true);
      for (const tabId of s.shownTabs) if (!tab || tabId !== tab.id) chrome.tabs.sendMessage(tabId, payload).catch(() => {});
      return;
    }

    if (!chromeFocused) return;
    const waiting = visible(s).filter((n) => ESCALATING_KINDS.has(n.event.kind) && { ...DEFAULTS, ...n.settings }.escalation !== 'off');
    if (!waiting.length) return;
    for (const n of waiting) {
      n.attentiveMs = (n.attentiveMs || 0) + 1000;
      n.level = levelFor(n);
    }

    // The mascot follows the most urgent session.
    const top = mostUrgent(visible(s));
    const level = top.level || 0;
    const st = { ...DEFAULTS, ...top.settings };
    let noise = false;
    if (level === 3 && st.escalationSound && now - (s.lastNoiseAt || 0) >= NOISE_EVERY_MS) {
      noise = true;
      s.lastNoiseAt = now;
    }
    const changed = level !== (s.level || 0);
    s.level = level;
    await setStage(s);

    if (changed || noise) {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab && tab.id) {
        if (!s.shownTabs.includes(tab.id)) await showInTab(tab.id, s);
        const sel = selectedNudge(s);
        chrome.tabs.sendMessage(tab.id, { type: 'escalate', id: sel.event.id, level, waitingMs: top.attentiveMs, noise }).catch(() => {});
      }
    }
  });
}
setInterval(escalationTick, 1000);

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) followUser(tabId);
});

function showSystemNotification(event) {
  chrome.notifications.create(`claude-nudge-${event.id}`, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: event.project ? `${event.title} · ${event.project}` : event.title,
    message: event.message.slice(0, 300),
    priority: 2,
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'decide') {
    if (!msg.session_id || !msg.tool_use_id) { sendResponse({ ok: false, error: 'Nothing to answer here. Use the terminal.' }); return; }
    decide(msg, sender.tab && sender.tab.id).then(sendResponse, (e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg && msg.type === 'jumpBack') {
    if (!msg.session_id) { sendResponse({ ok: false, error: "This nudge doesn't say which session it came from." }); return; }
    jumpBack(msg.session_id, msg.agent).then(sendResponse);
    return true;
  }
  if (msg && msg.type === 'selectSession') {
    // A session pill was tapped: every tab showing the stage switches to that session's nudge.
    serial(async () => {
      const s = await getStage();
      const n = s.nudges[msg.key];
      if (!n || n.snoozedUntil) return;
      s.selected = msg.key;
      await refreshTabs(s);
    }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg && msg.type === 'nudgeDismissed') {
    // Got it / Esc / the mascot: that session's nudge goes away everywhere; the next one (if any) takes its place.
    serial(async () => {
      const s = await getStage();
      const n = findById(s, msg.id);
      if (!n) return;
      delete s.nudges[sidOf(n.event)];
      reportDismissed(n.event);
      await refreshTabs(s);
    }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg && msg.type === 'nudgeSnooze') {
    serial(async () => {
      const s = await getStage();
      const n = findById(s, msg.id);
      if (!n) return;
      const st = { ...DEFAULTS, ...n.settings };
      n.snoozedUntil = Date.now() + Number(st.snoozeMin) * 60000;
      n.level = 0;
      n.attentiveMs = 0;
      await refreshTabs(s); // the next session's nudge, or nothing until the snooze ends
    }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg && msg.type === 'nudgeHold') {
    // User hovered or expanded the bubble: stop the countdown everywhere.
    serial(async () => {
      const s = await getStage();
      const n = findById(s, msg.id);
      if (n && n.expiresAt) {
        n.expiresAt = null;
        await setStage(s);
      }
    }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg && msg.type === 'getStatus') {
    chrome.storage.local.get(['relayStatus', 'recentEvents']).then((v) => sendResponse(v));
    return true;
  }
  if (msg && msg.type === 'connect') {
    saveSecret(msg.secret).then(sendResponse);
    return true;
  }
  if (msg && msg.type === 'reconnect') {
    backoffMs = 1000;
    if (ws) { try { ws.close(); } catch (_) {} ws = null; }
    connect();
    sendResponse({ ok: true });
  }
  if (msg && msg.type === 'previewNudge') {
    // Answerable like a real question: a tap goes through the relay's POST /decision (session "test" needs no hook).
    const question = 'Preview nudge. Should I keep the sessions table or move auth to JWT?';
    handleEvent({
      id: Date.now(), ts: Date.now(), kind: 'question', title: 'Claude has a question', project: 'nudge',
      session_id: 'test', tool_use_id: `preview-${Date.now()}`, tool_name: 'AskUserQuestion', approvable: true, test: true,
      message: question,
      options: [{ header: 'Approach', question, multiSelect: false, choices: ['Keep sessions', 'Move to JWT'] }],
    }).then(() => sendResponse({ ok: true }));
    return true;
  }
});

chrome.storage.session.remove('activeNudge').catch(() => {}); // the single-nudge key from before the session switcher

chrome.storage.onChanged.addListener((changes, area) => {
  if ((area === 'sync' && changes.port) || (area === 'local' && changes.relaySecret)) {
    backoffMs = 1000;
    if (ws) { try { ws.close(); } catch (_) {} ws = null; }
    connect();
  }
});

chrome.alarms.create('claude-nudge-reconnect', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'claude-nudge-reconnect') connect();
});
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener((details) => {
  connect();
  // First install (Web Store or unpacked): open the setup page with the one command the extension can't run itself.
  if (details.reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
});
connect();
