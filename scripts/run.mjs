#!/usr/bin/env node
// Unified script runner. All scripts in scripts/ are considered trusted.
// Usage: node scripts/run.mjs <script-name> [args...]
// Example: node scripts/run.mjs pr-merge-to-master

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const name = process.argv[2];
const args = process.argv.slice(3);

if (!name) {
  const { readdirSync } = await import('node:fs');
  const scripts = readdirSync(scriptsDir)
    .filter((f) => f !== 'run.mjs')
    .map((f) => f.replace(/\.(mjs|sh)$/, ''))
    .toSorted((a, b) => a.localeCompare(b));
  console.log('Available scripts:\n' + scripts.map((s) => `  ${s}`).join('\n'));
  process.exit(0);
}

const candidates = [`${name}.mjs`, `${name}.sh`, name];
const found = candidates.map((c) => path.resolve(scriptsDir, c)).find(existsSync);

if (!found) {
  console.error(`run: script not found: ${name}`);
  process.exit(1);
}

const isSh = found.endsWith('.sh');
const cmd = isSh ? 'bash' : 'node';

try {
  execFileSync(cmd, [found, ...args], { stdio: 'inherit' });
} catch (error) {
  process.exit(error.status ?? 1);
}
