#!/bin/sh
# Kept for compatibility: `npx claude-nudge setup` installs the launch agent.
exec node "$(dirname "$0")/../bin/claude-nudge.js" setup
