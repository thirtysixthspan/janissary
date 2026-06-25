#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

// Janissary runs as a local web app: this launcher boots the Node server (which opens the
// browser to a token-gated localhost URL) and stays attached so Ctrl+C shuts it down.
const root = join(import.meta.dirname, '..');
const compiled = join(root, 'dist', 'main.js');
const source = join(root, 'src', 'main.ts');
const localTsx = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const args = process.argv.slice(2);

let cmd, cmdArgs;
if (existsSync(compiled)) {
  cmd = process.execPath;
  cmdArgs = [compiled, ...args];
} else if (existsSync(localTsx)) {
  cmd = process.execPath;
  cmdArgs = [localTsx, source, ...args];
} else {
  cmd = 'npx';
  cmdArgs = ['tsx', source, ...args];
}

const result = spawnSync(cmd, cmdArgs, { stdio: 'inherit' });
process.exit(result.status ?? 1);
