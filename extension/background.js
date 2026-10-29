// claude-nudge service worker: keeps a WebSocket to the local relay and forwards
// events to the content script on the tab the user is looking at.

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

async function setStatus(status) {
  await chrome.storage.local.set({ relayStatus: status, relayStatusTs: Date.now() });
  chrome.action.setBadgeBackgroundColor({ color: status === 'connected' ? '#2e8b57' : '#9a9a9a' });
  chrome.action.setBadgeText({ text: status === 'connected' ? '' : '·' });
}

async function connect() {
  if (connecting) return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  connecting = true;
  let port;
  try {
    ({ port } = await getSettings());
    ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  } catch (e) {
    connecting = false;
    scheduleReconnect();
    return;
  }
  connecting = false;
  ws.onopen = () => {
    backoffMs = 1000;
    setStatus('connected');
  };
  ws.onmessage = (evt) => {
    let msg;
    try { msg = JSON.parse(evt.data); } catch (_) { return; }
    if (msg.type === 'event') handleEvent(msg.event);
    else if (msg.type === 'ping') { try { ws.send(JSON.stringify({ type: 'ping' })); } catch (_) {} }
  };
  ws.onclose = () => { ws = null; setStatus('disconnected'); scheduleReconnect(); };
  ws.onerror = () => { try { ws && ws.close(); } catch (_) {} };
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connect, backoffMs);
  backoffMs = Math.min(backoffMs * 2, 30000);
}

async function handleEvent(event) {
  const settings = await getSettings();
  const allowed = {
    done: settings.showDone,
    question: settings.showQuestion,
    permission: settings.showPermission,
    idle: settings.showIdle,
  }[event.kind];
  if (event.kind === 'resolved') {
    // The user acted in the terminal for this session: take Clawd away everywhere.
    const active = await getActive();
    if (active && active.event.session_id && active.event.session_id === event.session_id) await clearActive(active);
    return;
  }
  if (!allowed) return;

  const { recentEvents = [] } = await chrome.storage.local.get('recentEvents');
  recentEvents.push(event);
  await chrome.storage.local.set({ recentEvents: recentEvents.slice(-10) });

  // The active nudge follows the user across tabs until dismissed or expired.
  const autoSec = event.kind === 'done' || event.kind === 'idle' ? Number(settings.autoDismissSec) : 0;
  const active = {
    event,
    settings,
    expiresAt: autoSec > 0 ? Date.now() + autoSec * 1000 : null,
    shownTabs: [],
    level: 0,
    attentiveMs: 0,
    snoozedUntil: null,
    lastNoiseAt: 0,
  };
  await setActive(active);

  const shown = await showInActiveTab(active);
  if (!shown) showSystemNotification(event);
}

async function getActive() {
  const { activeNudge } = await chrome.storage.session.get('activeNudge');
  if (!activeNudge) return null;
  if (activeNudge.expiresAt && activeNudge.expiresAt <= Date.now()) {
    await clearActive(activeNudge);
    return null;
  }
  return activeNudge;
}

async function setActive(active) {
  await chrome.storage.session.set({ activeNudge: active });
}

async function clearActive(active) {
  await chrome.storage.session.remove('activeNudge');
  for (const tabId of (active && active.shownTabs) || []) {
    chrome.tabs.sendMessage(tabId, { type: 'dismiss' }).catch(() => {});
  }
}

async function showInActiveTab(active) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || !tab.id) return false;
  return showInTab(tab.id, active);
}

async function showInTab(tabId, active) {
  const payload = { type: 'nudge', event: active.event, settings: active.settings, expiresAt: active.expiresAt, level: active.level || 0, waitingMs: active.attentiveMs || 0 };
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
  if (ok && !active.shownTabs.includes(tabId)) {
    active.shownTabs.push(tabId);
    await setActive(active);
  }
  return ok;
}

// Re-show the active nudge wherever the user goes.
async function followUser(tabId) {
  const active = await getActive();
  if (!active || active.snoozedUntil) return;
  if (tabId == null) {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    tabId = tab && tab.id;
  }
  if (tabId != null) showInTab(tabId, active);
}

chrome.tabs.onActivated.addListener(({ tabId }) => followUser(tabId));
chrome.windows.onFocusChanged.addListener((windowId) => {
  chromeFocused = windowId !== chrome.windows.WINDOW_ID_NONE;
  if (chromeFocused) followUser(null);
});

// ---------- escalation ----------
// Clawd escalates only while the user is actually looking at Chrome (window focused).
// Time spent in the terminal or elsewhere doesn't count against them.
let chromeFocused = true;
chrome.windows.getLastFocused().then((w) => { chromeFocused = !!(w && w.focused); }).catch(() => {});

async function escalationTick() {
  const active = await getActive();
  if (!active) return;
  const s = { ...DEFAULTS, ...active.settings };
  const now = Date.now();

  if (active.snoozedUntil) {
    if (now < active.snoozedUntil) return;
    active.snoozedUntil = null;
    active.attentiveMs = 0;
    active.level = 0;
    active.shownTabs = [];
    await setActive(active);
    await showInActiveTab(active);
    return;
  }

  if (s.escalation === 'off' || !ESCALATING_KINDS.has(active.event.kind) || !chromeFocused) return;

  active.attentiveMs = (active.attentiveMs || 0) + 1000;
  const maxLevel = s.escalation === 'gentle' ? 2 : 3;
  let level = 0;
  [s.escalateAt1, s.escalateAt2, s.escalateAt3].forEach((sec, i) => {
    if (active.attentiveMs >= Number(sec) * 1000) level = i + 1;
  });
  level = Math.min(level, maxLevel);

  let noise = false;
  if (level === 3 && s.escalationSound && now - (active.lastNoiseAt || 0) >= NOISE_EVERY_MS) {
    noise = true;
    active.lastNoiseAt = now;
  }
  const changed = level !== (active.level || 0);
  active.level = level;
  await setActive(active);

  if (changed || noise) {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab && tab.id) {
      if (!active.shownTabs.includes(tab.id)) await showInTab(tab.id, active);
      chrome.tabs.sendMessage(tab.id, { type: 'escalate', id: active.event.id, level, waitingMs: active.attentiveMs, noise }).catch(() => {});
    }
  }
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'nudgeDismissed') {
    getActive().then((active) => {
      if (active && active.event.id === msg.id) return clearActive(active);
    }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg && msg.type === 'nudgeSnooze') {
    getActive().then(async (active) => {
      if (!active || active.event.id !== msg.id) return;
      const s = { ...DEFAULTS, ...active.settings };
      for (const tabId of active.shownTabs) chrome.tabs.sendMessage(tabId, { type: 'dismiss' }).catch(() => {});
      active.shownTabs = [];
      active.snoozedUntil = Date.now() + Number(s.snoozeMin) * 60000;
      active.level = 0;
      active.attentiveMs = 0;
      await setActive(active);
    }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg && msg.type === 'nudgeHold') {
    // User hovered or expanded the bubble: stop the countdown everywhere.
    getActive().then((active) => {
      if (active && active.event.id === msg.id && active.expiresAt) {
        active.expiresAt = null;
        return setActive(active);
      }
    }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg && msg.type === 'getStatus') {
    chrome.storage.local.get(['relayStatus', 'recentEvents']).then((v) => sendResponse(v));
    return true;
  }
  if (msg && msg.type === 'reconnect') {
    backoffMs = 1000;
    if (ws) { try { ws.close(); } catch (_) {} ws = null; }
    connect();
    sendResponse({ ok: true });
  }
  if (msg && msg.type === 'previewNudge') {
    getSettings().then((settings) => handleEvent({
      id: Date.now(), ts: Date.now(), kind: 'question', title: 'Claude has a question', project: 'claude-nudge',
      message: 'Preview nudge. Should I keep the sessions table or move auth to JWT?',
      options: [{ header: 'Approach', choices: ['Keep sessions', 'Move to JWT'] }],
    })).then(() => sendResponse({ ok: true }));
    return true;
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.port) {
    if (ws) { try { ws.close(); } catch (_) {} ws = null; }
    connect();
  }
});

chrome.alarms.create('claude-nudge-reconnect', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'claude-nudge-reconnect') connect();
});
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
connect();
