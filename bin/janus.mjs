#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { existsSync } from 'node:fs';

// Janissary runs as a local web app: this launcher boots the Node server (which opens the
// browser to a token-gated localhost URL) and stays attached so Ctrl+C shuts it down.
const root = path.join(import.meta.dirname, '..');
const compiled = path.join(root, 'dist', 'main.js');
const source = path.join(root, 'src', 'main.ts');
const localTsx = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const arguments_ = process.argv.slice(2);

let command, commandArguments;
if (existsSync(compiled)) {
  command = process.execPath;
  commandArguments = [compiled, ...arguments_];
} else if (existsSync(localTsx)) {
  command = process.execPath;
  commandArguments = [localTsx, source, ...arguments_];
} else {
  command = 'npx';
  commandArguments = ['tsx', source, ...arguments_];
}

const result = spawnSync(command, commandArguments, { stdio: 'inherit' });
process.exit(result.status ?? 1);
