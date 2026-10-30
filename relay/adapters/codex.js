'use strict';
// OpenAI Codex CLI. Hooks installed by `npx nudge-mascot setup --agent codex` in ~/.codex/hooks.json, running
// `nudge-hook.sh codex` (POST /hook?agent=codex).
//
// Source: the official Codex hooks reference (developers.openai.com/codex/hooks, read 2026-10-31). Codex was NOT
// installed on the machine this was written on, so no payload here has been captured from a live Codex run.
// Documented and relied on:
//   common:            session_id, transcript_path, cwd, hook_event_name, model, permission_mode, turn_id
//   PermissionRequest: tool_name, tool_input (Bash and apply_patch put the command or patch in tool_input.command;
//                      tool_input.description is an optional human-readable reason). Runs only when Codex is
//                      about to ask for approval. The docs list no tool_use_id.
//   PostToolUse:       tool_name, tool_use_id, tool_input, tool_response
//   UserPromptSubmit:  prompt
//   Stop:              stop_hook_active, last_assistant_message (string or null)
// UNVERIFIED: PreToolUse for `request_user_input` (Codex's ask-the-user tool) and its tool_input.questions shape
// ({ header, question, options: [{ label }] }). The docs only promise hooks for Bash, apply_patch and MCP tools;
// if Codex does not fire hooks for request_user_input, the question case simply never runs.
// Codex has no Notification or idle event, so there are no idle nudges for Codex.

const QUESTION_TOOL = 'request_user_input';

// apply_patch carries the whole patch in tool_input.command; show the files it touches instead.
function patchFiles(patch) {
  const files = [];
  for (const m of String(patch || '').matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)) files.push(m[1].trim());
  return files.join(', ');
}

function summary(hook, ctx) {
  const input = hook.tool_input || {};
  if (hook.tool_name === 'apply_patch') return patchFiles(input.command) || 'apply a patch';
  if (Array.isArray(input.command)) return input.command.join(' ');
  if (typeof input.command === 'string') return input.command;
  const rest = { ...input };
  delete rest.description; // shown on its own line
  return ctx.toolSummary(hook.tool_name, rest);
}

function normalize(hook, ctx) {
  const { clip, pending } = ctx;
  if (!hook || typeof hook !== 'object') return null;
  const base = ctx.base(hook, 'codex');
  const key = ctx.key(base);

  const resolved = () => {
    pending.delete(key);
    return { ...base, kind: 'resolved', title: 'Resolved', message: '' };
  };

  switch (hook.hook_event_name) {
    case 'Stop':
      pending.delete(key);
      return { ...base, kind: 'done', title: 'Codex is done', message: clip(hook.last_assistant_message || 'Finished working. Come take a look.', 1200) };

    case 'UserPromptSubmit':
      return resolved();
    // The tool ran, so whatever the user was asked about has been answered in the terminal.
    case 'PostToolUse':
      if (hook.tool_name === QUESTION_TOOL || pending.has(key)) return resolved();
      return null;

    case 'PreToolUse': { // UNVERIFIED, see the header
      if (hook.tool_name !== QUESTION_TOOL) return null;
      if (hook.tool_use_id && ctx.isDuplicate('codex', hook.tool_use_id)) return null;
      const questions = (hook.tool_input && hook.tool_input.questions) || [];
      const text = questions.map((q) => q.question).filter(Boolean).join('\n\n');
      pending.set(key, 'question');
      return {
        ...base,
        kind: 'question',
        title: 'Codex has a question',
        message: clip(text || 'Codex is waiting for your answer.', 1200),
        tool_name: QUESTION_TOOL,
        tool_use_id: hook.tool_use_id || '',
        approvable: false, // answering from the phone is Claude Code only for now
        options: questions.map((q) => ({
          header: q.header || '',
          question: q.question || '',
          multiSelect: !!q.multiSelect,
          choices: (q.options || []).map((o) => o.label).filter(Boolean),
        })),
      };
    }

    case 'PermissionRequest': {
      pending.set(key, 'permission');
      const why = hook.tool_input && hook.tool_input.description;
      return {
        ...base,
        kind: 'permission',
        title: 'Codex needs permission',
        message: clip(`${hook.tool_name || 'Tool'}: ${summary(hook, ctx)}${why ? `\n${why}` : ''}`, 600),
        tool_name: hook.tool_name || '',
        tool_use_id: hook.tool_use_id || '',
        approvable: false, // the phone's Allow / Deny is Claude Code only for now (see README, "Other agents")
      };
    }

    default:
      return null;
  }
}

function samples(common) {
  return {
    question: { ...common, hook_event_name: 'PreToolUse', turn_id: 'test', tool_name: QUESTION_TOOL, tool_use_id: `test-q-${Date.now()}`,
      tool_input: { questions: [{ header: 'Approach', question: 'This is a test nudge. Which approach should I take for the auth refactor?', options: [{ label: 'Keep sessions' }, { label: 'Move to JWT' }] }] } },
    permission: { ...common, hook_event_name: 'PermissionRequest', turn_id: 'test', tool_name: 'Bash', tool_input: { command: 'npm publish --access public', description: 'Publishes the package to npm' } },
    done: { ...common, hook_event_name: 'Stop', turn_id: 'test', stop_hook_active: false, last_assistant_message: 'Test run finished. All 42 tests pass and the branch is ready for review.' },
    resolved: { ...common, hook_event_name: 'UserPromptSubmit', turn_id: 'test', prompt: 'ok' },
  };
}

module.exports = { name: 'codex', label: 'Codex', normalize, samples };
