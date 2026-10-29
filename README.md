# Claude Nudge

Clawd, the orange pixel mascot, waves at you in Chrome when Claude Code has a question,
needs permission, or finished working. A speech bubble over its head shows the question
or Claude's final message so you can stop doomscrolling and go back to the terminal.

```
Claude Code ──hook──▶ hooks/nudge-hook.sh ──POST──▶ relay/server.js ──WebSocket──▶ extension (service worker)
                                                   (127.0.0.1:47831)                       │
                                                                                           ▼
                                                                          content script on the active tab:
                                                                          Clawd waves + speech bubble
```

## Parts

| Path | What it is |
| --- | --- |
| `hooks/nudge-hook.sh` | Claude Code hook. Forwards the hook's JSON payload to the relay with curl. Fire-and-forget, 2s timeout, never blocks Claude. |
| `relay/server.js` | Zero-dependency Node relay. Normalizes `Stop`, `Notification` and `AskUserQuestion` payloads into events and pushes them over WebSocket. Localhost only; rejects any web-page origin. |
| `extension/` | Chrome extension (Manifest V3). Service worker holds the WebSocket; content script renders the pixel Clawd and bubble inside a closed shadow root. Popup has settings and a preview button. |
| `scripts/install-hooks.js` | Merges the hooks into `~/.claude/settings.json` (backs up first). |
| `scripts/install-launchd.sh` | Optional macOS LaunchAgent so the relay starts at login. |

## Setup

1. **Start the relay**

   ```sh
   cd ~/Documents/claude-nudge
   npm start            # or: node relay/server.js
   ```

   To have it start at login and restart itself: `npm run install-service`.

2. **Install the Claude Code hooks**

   ```sh
   npm run install-hooks
   ```

   This adds five hooks to `~/.claude/settings.json` (see `hooks/settings.snippet.json` to do it by hand):
   - `Stop` -> "Claude is done" with the final message
   - `PreToolUse` matcher `AskUserQuestion` -> "Claude has a question" with the question and options
   - `Notification` matcher `permission_prompt|idle_prompt|agent_needs_input|agent_completed`
   - `PostToolUse` and `UserPromptSubmit` -> "resolved": you acted in the terminal, so Clawd goes away everywhere

   Restart any running Claude Code session so it picks up the hooks.

3. **Load the extension**

   Open `chrome://extensions`, turn on Developer mode, click **Load unpacked**, pick the `extension/` folder.
   Tabs that were already open get the content script injected on the first nudge.

4. **Try it**

   Click the extension icon and press **Preview nudge**, or send a test event through the relay:

   ```sh
   npm run test-nudge                                          # a question
   curl -s -X POST 'http://127.0.0.1:47831/test?kind=done'      # done / permission / resolved
   ```

## What gets shown

| Event | Trigger | Bubble | Auto-dismiss |
| --- | --- | --- | --- |
| question | `AskUserQuestion` tool call, `agent_needs_input` | Question text plus the option labels | Never |
| permission | `permission_prompt` notification | Permission message | Never |
| done | `Stop` hook, `agent_completed` | Claude's last message (expandable) | After 20s (configurable) |
| idle | `idle_prompt` notification (60s of waiting) | Waiting message | After 20s; off by default |

The nudge appears on the active tab and follows you: switch tabs or windows and Clawd re-appears there, with the same countdown. Dismissing it in one tab clears it everywhere. If a tab can't run
content scripts (for example `chrome://` pages or the Web Store), a system notification is used instead.
Press Esc, click **Got it**, or click Clawd to dismiss.

## Escalation

For questions and permissions, Claude is blocked until you act, so Clawd gets progressively
harder to ignore. The clock only runs while Chrome is the focused app; time in the terminal
doesn't count. Answering in the terminal (which fires `PostToolUse` or `UserPromptSubmit`) resolves
the nudge everywhere.

| Level | After (default) | Clawd |
| --- | --- | --- |
| 0 | 0s | Corner wave |
| 1 | 15s | Walks to bottom-center, waves harder, hint shows how long you've kept him waiting |
| 2 | 30s | Grows 1.8x, annoyed face, foot tapping, bubble turns red and shakes once |
| 3 | 60s | Short alarm sound (at most once a minute), hops and roams along the bottom edge |

Modes in the popup: **Off**, **Gentle** (levels 1 and 2 only), **Full chaos** (adds level 3).
From level 1 the bubble gets a **Snooze** button (5 minutes by default), which sends Clawd away
and brings him back calm at level 0. "Done" nudges never escalate.

Clawd never blocks the page: only the bubble and Clawd himself catch clicks, everything else passes through.
Sound needs you to have interacted with the page since it loaded (Chrome's autoplay policy); the visual tiers don't depend on it.

## Settings (extension popup)

Which event kinds to show, sound on/off, auto-dismiss seconds, corner position, relay port,
escalation mode, level timings, level-3 sound, and snooze length.
Change the port with `CLAUDE_NUDGE_PORT=...` when starting the relay and match it in the popup.

## Privacy

Everything stays on your machine. The relay binds to `127.0.0.1` and only accepts WebSocket or
`/events` requests from `chrome-extension://` origins (or none, as curl sends), so web pages cannot
read your Claude messages. Assistant messages are clipped to 1200 characters before leaving the relay.

## Roadmap

- "Jump back" button that focuses the terminal app (relay can run `osascript` on macOS).
- Reply to `AskUserQuestion` from the bubble.
- Per-session grouping when several Claude Code sessions run at once.
- Desktop apps (Electron or menu bar) reusing the same relay protocol.
- Firefox port (MV3 with `browser.*`).

## Development

```sh
npm run icons     # regenerate extension/icons from scripts/make-icons.js
node relay/server.js
curl -s http://127.0.0.1:47831/health
echo '{"hook_event_name":"Stop","cwd":"/tmp/demo","last_assistant_message":"All tests pass."}' | sh hooks/nudge-hook.sh
```
