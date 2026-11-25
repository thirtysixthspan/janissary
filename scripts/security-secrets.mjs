#!/usr/bin/env node
// Scan for committed secrets with gitleaks, the `npm run security:secrets` step.
//
// gitleaks is a standalone binary, not an npm package, so it may be absent. A missing binary
// downgrades to a warning and a clean exit, so `npm run security` still runs the dependency audit.
// When gitleaks is installed, its output and exit status pass through unchanged.
import { spawnSync } from 'node:child_process';

const result = spawnSync('gitleaks', ['detect', '--no-banner', '--redact'], { stdio: 'inherit' });

if (result.error?.code === 'ENOENT') {
  console.error(
    'security:secrets: WARNING — gitleaks is not installed; secrets were not scanned. '
      + 'Install it with `brew install gitleaks` or from https://github.com/gitleaks/gitleaks/releases.',
  );
  process.exit(0);
}

if (result.error) {
  console.error(`security:secrets: could not run gitleaks: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
