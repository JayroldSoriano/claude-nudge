#!/usr/bin/env node
// Nudge CLI.
//   npx nudge-mascot setup      install hooks, relay, launch agent; print the extension step
//   npx nudge-mascot start      run the relay in the foreground
//   npx nudge-mascot status     relay health + hook status
//   npx nudge-mascot test [kind] send a test nudge (question | permission | done | resolved)
//   npx nudge-mascot uninstall  remove hooks, launch agent, and ~/.claude-nudge
//   npx nudge-mascot pair [--relay URL]   pair a phone through the hosted relay (installs the approval hook)
//   npx nudge-mascot unpair     forget the hosted relay and remove the approval hook
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync, spawn } = require('child_process');

const PKG = path.join(__dirname, '..');
const HOME = os.homedir();
const INSTALL_DIR = path.join(HOME, '.claude-nudge');
const SETTINGS = path.join(HOME, '.claude', 'settings.json');
const PORT = Number(process.env.CLAUDE_NUDGE_PORT || 47831);
const HOOK = path.join(INSTALL_DIR, 'nudge-hook.sh');
const RELAY = path.join(INSTALL_DIR, 'relay', 'server.js');
const LAUNCHD_LABEL = 'com.claude-nudge.relay';
const PLIST = path.join(HOME, 'Library', 'LaunchAgents', `${LAUNCHD_LABEL}.plist`);
const SYSTEMD_UNIT = path.join(HOME, '.config', 'systemd', 'user', 'claude-nudge.service');
const STORE_URL = process.env.CLAUDE_NUDGE_STORE_URL || ''; // set once the Web Store listing is live
const CLOUD = path.join(INSTALL_DIR, 'cloud.json'); // { relay, userId, laptopToken } once a phone is paired
const APPROVE = path.join(INSTALL_DIR, 'nudge-approve.js');
const DEFAULT_RELAY = process.env.CLAUDE_NUDGE_RELAY || 'https://relay.nudgemascot.com';

const HOOKS = {
  Stop: null,
  Notification: 'permission_prompt|idle_prompt|agent_needs_input|agent_completed',
  PreToolUse: 'AskUserQuestion',
  PostToolUse: null,
  UserPromptSubmit: null,
};

const log = (m) => console.log(m);
const ok = (m) => console.log(`  ✓ ${m}`);
const warn = (m) => console.log(`  ! ${m}`);

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS, 'utf8')); } catch (_) { return {}; }
}

function installHooks() {
  const settings = readSettings();
  if (fs.existsSync(SETTINGS)) fs.copyFileSync(SETTINGS, SETTINGS + '.bak-claude-nudge');
  settings.hooks = settings.hooks || {};
  let added = 0;
  for (const [event, matcher] of Object.entries(HOOKS)) {
    const list = (settings.hooks[event] = settings.hooks[event] || []);
    // Drop stale entries that point at an old checkout, keep everything else.
    for (const g of list) if (g.hooks) g.hooks = g.hooks.filter((h) => !/nudge-hook\.sh$/.test(h.command || '') || h.command === HOOK);
    if (!list.some((g) => (g.hooks || []).some((h) => h.command === HOOK))) {
      list.push({ ...(matcher ? { matcher } : {}), hooks: [{ type: 'command', command: HOOK }] });
      added++;
    }
  }
  fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
  return added;
}

function removeHooks(pattern = /nudge-(hook\.sh|approve\.js)$/) {
  const settings = readSettings();
  if (!settings.hooks) return;
  for (const event of Object.keys(settings.hooks)) {
    settings.hooks[event] = settings.hooks[event]
      .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !pattern.test(h.command || '')) }))
      .filter((g) => g.hooks.length);
    if (!settings.hooks[event].length) delete settings.hooks[event];
  }
  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
}

// The approval hook waits for a phone or bubble decision, so it gets Claude Code's full 600s timeout.
function installApprovalHook() {
  const settings = readSettings();
  if (fs.existsSync(SETTINGS)) fs.copyFileSync(SETTINGS, SETTINGS + '.bak-claude-nudge');
  settings.hooks = settings.hooks || {};
  const command = `"${process.execPath}" "${APPROVE}"`;
  const list = (settings.hooks.PermissionRequest = settings.hooks.PermissionRequest || []);
  for (const g of list) if (g.hooks) g.hooks = g.hooks.filter((h) => !/nudge-approve\.js"?$/.test(h.command || '') || h.command === command);
  if (!list.some((g) => (g.hooks || []).some((h) => h.command === command))) {
    list.push({ hooks: [{ type: 'command', command, timeout: 600 }] });
  }
  // Questions: the same script answers AskUserQuestion with the option picked on the phone.
  const pre = (settings.hooks.PreToolUse = settings.hooks.PreToolUse || []);
  for (const g of pre) if (g.hooks) g.hooks = g.hooks.filter((h) => !/nudge-approve\.js"?$/.test(h.command || '') || h.command === command);
  if (!pre.some((g) => (g.hooks || []).some((h) => h.command === command))) {
    pre.push({ matcher: 'AskUserQuestion', hooks: [{ type: 'command', command, timeout: 600 }] });
  }
  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
}

function readCloud() {
  try { return JSON.parse(fs.readFileSync(CLOUD, 'utf8')); } catch (_) { return null; }
}

function installService() {
  const node = process.execPath;
  fs.mkdirSync(path.join(INSTALL_DIR, 'logs'), { recursive: true });
  if (process.platform === 'darwin') {
    fs.mkdirSync(path.dirname(PLIST), { recursive: true });
    fs.writeFileSync(PLIST, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key><array><string>${node}</string><string>${RELAY}</string></array>
  <key>EnvironmentVariables</key><dict><key>CLAUDE_NUDGE_PORT</key><string>${PORT}</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>StandardOutPath</key><string>${path.join(INSTALL_DIR, 'logs', 'relay.log')}</string>
  <key>StandardErrorPath</key><string>${path.join(INSTALL_DIR, 'logs', 'relay.err')}</string>
</dict></plist>
`);
    try { execFileSync('launchctl', ['unload', PLIST], { stdio: 'ignore' }); } catch (_) {}
    execFileSync('launchctl', ['load', PLIST], { stdio: 'ignore' });
    return 'launchd agent';
  }
  if (process.platform === 'linux') {
    try {
      fs.mkdirSync(path.dirname(SYSTEMD_UNIT), { recursive: true });
      fs.writeFileSync(SYSTEMD_UNIT, `[Unit]
Description=Nudge relay

[Service]
ExecStart=${node} ${RELAY}
Environment=CLAUDE_NUDGE_PORT=${PORT}
Restart=always

[Install]
WantedBy=default.target
`);
      execFileSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'ignore' });
      execFileSync('systemctl', ['--user', 'enable', '--now', 'claude-nudge.service'], { stdio: 'ignore' });
      return 'systemd user service';
    } catch (_) { /* fall through */ }
  }
  // Fallback: detached background process for this session only.
  const child = spawn(node, [RELAY], { detached: true, stdio: 'ignore', env: { ...process.env, CLAUDE_NUDGE_PORT: String(PORT) } });
  child.unref();
  return 'background process (re-run `npx nudge-mascot start` after a reboot)';
}

function removeService() {
  if (process.platform === 'darwin' && fs.existsSync(PLIST)) {
    try { execFileSync('launchctl', ['unload', PLIST], { stdio: 'ignore' }); } catch (_) {}
    fs.unlinkSync(PLIST);
  }
  if (process.platform === 'linux' && fs.existsSync(SYSTEMD_UNIT)) {
    try { execFileSync('systemctl', ['--user', 'disable', '--now', 'claude-nudge.service'], { stdio: 'ignore' }); } catch (_) {}
    fs.unlinkSync(SYSTEMD_UNIT);
  }
}

function health() {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: '/health', timeout: 1500 }, (res) => {
      let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => { try { resolve(JSON.parse(b)); } catch (_) { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function waitForHealth(tries = 20) {
  return new Promise((resolve) => {
    const tick = async () => {
      const h = await health();
      if (h || tries-- <= 0) return resolve(h);
      setTimeout(tick, 250);
    };
    tick();
  });
}

async function setup() {
  log('\nNudge · setup\n');
  fs.mkdirSync(INSTALL_DIR, { recursive: true });
  copyDir(path.join(PKG, 'relay'), path.join(INSTALL_DIR, 'relay'));
  copyDir(path.join(PKG, 'extension'), path.join(INSTALL_DIR, 'extension'));
  fs.copyFileSync(path.join(PKG, 'hooks', 'nudge-hook.sh'), HOOK);
  fs.chmodSync(HOOK, 0o755);
  fs.copyFileSync(path.join(PKG, 'hooks', 'nudge-approve.js'), APPROVE);
  ok(`files installed in ${INSTALL_DIR}`);

  const added = installHooks();
  ok(added ? `${added} hook(s) added to ${SETTINGS} (backup saved next to it)` : `hooks already present in ${SETTINGS}`);

  const how = installService();
  const h = await waitForHealth();
  if (h) ok(`relay running on 127.0.0.1:${h.port} (${how})`);
  else warn(`relay did not answer on port ${PORT}; try: npx nudge-mascot start`);

  log('\nLast step: install the extension.');
  if (STORE_URL) log(`  ${STORE_URL}`);
  else {
    log('  1. Open chrome://extensions and turn on Developer mode.');
    log(`  2. Click "Load unpacked" and pick: ${path.join(INSTALL_DIR, 'extension')}`);
  }
  log('\nThen restart any running Claude Code session and run: npx nudge-mascot test\n');
}

async function status() {
  const h = await health();
  if (h) ok(`relay up on 127.0.0.1:${h.port}, ${h.clients} extension connection(s), ${h.events} recent event(s)`);
  else warn(`relay not reachable on 127.0.0.1:${PORT}`);
  const s = readSettings();
  const present = Object.keys(HOOKS).filter((e) => (s.hooks && s.hooks[e] || []).some((g) => (g.hooks || []).some((hk) => /nudge-hook\.sh$/.test(hk.command || ''))));
  if (present.length === Object.keys(HOOKS).length) ok(`hooks installed (${present.join(', ')})`);
  else warn(`hooks missing: ${Object.keys(HOOKS).filter((e) => !present.includes(e)).join(', ') || 'none'}; run: npx nudge-mascot setup`);
  if (h && h.clients === 0) warn('no extension connected: load it from chrome://extensions and click its Reload icon');
  const cloud = readCloud();
  if (cloud) {
    ok(`phone pairing on ${cloud.relay} (user ${cloud.userId})`);
    const approve = (s.hooks && s.hooks.PermissionRequest || []).some((g) => (g.hooks || []).some((hk) => /nudge-approve\.js"?$/.test(hk.command || '')));
    if (approve) ok('approval hook installed (PermissionRequest)');
    else warn('approval hook missing; run: npx nudge-mascot pair');
  } else {
    log('  · no phone paired (optional): npx nudge-mascot pair');
  }
}

async function pair() {
  const i = process.argv.indexOf('--relay');
  const relay = (i > 0 && process.argv[i + 1] ? process.argv[i + 1] : DEFAULT_RELAY).replace(/\/$/, '');
  log(`\nNudge · pair a phone via ${relay}\n`);
  let body;
  try {
    const res = await fetch(`${relay}/pair/start`, { method: 'POST', signal: AbortSignal.timeout(8000) });
    body = await res.json();
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  } catch (e) {
    warn(`could not reach the relay: ${e.message}`);
    return;
  }
  fs.mkdirSync(INSTALL_DIR, { recursive: true });
  fs.writeFileSync(CLOUD, JSON.stringify({ relay: body.relay || relay, userId: body.userId, laptopToken: body.laptopToken, pairedAt: new Date().toISOString() }, null, 2) + '\n', { mode: 0o600 });
  ok(`laptop token saved to ${CLOUD}`);
  if (!fs.existsSync(APPROVE)) fs.copyFileSync(path.join(PKG, 'hooks', 'nudge-approve.js'), APPROVE);
  installApprovalHook();
  ok('approval hook added for permissions and questions (waits up to 10 minutes for the phone)');
  log(`\n  Open the Nudge app, set the relay to ${body.relay || relay}, and enter this code within ${Math.round((body.expiresInSeconds || 600) / 60)} minutes:\n`);
  log(`      ${body.pairCode}\n`);
  log('Restart any running Claude Code session so the approval hook loads. Test with: npx nudge-mascot test approve\n');
}

function unpair() {
  if (fs.existsSync(CLOUD)) { fs.unlinkSync(CLOUD); ok('hosted relay forgotten'); } else log('  · nothing was paired');
  removeHooks(/nudge-approve\.js"?$/); ok('approval hook removed');
}

function test(kind = 'question') {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: `/test?kind=${encodeURIComponent(kind)}`, method: 'POST' }, (res) => {
      let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => { log(res.statusCode === 200 ? `  ✓ sent a "${kind}" nudge` : `  ! ${b}`); resolve(); });
    });
    req.on('error', () => { warn(`relay not reachable on port ${PORT}; run: npx nudge-mascot setup`); resolve(); });
    req.end();
  });
}

function uninstall() {
  removeHooks(); ok('hooks removed from settings.json');
  removeService(); ok('relay service removed');
  fs.rmSync(INSTALL_DIR, { recursive: true, force: true }); ok(`${INSTALL_DIR} deleted`);
  log('Remove the extension from chrome://extensions to finish.');
}

function start() {
  const relay = fs.existsSync(RELAY) ? RELAY : path.join(PKG, 'relay', 'server.js');
  require(relay);
}

const cmd = process.argv[2] || 'help';
({
  setup, start, status, uninstall, pair, unpair,
  test: () => test(process.argv[3]),
  help: () => log(`Nudge

  npx nudge-mascot setup        install hooks + relay, then load the extension
  npx nudge-mascot start        run the relay in the foreground
  npx nudge-mascot status       relay health and hook status
  npx nudge-mascot test [kind]  question | permission | approve | done | resolved
  npx nudge-mascot pair         pair the Nudge phone app (optional; --relay URL to override)
  npx nudge-mascot unpair       forget the phone pairing
  npx nudge-mascot uninstall    remove everything this tool installed`),
}[cmd] || (() => { log(`unknown command: ${cmd}`); process.exit(1); }))();
