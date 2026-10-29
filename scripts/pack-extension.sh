#!/bin/sh
# Zips the extension for Chrome Web Store upload: dist/nudge-<version>.zip
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -p "require('$DIR/extension/manifest.json').version")"
mkdir -p "$DIR/dist"
OUT="$DIR/dist/nudge-$VERSION.zip"
rm -f "$OUT"
(cd "$DIR/extension" && zip -qr "$OUT" . -x '.DS_Store' '*/.DS_Store')
echo "wrote $OUT"
