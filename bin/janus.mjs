#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const compiled = join(import.meta.dirname, '..', 'dist', 'cli.js');
const source = join(import.meta.dirname, '..', 'src', 'cli.tsx');
const localTsx = join(import.meta.dirname, '..', 'node_modules', 'tsx', 'dist', 'cli.mjs');

if (existsSync(compiled)) {
  const result = spawnSync(process.execPath, [compiled], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
} else if (existsSync(localTsx)) {
  const result = spawnSync(process.execPath, [localTsx, source], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
} else {
  const result = spawnSync('npx', ['tsx', source], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
