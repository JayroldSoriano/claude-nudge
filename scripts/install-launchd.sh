#!/bin/sh
# Kept for compatibility: `npx nudge-mascot setup` installs the launch agent.
exec node "$(dirname "$0")/../bin/nudge.js" setup
