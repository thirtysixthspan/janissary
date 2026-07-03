import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

type HistoryEntry = { command: string; tab: string; timestamp: number };

const MAX_ENTRIES = 1000;

let historyPath = '';
let entries: HistoryEntry[] = [];

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
    writeFileSync(historyPath, '[]');
    return;
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(historyPath, 'utf8'));
    entries = Array.isArray(parsed) ? parsed.filter(isHistoryEntry) : [];
  } catch {
    entries = [];
  }
}

export function recordGlobalHistory(command: string, tab: string): void {
  if (!historyPath) return;
  if (entries.at(-1)?.command === command) return;
  entries = [...entries, { command, tab, timestamp: Date.now() }].slice(-MAX_ENTRIES);
  try {
    writeFileSync(historyPath, JSON.stringify(entries, null, 2));
  } catch {
    // persistence failure is non-fatal; in-memory buffer still works
  }
}

export function globalCommands(): string[] {
  if (!historyPath) return [];
  return entries.map((e) => e.command);
}
