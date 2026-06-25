import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LogRecord } from './types.js';

let logDir = '';

export function initLogDir(projectDir: string): void {
  logDir = join(projectDir, '.janissary', 'log');
  mkdirSync(logDir, { recursive: true });
}

function getDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function appendEntry(entry: LogRecord): void {
  if (!logDir) return;
  const path = join(logDir, `${getDateString()}.json`);
  appendFileSync(path, JSON.stringify(entry) + '\n');
}

export function getLogDir(): string {
  return logDir;
}

export function getTimeStr(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}
