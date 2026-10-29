#!/usr/bin/env node
// Merges the claude-nudge hooks into ~/.claude/settings.json (backs up the original first).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const hookPath = path.join(__dirname, '..', 'hooks', 'nudge-hook.sh');
const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
const entry = (matcher) => ({ ...(matcher ? { matcher } : {}), hooks: [{ type: 'command', command: hookPath }] });
const wanted = {
  Stop: entry(null),
  Notification: entry('permission_prompt|idle_prompt|agent_needs_input|agent_completed'),
  PreToolUse: entry('AskUserQuestion'),
  PostToolUse: entry(null),
  UserPromptSubmit: entry(null),
};

let settings = {};
if (fs.existsSync(settingsPath)) {
  settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  fs.copyFileSync(settingsPath, settingsPath + '.bak-claude-nudge');
}
settings.hooks = settings.hooks || {};
for (const [event, e] of Object.entries(wanted)) {
  const list = (settings.hooks[event] = settings.hooks[event] || []);
  const already = list.some((g) => (g.hooks || []).some((h) => h.command === hookPath));
  if (!already) list.push(e);
}
fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
console.log(`claude-nudge hooks installed in ${settingsPath}`);
console.log('Restart any running Claude Code sessions for hooks to take effect.');
