#!/usr/bin/env node
// Nudge for Claude Code CLI.
//   npx nudge-for-claude-code setup      install hooks, relay, launch agent; print the extension step
//   npx nudge-for-claude-code start      run the relay in the foreground
//   npx nudge-for-claude-code status     relay health + hook status
//   npx nudge-for-claude-code test [kind] send a test nudge (question | permission | done | resolved)
//   npx nudge-for-claude-code uninstall  remove hooks, launch agent, and ~/.claude-nudge
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

function removeHooks() {
  const settings = readSettings();
  if (!settings.hooks) return;
  for (const event of Object.keys(settings.hooks)) {
    settings.hooks[event] = settings.hooks[event]
      .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !/nudge-hook\.sh$/.test(h.command || '')) }))
      .filter((g) => g.hooks.length);
    if (!settings.hooks[event].length) delete settings.hooks[event];
  }
  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
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
Description=Nudge for Claude Code relay

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
  return 'background process (re-run `npx nudge-for-claude-code start` after a reboot)';
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
  log('\nNudge for Claude Code · setup\n');
  fs.mkdirSync(INSTALL_DIR, { recursive: true });
  copyDir(path.join(PKG, 'relay'), path.join(INSTALL_DIR, 'relay'));
  copyDir(path.join(PKG, 'extension'), path.join(INSTALL_DIR, 'extension'));
  fs.copyFileSync(path.join(PKG, 'hooks', 'nudge-hook.sh'), HOOK);
  fs.chmodSync(HOOK, 0o755);
  ok(`files installed in ${INSTALL_DIR}`);

  const added = installHooks();
  ok(added ? `${added} hook(s) added to ${SETTINGS} (backup saved next to it)` : `hooks already present in ${SETTINGS}`);

  const how = installService();
  const h = await waitForHealth();
  if (h) ok(`relay running on 127.0.0.1:${h.port} (${how})`);
  else warn(`relay did not answer on port ${PORT}; try: npx nudge-for-claude-code start`);

  log('\nLast step: install the extension.');
  if (STORE_URL) log(`  ${STORE_URL}`);
  else {
    log('  1. Open chrome://extensions and turn on Developer mode.');
    log(`  2. Click "Load unpacked" and pick: ${path.join(INSTALL_DIR, 'extension')}`);
  }
  log('\nThen restart any running Claude Code session and run: npx nudge-for-claude-code test\n');
}

async function status() {
  const h = await health();
  if (h) ok(`relay up on 127.0.0.1:${h.port}, ${h.clients} extension connection(s), ${h.events} recent event(s)`);
  else warn(`relay not reachable on 127.0.0.1:${PORT}`);
  const s = readSettings();
  const present = Object.keys(HOOKS).filter((e) => (s.hooks && s.hooks[e] || []).some((g) => (g.hooks || []).some((hk) => /nudge-hook\.sh$/.test(hk.command || ''))));
  if (present.length === Object.keys(HOOKS).length) ok(`hooks installed (${present.join(', ')})`);
  else warn(`hooks missing: ${Object.keys(HOOKS).filter((e) => !present.includes(e)).join(', ') || 'none'}; run: npx nudge-for-claude-code setup`);
  if (h && h.clients === 0) warn('no extension connected: load it from chrome://extensions and click its Reload icon');
}

function test(kind = 'question') {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: `/test?kind=${encodeURIComponent(kind)}`, method: 'POST' }, (res) => {
      let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => { log(res.statusCode === 200 ? `  ✓ sent a "${kind}" nudge` : `  ! ${b}`); resolve(); });
    });
    req.on('error', () => { warn(`relay not reachable on port ${PORT}; run: npx nudge-for-claude-code setup`); resolve(); });
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
  setup, start, status, uninstall,
  test: () => test(process.argv[3]),
  help: () => log(`Nudge for Claude Code

  npx nudge-for-claude-code setup        install hooks + relay, then load the extension
  npx nudge-for-claude-code start        run the relay in the foreground
  npx nudge-for-claude-code status       relay health and hook status
  npx nudge-for-claude-code test [kind]  question | permission | done | resolved
  npx nudge-for-claude-code uninstall    remove everything this tool installed`),
}[cmd] || (() => { log(`unknown command: ${cmd}`); process.exit(1); }))();
