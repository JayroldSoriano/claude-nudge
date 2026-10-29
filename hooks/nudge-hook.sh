#!/bin/sh
# Nudge hook: forwards the Claude Code hook payload (stdin JSON) to the local relay.
# Fire-and-forget: 2s timeout, never fails, so Claude Code is never blocked when the relay is down.
PORT="${CLAUDE_NUDGE_PORT:-47831}"
curl -s -m 2 -X POST \
  -H 'Content-Type: application/json' \
  --data-binary @- \
  "http://127.0.0.1:${PORT}/hook" >/dev/null 2>&1 || true
exit 0
