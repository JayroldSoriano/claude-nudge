#!/bin/sh
# Kept for compatibility: `npx nudge-for-claude-code setup` installs the launch agent.
exec node "$(dirname "$0")/../bin/claude-nudge.js" setup
