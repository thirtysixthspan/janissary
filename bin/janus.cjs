#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const script = path.join(__dirname, '..', 'src', 'cli.tsx');
const result = spawnSync('npx', ['tsx', script], {
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
