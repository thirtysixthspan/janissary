#!/usr/bin/env node
import { existsSync, chmodSync, readdirSync } from 'node:fs';
import path from 'node:path';

const prebuildsDir = path.join('node_modules', 'node-pty', 'prebuilds');

if (existsSync(prebuildsDir)) {
  for (const platform of readdirSync(prebuildsDir)) {
    const spawnHelper = path.join(prebuildsDir, platform, 'spawn-helper');
    if (existsSync(spawnHelper)) {
      chmodSync(spawnHelper, 0o755);
    }
  }
}
