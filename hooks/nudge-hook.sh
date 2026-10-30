#!/bin/sh
# Nudge hook: forwards the coding agent's hook payload (stdin JSON) to the local relay.
# Optional first argument: the agent (codex, gemini), sent as ?agent=... so the relay picks its adapter.
# No argument means Claude Code. Fire-and-forget: 2s timeout, never fails, so the agent is never blocked
# when the relay is down.
# The X-Nudge-* headers name the terminal this agent session runs in (read from the environment the hook
# inherits, no extra processes), so "Jump to terminal" in the bubble can switch back to it.
# X-Nudge-Secret is the per-install secret `setup` minted; the relay refuses hooks without it. Read with the shell's
# own `read` (no extra process); it returns non-zero at a missing final newline, hence the `|| true`.
PORT="${CLAUDE_NUDGE_PORT:-47831}"
QUERY=""
case "${1:-}" in
  "" | *[!a-z0-9-]*) ;;
  *) QUERY="?agent=$1" ;;
esac
curl -s -m 2 -X POST \
  -H 'Content-Type: application/json' \
  --data-binary @- \
  "http://127.0.0.1:${PORT}/hook${QUERY}" >/dev/null 2>&1 || true
exit 0
