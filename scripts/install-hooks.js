#!/usr/bin/env node
// Kept for compatibility: the installer now lives in the CLI.
require('child_process').execFileSync(process.execPath, [require('path').join(__dirname, '..', 'bin', 'nudge.js'), 'setup'], { stdio: 'inherit' });
