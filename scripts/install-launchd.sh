#!/bin/sh
# Installs a macOS LaunchAgent so the relay starts at login and restarts if it dies.
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
PLIST="$HOME/Library/LaunchAgents/com.claude-nudge.relay.plist"
mkdir -p "$HOME/Library/LaunchAgents" "$DIR/relay/logs"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.claude-nudge.relay</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$DIR/relay/server.js</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$DIR/relay/logs/relay.log</string>
  <key>StandardErrorPath</key><string>$DIR/relay/logs/relay.err</string>
</dict></plist>
PL
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "Relay installed as LaunchAgent: $PLIST"
echo "Logs: $DIR/relay/logs/"
