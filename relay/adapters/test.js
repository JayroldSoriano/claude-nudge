#!/usr/bin/env node
'use strict';
// Feeds sample hook payloads for each agent through its adapter and checks the events. No framework:
//   node relay/adapters/test.js   (or npm test)
const assert = require('assert');
const { adapters, adapterFor, createContext, sessionKey, incompleteDecision } = require('.');

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok    ${name}`); }
  catch (e) { failures.push(name); console.log(`  FAIL  ${name}\n        ${e.message.split('\n').join('\n        ')}`); }
}

const CWD = '/Users/dev/work/shop-api';
const SHAPE = ['id', 'ts', 'session_id', 'project', 'cwd', 'hook_event', 'agent', 'kind', 'title', 'message'];

// Runs payloads in order through one agent's adapter with a shared context (so pending/dedupe carry over).
// The question approval hook counts as installed unless a test says otherwise (runWith).
function runWith(opts, agent, ...hooks) {
  const ctx = createContext(opts);
  return hooks.map((h) => adapters[agent].normalize({ session_id: 's1', cwd: CWD, ...h }, ctx));
}
const run = (agent, ...hooks) => runWith({ questionHookInstalled: () => true }, agent, ...hooks);
function expectEvent(e, agent, kind, title) {
  assert.ok(e, `expected a ${kind} event, got ${e}`);
  for (const k of SHAPE) assert.ok(k in e, `event lacks "${k}"`);
  assert.strictEqual(e.agent, agent);
  assert.strictEqual(e.kind, kind);
  if (title) assert.strictEqual(e.title, title);
  assert.strictEqual(e.project, 'shop-api');
  assert.strictEqual(e.session_id, 's1');
}

// For events from a shared ctx, whose session_id varies per test.
function expectAgentKind(e, agent, kind) {
  assert.ok(e, `expected a ${agent} ${kind} event, got ${e}`);
  assert.strictEqual(e.agent, agent);
  assert.strictEqual(e.kind, kind);
}

console.log('registry');
test('no ?agent= means Claude Code', () => assert.strictEqual(adapterFor(undefined).name, 'claude-code'));
test('empty ?agent= means Claude Code', () => assert.strictEqual(adapterFor('').name, 'claude-code'));
test('codex and gemini resolve', () => { assert.strictEqual(adapterFor('codex').name, 'codex'); assert.strictEqual(adapterFor('gemini').name, 'gemini'); });
test('unknown agent is null', () => assert.strictEqual(adapterFor('cursor'), null));
test('ids increase across events', () => {
  const [a, b] = run('claude-code', { hook_event_name: 'Stop' }, { hook_event_name: 'Stop' });
  assert.ok(b.id > a.id);
});
test('non-object payloads are ignored', () => {
  for (const name of Object.keys(adapters)) assert.strictEqual(adapters[name].normalize(null, createContext()), null);
});

console.log('claude-code');
test('Stop -> done "Claude is done" with the last message', () => {
  const [e] = run('claude-code', { hook_event_name: 'Stop', last_assistant_message: 'All tests pass.' });
  expectEvent(e, 'claude-code', 'done', 'Claude is done');
  assert.strictEqual(e.message, 'All tests pass.');
  assert.strictEqual(e.hook_event, 'Stop');
});
test('Stop without a message uses the fallback', () => {
  const [e] = run('claude-code', { hook_event_name: 'Stop' });
  assert.strictEqual(e.message, 'Finished working. Come take a look.');
});
test('Notification types map to permission / idle / question / done', () => {
  const [p, i, q, d, x] = run('claude-code',
    { hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'Claude needs your permission to use Bash' },
    { hook_event_name: 'Notification', notification_type: 'idle_prompt' },
    { hook_event_name: 'Notification', notification_type: 'agent_needs_input' },
    { hook_event_name: 'Notification', notification_type: 'agent_completed' },
    { hook_event_name: 'Notification', notification_type: 'auth_success' });
  expectEvent(p, 'claude-code', 'permission', 'Claude needs permission');
  assert.strictEqual(p.message, 'Claude needs your permission to use Bash');
  expectEvent(i, 'claude-code', 'idle', 'Claude is waiting');
  assert.strictEqual(i.message, 'Claude is waiting for your input.');
  expectEvent(q, 'claude-code', 'question', 'Claude needs input');
  expectEvent(d, 'claude-code', 'done', 'Claude is done');
  assert.strictEqual(d.message, 'Finished working.');
  assert.strictEqual(x, null);
});
test('AskUserQuestion -> question with options; the same tool_use_id twice emits once', () => {
  const ask = { hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_use_id: 'tu1',
    tool_input: { questions: [{ header: 'DB', question: 'Which database?', multiSelect: false, options: [{ label: 'Postgres' }, { label: 'SQLite' }] }] } };
  const [e, dup] = run('claude-code', ask, ask);
  expectEvent(e, 'claude-code', 'question', 'Claude has a question');
  assert.strictEqual(e.message, 'Which database?');
  assert.strictEqual(e.approvable, true);
  assert.deepStrictEqual(e.options, [{ header: 'DB', question: 'Which database?', multiSelect: false, choices: ['Postgres', 'SQLite'] }]);
  assert.strictEqual(dup, null);
});
test('AskUserQuestion is answerable only while the question approval hook is installed, and needs a tool_use_id', () => {
  const ask = (id) => ({ hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', ...(id ? { tool_use_id: id } : {}),
    tool_input: { questions: [{ question: 'Which?', options: [{ label: 'A' }] }] } });
  assert.strictEqual(runWith({ questionHookInstalled: () => false }, 'claude-code', ask('tu2'))[0].approvable, false);
  assert.strictEqual(runWith({}, 'claude-code', ask('tu3'))[0].approvable, false);
  assert.strictEqual(run('claude-code', ask(''))[0].approvable, false);
});
test('several questions keep their headers and multiSelect', () => {
  const [e] = run('claude-code', { hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_use_id: 'tu4',
    tool_input: { questions: [{ header: 'DB', question: 'Which database?', options: [{ label: 'Postgres' }] }, { header: 'Extras', question: 'Which extras?', multiSelect: true, options: [{ label: 'Seed' }, { label: 'Backups' }] }] } });
  assert.strictEqual(e.message, 'Which database?\n\nWhich extras?');
  assert.deepStrictEqual(e.options.map((o) => [o.header, o.multiSelect, o.choices.length]), [['DB', false, 1], ['Extras', true, 2]]);
});
test('PreToolUse for other tools is ignored', () => {
  assert.strictEqual(run('claude-code', { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } })[0], null);
});
test('PermissionRequest -> approvable permission; the terminal permission_prompt after it is deduped', () => {
  const [e, n] = run('claude-code',
    { hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_use_id: 'pr-1', tool_input: { command: 'npm publish' } },
    { hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'Claude needs your permission to use Bash' });
  expectEvent(e, 'claude-code', 'permission', 'Claude needs permission');
  assert.strictEqual(e.message, 'Bash: npm publish');
  assert.strictEqual(e.approvable, true);
  assert.strictEqual(e.tool_use_id, 'pr-1');
  assert.strictEqual(n, null);
});
test('PostToolUse resolves only while something is pending; UserPromptSubmit always resolves', () => {
  const [none, , res, prompt] = run('claude-code',
    { hook_event_name: 'PostToolUse', tool_name: 'Bash' },
    { hook_event_name: 'Notification', notification_type: 'permission_prompt' },
    { hook_event_name: 'PostToolUse', tool_name: 'Bash' },
    { hook_event_name: 'UserPromptSubmit', prompt: 'go' });
  assert.strictEqual(none, null);
  expectEvent(res, 'claude-code', 'resolved', 'Resolved');
  expectEvent(prompt, 'claude-code', 'resolved', 'Resolved');
});
test('the terminal permission_prompt is skipped within 10 s of the request even after a fast answer cleared pending', () => {
  const [e, done, n] = run('claude-code',
    { hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_use_id: 'pr-2', tool_input: { command: 'ls' } },
    { hook_event_name: 'PostToolUse', tool_name: 'Bash' },
    { hook_event_name: 'Notification', notification_type: 'permission_prompt' });
  expectEvent(e, 'claude-code', 'permission');
  expectEvent(done, 'claude-code', 'resolved');
  assert.strictEqual(n, null);
});
test('the terminal permission_prompt is skipped within 10 s of a bubble/phone decision', () => {
  const ctx = createContext();
  ctx.lastPermission.set(sessionKey('claude-code', 's1'), Date.now() - 60000);
  ctx.lastDecided.set(sessionKey('claude-code', 's1'), Date.now());
  const n = adapters['claude-code'].normalize({ session_id: 's1', cwd: CWD, hook_event_name: 'Notification', notification_type: 'permission_prompt' }, ctx);
  assert.strictEqual(n, null);
  const other = adapters['claude-code'].normalize({ session_id: 's2', cwd: CWD, hook_event_name: 'Notification', notification_type: 'permission_prompt' }, ctx);
  assert.strictEqual(other.kind, 'permission');
});
test('long messages are clipped to 1200 characters', () => {
  const [e] = run('claude-code', { hook_event_name: 'Stop', last_assistant_message: 'x'.repeat(5000) });
  assert.strictEqual(e.message.length, 1200);
  assert.ok(e.message.endsWith('…'));
});

console.log('codex');
test('PermissionRequest (Bash) -> "Codex needs permission", not approvable', () => {
  const [e] = run('codex', { hook_event_name: 'PermissionRequest', turn_id: 't1', model: 'gpt-5-codex', permission_mode: 'default',
    tool_name: 'Bash', tool_input: { command: 'npm install left-pad', description: 'Needs network access' } });
  expectEvent(e, 'codex', 'permission', 'Codex needs permission');
  assert.strictEqual(e.message, 'Bash: npm install left-pad\nNeeds network access');
  assert.strictEqual(e.approvable, false);
  assert.strictEqual(e.tool_name, 'Bash');
});
test('PermissionRequest (apply_patch) names the files in the patch', () => {
  const patch = '*** Begin Patch\n*** Update File: src/a.js\n@@\n-x\n+y\n*** Add File: src/b.js\n+z\n*** End Patch';
  const [e] = run('codex', { hook_event_name: 'PermissionRequest', tool_name: 'apply_patch', tool_input: { command: patch } });
  assert.strictEqual(e.message, 'apply_patch: src/a.js, src/b.js');
});
test('PostToolUse resolves the pending permission, and only then', () => {
  const [none, , res] = run('codex',
    { hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_use_id: 'c1', tool_input: { command: 'ls' }, tool_response: {} },
    { hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'rm -rf dist' } },
    { hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_use_id: 'c2', tool_input: { command: 'rm -rf dist' }, tool_response: {} });
  assert.strictEqual(none, null);
  expectEvent(res, 'codex', 'resolved', 'Resolved');
});
test('Stop -> "Codex is done"; a null last_assistant_message uses the fallback', () => {
  const [e, f] = run('codex',
    { hook_event_name: 'Stop', turn_id: 't1', stop_hook_active: false, last_assistant_message: 'Refactor done.' },
    { hook_event_name: 'Stop', turn_id: 't2', stop_hook_active: false, last_assistant_message: null });
  expectEvent(e, 'codex', 'done', 'Codex is done');
  assert.strictEqual(e.message, 'Refactor done.');
  assert.strictEqual(f.message, 'Finished working. Come take a look.');
});
test('UserPromptSubmit -> resolved', () => {
  expectEvent(run('codex', { hook_event_name: 'UserPromptSubmit', prompt: 'next' })[0], 'codex', 'resolved', 'Resolved');
});
test('PreToolUse request_user_input -> "Codex has a question" (unverified payload)', () => {
  const [e] = run('codex', { hook_event_name: 'PreToolUse', tool_name: 'request_user_input', tool_use_id: 'q1',
    tool_input: { questions: [{ header: 'Scope', question: 'Touch the tests too?', options: [{ label: 'Yes' }, { label: 'No' }] }] } });
  expectEvent(e, 'codex', 'question', 'Codex has a question');
  assert.deepStrictEqual(e.options[0].choices, ['Yes', 'No']);
  assert.strictEqual(e.approvable, false);
});
test('other events are ignored', () => {
  const out = run('codex',
    { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } },
    { hook_event_name: 'SessionStart', source: 'startup' },
    { hook_event_name: 'Notification', notification_type: 'permission_prompt' });
  assert.deepStrictEqual(out, [null, null, null]);
});

console.log('gemini');
test('Notification ToolPermission (exec) -> "Gemini needs permission" with the command', () => {
  const [e] = run('gemini', { hook_event_name: 'Notification', timestamp: '2026-10-31T10:00:00Z', notification_type: 'ToolPermission',
    message: 'Tool Confirm Shell Command requires execution', details: { type: 'exec', title: 'Confirm Shell Command', command: 'npm test', rootCommand: 'npm' } });
  expectEvent(e, 'gemini', 'permission', 'Gemini needs permission');
  assert.strictEqual(e.message, 'Shell: npm test');
  assert.strictEqual(e.approvable, false);
});
test('ToolPermission edit / mcp / info / unknown details', () => {
  const n = (details, message) => ({ hook_event_name: 'Notification', notification_type: 'ToolPermission', message, details });
  const [edit, mcp, info, bare] = run('gemini',
    n({ type: 'edit', title: 'Confirm Edit', fileName: 'app.ts', filePath: '/w/app.ts' }),
    n({ type: 'mcp', title: 'Confirm MCP', serverName: 'github', toolName: 'create_issue', toolDisplayName: 'Create issue' }),
    n({ type: 'info', title: 'Confirm Web Fetch', prompt: 'summarize', urls: ['https://example.com'] }),
    n(undefined, 'Tool requires confirmation'));
  assert.strictEqual(edit.message, 'Edit: /w/app.ts');
  assert.strictEqual(mcp.message, 'github: Create issue');
  assert.strictEqual(mcp.tool_name, 'create_issue');
  assert.strictEqual(info.message, 'Fetch: https://example.com');
  assert.strictEqual(bare.message, 'Tool requires confirmation');
});
test('AfterTool resolves the pending permission, and only then', () => {
  const [none, , res] = run('gemini',
    { hook_event_name: 'AfterTool', tool_name: 'read_file', tool_input: {}, tool_response: {} },
    { hook_event_name: 'Notification', notification_type: 'ToolPermission', details: { type: 'exec', command: 'make' } },
    { hook_event_name: 'AfterTool', tool_name: 'run_shell_command', tool_input: { command: 'make' }, tool_response: {} });
  assert.strictEqual(none, null);
  expectEvent(res, 'gemini', 'resolved', 'Resolved');
});
test('AfterAgent -> "Gemini is done" with prompt_response; BeforeAgent -> resolved', () => {
  const [d, r] = run('gemini',
    { hook_event_name: 'AfterAgent', prompt: 'fix it', prompt_response: 'Fixed the flaky test.', stop_hook_active: false },
    { hook_event_name: 'BeforeAgent', prompt: 'thanks' });
  expectEvent(d, 'gemini', 'done', 'Gemini is done');
  assert.strictEqual(d.message, 'Fixed the flaky test.');
  expectEvent(r, 'gemini', 'resolved', 'Resolved');
});
test('other events are ignored', () => {
  const out = run('gemini',
    { hook_event_name: 'BeforeTool', tool_name: 'run_shell_command', tool_input: { command: 'ls' } },
    { hook_event_name: 'SessionStart', source: 'startup' },
    { hook_event_name: 'Stop' });
  assert.deepStrictEqual(out, [null, null, null]);
});

console.log('test samples (/test?agent=...)');
for (const [name, adapter] of Object.entries(adapters)) {
  test(`${name}: every sample normalizes to its kind`, () => {
    const ctx = createContext({ questionHookInstalled: () => true });
    const samples = adapter.samples({ cwd: CWD, session_id: 'test' });
    for (const [kind, payload] of Object.entries(samples)) {
      const e = adapter.normalize(payload, ctx);
      assert.ok(e, `${kind} sample was ignored`);
      assert.strictEqual(e.kind, { approve: 'permission', questions: 'question' }[kind] || kind, `${kind} sample`);
      assert.strictEqual(e.agent, name);
    }
  });
}

console.log('shared context across agents (the relay keeps one ctx for all of them)');
test('a Claude PostToolUse does not resolve a Codex request with the same session_id', () => {
  const ctx = createContext({ questionHookInstalled: () => true });
  const p = adapters.codex.normalize({ session_id: 'X', cwd: CWD, hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'ls' } }, ctx);
  expectAgentKind(p, 'codex', 'permission');
  assert.strictEqual(adapters['claude-code'].normalize({ session_id: 'X', cwd: CWD, hook_event_name: 'PostToolUse', tool_name: 'Bash' }, ctx), null);
  assert.strictEqual(ctx.pending.get(sessionKey('codex', 'X')), 'permission');
  // Codex's own PostToolUse still resolves it.
  expectAgentKind(adapters.codex.normalize({ session_id: 'X', cwd: CWD, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_use_id: 'c9' }, ctx), 'codex', 'resolved');
});
test('a Gemini AfterTool does not resolve a Claude permission with the same session_id', () => {
  const ctx = createContext();
  adapters['claude-code'].normalize({ session_id: 'Y', cwd: CWD, hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_use_id: 'pr-y', tool_input: { command: 'ls' } }, ctx);
  assert.strictEqual(adapters.gemini.normalize({ session_id: 'Y', cwd: CWD, hook_event_name: 'AfterTool', tool_name: 'x' }, ctx), null);
  assert.strictEqual(ctx.pending.get(sessionKey('claude-code', 'Y')), 'permission');
});
test("one agent's PermissionRequest does not dedupe another agent's permission_prompt", () => {
  const ctx = createContext();
  adapters.codex.normalize({ session_id: 'Z', cwd: CWD, hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'ls' } }, ctx);
  const n = adapters['claude-code'].normalize({ session_id: 'Z', cwd: CWD, hook_event_name: 'Notification', notification_type: 'permission_prompt' }, ctx);
  expectAgentKind(n, 'claude-code', 'permission');
});
test('the same tool_use_id from two agents is not a duplicate', () => {
  const ctx = createContext({ questionHookInstalled: () => true });
  const q = (tool) => ({ session_id: 'W', cwd: CWD, hook_event_name: 'PreToolUse', tool_name: tool, tool_use_id: 'same', tool_input: { questions: [{ question: 'Q?', options: [{ label: 'A' }] }] } });
  expectAgentKind(adapters['claude-code'].normalize(q('AskUserQuestion'), ctx), 'claude-code', 'question');
  expectAgentKind(adapters.codex.normalize(q('request_user_input'), ctx), 'codex', 'question');
  assert.strictEqual(adapters['claude-code'].normalize(q('AskUserQuestion'), ctx), null); // its own repeat still is
});
test('test samples of every agent through one ctx keep their kinds', () => {
  const ctx = createContext({ questionHookInstalled: () => true });
  for (const [name, adapter] of Object.entries(adapters)) {
    for (const [kind, payload] of Object.entries(adapter.samples({ cwd: CWD, session_id: 'test' }))) {
      const e = adapter.normalize(payload, ctx);
      assert.ok(e, `${name} ${kind} sample was ignored`);
      assert.strictEqual(e.agent, name);
    }
  }
});

console.log('decision completeness (POST /decision and phone decisions)');
const qEvent = (options) => ({ kind: 'question', options });
const single = qEvent([{ header: 'DB', question: 'Which database?', multiSelect: false, choices: ['Postgres', 'SQLite'] }]);
const several = qEvent([
  { header: 'DB', question: 'Which database?', multiSelect: false, choices: ['Postgres', 'SQLite'] },
  { header: 'Extras', question: 'Which extras?', multiSelect: true, choices: ['Seed', 'Backups'] },
]);
test('a permission needs allow or deny', () => {
  assert.strictEqual(incompleteDecision({ kind: 'permission' }, { behavior: 'allow' }), null);
  assert.strictEqual(incompleteDecision({ kind: 'permission' }, { behavior: 'deny' }), null);
  assert.ok(incompleteDecision({ kind: 'permission' }, { answer: 'Yes' }));
});
test('one question: by text, by header, or a bare answer', () => {
  assert.strictEqual(incompleteDecision(single, { answers: { 'Which database?': 'Postgres' } }), null);
  assert.strictEqual(incompleteDecision(single, { answers: { DB: 'SQLite' } }), null);
  assert.strictEqual(incompleteDecision(single, { answer: 'Postgres' }), null);
  assert.ok(incompleteDecision(single, { answers: {} }));
  assert.ok(incompleteDecision(single, { answers: { 'Which database?': '' } }));
  assert.ok(incompleteDecision(single, { behavior: 'allow' }));
});
test('several questions: every one answered, multi-select as a non-empty array', () => {
  assert.strictEqual(incompleteDecision(several, { answers: { 'Which database?': 'Postgres', 'Which extras?': ['Seed'] } }), null);
  assert.strictEqual(incompleteDecision(several, { answers: { DB: 'Postgres', Extras: ['Seed', 'Backups'] } }), null);
  assert.match(incompleteDecision(several, { answers: { 'Which database?': 'Postgres' } }), /missing: Extras/);
  assert.match(incompleteDecision(several, { answers: { 'Which database?': 'Postgres', 'Which extras?': [] } }), /missing: Extras/);
  assert.ok(incompleteDecision(several, { answer: 'Postgres' }), 'a bare answer only counts for a single question');
  assert.ok(incompleteDecision(several, { answers: ['Postgres', 'Seed'] }), 'answers must be an object');
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
