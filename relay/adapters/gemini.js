'use strict';
// Google Gemini CLI. Hooks installed by `npx nudge-mascot setup --agent gemini` in ~/.gemini/settings.json, running
// `nudge-hook.sh gemini` (POST /hook?agent=gemini).
//
// Sources, read 2026-10-31: the Gemini CLI hooks reference (geminicli.com/docs/hooks/reference) and the source of
// google-gemini/gemini-cli at v0.66.0 (packages/core/src/hooks/hookSystem.ts and types.ts). Gemini CLI was NOT
// installed on the machine this was written on, so no payload here has been captured from a live run.
//   common:       session_id, transcript_path, cwd, hook_event_name, timestamp
//   BeforeAgent:  prompt                                  -> the user typed a prompt: resolved
//   AfterAgent:   prompt, prompt_response, stop_hook_active -> done
//   Notification: notification_type 'ToolPermission' (the only type), message, details
//                 details = { type: 'exec'|'edit'|'mcp'|'info', title, ... } (from source):
//                   exec: command, rootCommand   edit: fileName, filePath, ...   mcp: serverName, toolName,
//                   toolDisplayName   info: prompt, urls
//   AfterTool:    tool_name, tool_input, tool_response   -> the approved tool ran: resolved
// Known upstream bug: google-gemini/gemini-cli#27712 (open) says AfterAgent never fires from settings.json in
// v0.45.0 to v0.55.1, so "Gemini is done" may not arrive on those versions.
// Gemini CLI has no idle notification and no question tool hook here, so there are no idle or question nudges.

function permissionText(hook) {
  const d = hook.details && typeof hook.details === 'object' ? hook.details : {};
  switch (d.type) {
    case 'exec': return d.command ? `Shell: ${d.command}` : '';
    case 'edit': return d.filePath || d.fileName ? `Edit: ${d.filePath || d.fileName}` : '';
    case 'mcp': return d.toolName ? `${d.serverName ? d.serverName + ': ' : ''}${d.toolDisplayName || d.toolName}` : '';
    case 'info': return Array.isArray(d.urls) && d.urls.length ? `Fetch: ${d.urls.join(', ')}` : (d.prompt || '');
    default: return '';
  }
}

function normalize(hook, ctx) {
  const { clip, pending } = ctx;
  if (!hook || typeof hook !== 'object') return null;
  const base = ctx.base(hook, 'gemini');
  const key = ctx.key(base);

  const resolved = () => {
    pending.delete(key);
    return { ...base, kind: 'resolved', title: 'Resolved', message: '' };
  };

  switch (hook.hook_event_name) {
    case 'AfterAgent':
      pending.delete(key);
      return { ...base, kind: 'done', title: 'Gemini is done', message: clip(hook.prompt_response || 'Finished working. Come take a look.', 1200) };

    case 'BeforeAgent':
      return resolved();
    case 'AfterTool':
      if (pending.has(key)) return resolved();
      return null;

    case 'Notification': {
      if (hook.notification_type !== 'ToolPermission') return null;
      const d = hook.details && typeof hook.details === 'object' ? hook.details : {};
      pending.set(key, 'permission');
      return {
        ...base,
        kind: 'permission',
        title: 'Gemini needs permission',
        message: clip(permissionText(hook) || hook.message || 'Gemini is waiting for your approval.', 600),
        tool_name: d.toolName || d.rootCommand || '',
        tool_use_id: '',
        approvable: false, // the Notification hook is observe-only in Gemini CLI: nothing can answer it
      };
    }

    default:
      return null;
  }
}

function samples(common) {
  const ts = new Date().toISOString();
  return {
    permission: { ...common, timestamp: ts, hook_event_name: 'Notification', notification_type: 'ToolPermission', message: 'Tool Confirm Shell Command requires execution',
      details: { type: 'exec', title: 'Confirm Shell Command', command: 'npm publish --access public', rootCommand: 'npm' } },
    done: { ...common, timestamp: ts, hook_event_name: 'AfterAgent', prompt: 'run the tests', prompt_response: 'Test run finished. All 42 tests pass and the branch is ready for review.', stop_hook_active: false },
    resolved: { ...common, timestamp: ts, hook_event_name: 'BeforeAgent', prompt: 'ok' },
  };
}

module.exports = { name: 'gemini', label: 'Gemini', normalize, samples };
