'use strict';
// Claude Code. Hooks installed by `npx nudge-mascot setup` in ~/.claude/settings.json (Stop, Notification,
// PreToolUse/AskUserQuestion, PostToolUse, UserPromptSubmit), plus PermissionRequest and PreToolUse/AskUserQuestion
// from the approval hook (installed by `setup`; it waits for the bubble or a paired phone). This is the relay's
// original normalize(), reading its state from ctx (keyed by ctx.key(): agent and session) plus the `agent` field
// that ctx.base() adds.

function normalize(hook, ctx) {
  const { clip, pending, lastPermission, lastDecided, isDuplicate, toolSummary } = ctx;
  if (!hook || typeof hook !== 'object') return null;
  const base = ctx.base(hook, 'claude-code');
  const key = ctx.key(base);

  const resolved = () => {
    pending.delete(key);
    return { ...base, kind: 'resolved', title: 'Resolved', message: '' };
  };

  switch (hook.hook_event_name) {
    case 'Stop':
      pending.delete(key);
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
      if (hook.tool_name === 'AskUserQuestion' || pending.has(key)) return resolved();
      return null;

    case 'PreToolUse': {
      if (hook.tool_name !== 'AskUserQuestion') return null;
      const questions = (hook.tool_input && hook.tool_input.questions) || [];
      const text = questions.map((q) => q.question).filter(Boolean).join('\n\n');
      if (hook.tool_use_id && isDuplicate('claude-code', hook.tool_use_id)) return null;
      pending.set(key, 'question');
      return {
        ...base,
        kind: 'question',
        title: 'Claude has a question',
        message: clip(text || 'Claude is waiting for your answer.', 1200),
        tool_name: 'AskUserQuestion',
        tool_use_id: hook.tool_use_id || '',
        // Answerable from the bubble or the phone only when nudge-approve.js is installed to wait for the answer.
        approvable: !!hook.tool_use_id && ctx.questionHookInstalled(),
        options: questions.map((q) => ({
          header: q.header || '',
          question: q.question || '',
          multiSelect: !!q.multiSelect,
          choices: (q.options || []).map((o) => o.label).filter(Boolean),
        })),
      };
    }

    // Only arrives when the approval hook is installed (setup or pair). Carries what the bubble or a phone needs to answer.
    case 'PermissionRequest':
      pending.set(key, 'permission');
      lastPermission.set(key, Date.now());
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
        case 'permission_prompt': {
          // The approval hook already emitted this request with the tool details (the terminal shows its prompt a few
          // seconds later, in parallel): skip the duplicate while it waits, and for 10 s after the request or after a
          // bubble/phone decision even when PostToolUse already cleared `pending` (a fast answer beats the Notification).
          const now = Date.now();
          const sincePermission = now - (lastPermission.get(key) || 0);
          if (sincePermission < 10000 || now - (lastDecided.get(key) || 0) < 10000) return null;
          if (pending.get(key) === 'permission' && sincePermission < 600000) return null;
          pending.set(key, 'permission');
          return { ...base, kind: 'permission', title: 'Claude needs permission', message: clip(hook.message || 'Claude is waiting for your approval.', 600) };
        }
        case 'idle_prompt':
          return { ...base, kind: 'idle', title: 'Claude is waiting', message: clip(hook.message || 'Claude is waiting for your input.', 600) };
        case 'agent_needs_input':
          pending.set(key, 'question');
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

// Fake payloads for /test and `npx nudge-mascot test`, normalized like real ones.
function samples(common) {
  return {
    question: { ...common, hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_use_id: `test-q-${Date.now()}`,
      tool_input: { questions: [{ header: 'Approach', question: 'This is a test nudge. Which approach should I take for the auth refactor?', options: [{ label: 'Keep sessions' }, { label: 'Move to JWT' }] }] } },
    // Several questions, one multi-select: answered with picks plus "Send answers".
    questions: { ...common, hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_use_id: `test-qs-${Date.now()}`,
      tool_input: { questions: [
        { header: 'Database', question: 'This is a test nudge. Which database should the new service use?', options: [{ label: 'Postgres' }, { label: 'SQLite' }] },
        { header: 'Extras', question: 'Which extras should I add?', multiSelect: true, options: [{ label: 'Migrations' }, { label: 'Seed data' }, { label: 'Backups' }] },
      ] } },
    permission: { ...common, hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'Claude needs your permission to use Bash' },
    done: { ...common, hook_event_name: 'Stop', last_assistant_message: 'Test run finished. All 42 tests pass and the branch is ready for review.' },
    resolved: { ...common, hook_event_name: 'UserPromptSubmit' },
    approve: { ...common, hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_use_id: `test-${Date.now()}`, tool_input: { command: 'npm publish --access public' } },
  };
}

module.exports = { name: 'claude-code', label: 'Claude Code', normalize, samples };
