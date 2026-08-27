import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { atomicWriteFile } from './atomic-write.js';

type HistoryEntry = { command: string; tab: string; timestamp: number };

const MAX_ENTRIES = 1000;

let historyPath = '';
let entries: HistoryEntry[] = [];
let failureReported = false;

function reportFailure(message: string): void {
  if (failureReported) return;
  failureReported = true;
  process.stderr.write(`warning: global command history unavailable: ${message}\n`);
}

function writeEntries(): boolean {
  try {
    atomicWriteFile(historyPath, JSON.stringify(entries, null, 2));
    failureReported = false;
    return true;
  } catch (error) {
    reportFailure(error instanceof Error ? error.message : String(error));
    return false;
  }
}

function isHistoryEntry(x: unknown): x is HistoryEntry {
  return (
    typeof x === 'object' && x !== null &&
    typeof (x as HistoryEntry).command === 'string' &&
    typeof (x as HistoryEntry).tab === 'string' &&
    typeof (x as HistoryEntry).timestamp === 'number'
  );
}

export function initGlobalHistory(home?: string): void {
  const base = home ?? homedir();
  const dir = path.join(base, '.janissary');
  mkdirSync(dir, { recursive: true });
  historyPath = path.join(dir, 'history.json');
  if (!existsSync(historyPath)) {
    entries = [];
    writeEntries();
    return;
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(historyPath, 'utf8'));
    if (!Array.isArray(parsed)) throw new Error('history.json must contain an array');
    entries = parsed.filter(isHistoryEntry);
    failureReported = false;
  } catch (error) {
    entries = [];
    const message = error instanceof Error ? error.message : String(error);
    reportFailure(`could not read history.json (${message})`);
  }
}

export function recordGlobalHistory(command: string, tab: string): void {
  if (!historyPath) return;
  if (entries.at(-1)?.command === command) return;
  entries = [...entries, { command, tab, timestamp: Date.now() }].slice(-MAX_ENTRIES);
  writeEntries();
}

export function globalCommands(): string[] {
  if (!historyPath) return [];
  return entries.map((e) => e.command);
}
