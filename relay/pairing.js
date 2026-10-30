'use strict';
// Phone pairing, shared by the relay (the extension popup drives it) and the CLI (`npx nudge-mascot pair`).
// Owns ~/.claude-nudge/cloud.json and the two approval hooks in ~/.claude/settings.json. Zero dependencies.
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = os.homedir();
const INSTALL_DIR = path.join(HOME, '.claude-nudge');
const CLOUD = process.env.CLAUDE_NUDGE_CLOUD || path.join(INSTALL_DIR, 'cloud.json');
const SETTINGS = path.join(HOME, '.claude', 'settings.json');
const APPROVE = path.join(INSTALL_DIR, 'nudge-approve.js');
const DEFAULT_RELAY = process.env.CLAUDE_NUDGE_RELAY || 'https://relay.nudgemascot.com';
const APPROVE_RE = /nudge-approve\.js"?$/;

function read() {
  try {
    const c = JSON.parse(fs.readFileSync(CLOUD, 'utf8'));
    return c && c.relay && c.laptopToken ? c : null;
  } catch (_) { return null; }
}

function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS, 'utf8')); } catch (_) { return {}; }
}

function writeSettings(settings) {
  fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
}

// The hook script ships next to the relay (repo: hooks/, install: ~/.claude-nudge/). Make sure the install copy exists.
function ensureApproveScript() {
  if (fs.existsSync(APPROVE)) return;
  const src = path.join(__dirname, '..', 'hooks', 'nudge-approve.js');
  if (fs.existsSync(src)) { fs.mkdirSync(INSTALL_DIR, { recursive: true }); fs.copyFileSync(src, APPROVE); }
}

// PermissionRequest (all tools) and PreToolUse on AskUserQuestion, both with Claude Code's full 600 s timeout,
// so the hook can wait for the phone. Idempotent; stale entries pointing elsewhere are dropped.
function installApprovalHooks() {
  const settings = readSettings();
  if (fs.existsSync(SETTINGS)) fs.copyFileSync(SETTINGS, SETTINGS + '.bak-claude-nudge');
  settings.hooks = settings.hooks || {};
  const command = `"${process.execPath}" "${APPROVE}"`;
  const entry = { type: 'command', command, timeout: 600 };
  for (const [event, matcher] of [['PermissionRequest', null], ['PreToolUse', 'AskUserQuestion']]) {
    const list = (settings.hooks[event] = settings.hooks[event] || []);
    for (const g of list) if (g.hooks) g.hooks = g.hooks.filter((h) => !APPROVE_RE.test(h.command || '') || h.command === command);
    if (!list.some((g) => (g.hooks || []).some((h) => h.command === command))) {
      list.push({ ...(matcher ? { matcher } : {}), hooks: [entry] });
    }
  }
  writeSettings(settings);
}

function removeApprovalHooks() {
  const settings = readSettings();
  if (!settings.hooks) return;
  for (const event of Object.keys(settings.hooks)) {
    settings.hooks[event] = settings.hooks[event]
      .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !APPROVE_RE.test(h.command || '')) }))
      .filter((g) => g.hooks.length);
    if (!settings.hooks[event].length) delete settings.hooks[event];
  }
  writeSettings(settings);
}

function hooksInstalled() {
  const s = readSettings();
  const has = (ev) => (s.hooks && s.hooks[ev] || []).some((g) => (g.hooks || []).some((h) => APPROVE_RE.test(h.command || '')));
  return has('PermissionRequest') && has('PreToolUse');
}

function pairLink(code, relay) {
  return `nudge://pair?code=${encodeURIComponent(code)}&relay=${encodeURIComponent(relay)}`;
}

// Mint a pairing code on the hosted relay, remember the laptop token, install the hooks.
async function start(relayUrl) {
  const relay = String(relayUrl || (read() || {}).relay || DEFAULT_RELAY).replace(/\/$/, '');
  const res = await fetch(`${relay}/pair/start`, { method: 'POST', signal: AbortSignal.timeout(8000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `relay answered HTTP ${res.status}`);
  fs.mkdirSync(INSTALL_DIR, { recursive: true });
  fs.writeFileSync(CLOUD, JSON.stringify({ relay: body.relay || relay, userId: body.userId, laptopToken: body.laptopToken, pairedAt: new Date().toISOString() }, null, 2) + '\n', { mode: 0o600 });
  ensureApproveScript();
  installApprovalHooks();
  const out = { userId: body.userId, pairCode: body.pairCode, relay: body.relay || relay, expiresInSeconds: body.expiresInSeconds || 600 };
  out.link = pairLink(out.pairCode, out.relay);
  return out;
}

function stop() {
  const was = read();
  if (fs.existsSync(CLOUD)) fs.unlinkSync(CLOUD);
  removeApprovalHooks();
  return { ok: true, wasPaired: !!was };
}

// Local state plus, when paired, what the hosted relay knows (phones that claimed, devices with push).
async function status() {
  const c = read();
  const base = { paired: !!c, relay: c ? c.relay : DEFAULT_RELAY, userId: c ? c.userId : null, hooks: hooksInstalled(), phones: null, devices: null, pairCodeOpen: false };
  if (!c || typeof fetch !== 'function') return base;
  try {
    const res = await fetch(`${c.relay}/status`, { headers: { Authorization: `Bearer ${c.laptopToken}` }, signal: AbortSignal.timeout(5000) });
    if (res.ok) Object.assign(base, await res.json());
    else base.error = `relay answered HTTP ${res.status}`;
  } catch (e) { base.error = e.message; }
  return base;
}

module.exports = { read, start, stop, status, pairLink, installApprovalHooks, removeApprovalHooks, hooksInstalled, CLOUD, APPROVE, DEFAULT_RELAY };
