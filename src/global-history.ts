import { mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { atomicWriteFile } from './atomic-write.js';
import { errorText } from './error-text.js';

type HistoryEntry = { command: string; tab: string; timestamp: number };

type HistoryFile =
  | { kind: 'missing' }
  | { kind: 'ok'; entries: HistoryEntry[] }
  | { kind: 'error'; message: string };

const MAX_ENTRIES = 1000;

let historyPath = '';
let entries: HistoryEntry[] = [];
let failureReported = false;
let writesSuppressed = false;

function reportFailure(message: string): void {
  if (failureReported) return;
  failureReported = true;
  process.stderr.write(`warning: global command history unavailable: ${message}\n`);
}

function writeEntries(list: HistoryEntry[]): boolean {
  try {
    atomicWriteFile(historyPath, JSON.stringify(list, null, 2));
    failureReported = false;
    return true;
  } catch (error) {
    reportFailure(errorText(error));
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

function readHistoryFile(): HistoryFile {
  try {
    const parsed: unknown = JSON.parse(readFileSync(historyPath, 'utf8'));
    if (!Array.isArray(parsed)) throw new Error('history.json must contain an array');
    return { kind: 'ok', entries: parsed.filter(isHistoryEntry) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'missing' };
    return { kind: 'error', message: errorText(error) };
  }
}

function suppressWrites(message: string): void {
  writesSuppressed = true;
  reportFailure(`could not read history.json (${message})`);
}

function appendEntry(list: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  if (list.at(-1)?.command === entry.command) return list;
  return [...list, entry].slice(-MAX_ENTRIES);
}

export function initGlobalHistory(home?: string): void {
  const base = home ?? homedir();
  const dir = path.join(base, '.janissary');
  mkdirSync(dir, { recursive: true });
  historyPath = path.join(dir, 'history.json');
  writesSuppressed = false;
  const file = readHistoryFile();
  if (file.kind === 'missing') {
    entries = [];
    writeEntries(entries);
    return;
  }
  if (file.kind === 'error') {
    entries = [];
    suppressWrites(file.message);
    return;
  }
  entries = file.entries;
  failureReported = false;
}

export function recordGlobalHistory(command: string, tab: string): void {
  if (!historyPath) return;
  const entry = { command, tab, timestamp: Date.now() };
  if (writesSuppressed) {
    entries = appendEntry(entries, entry);
    return;
  }
  const file = readHistoryFile();
  if (file.kind === 'error') {
    suppressWrites(file.message);
    entries = appendEntry(entries, entry);
    return;
  }
  const base = file.kind === 'ok' ? file.entries : [];
  const next = appendEntry(base, entry);
  if (next === base) {
    entries = base;
    return;
  }
  entries = writeEntries(next) ? next : appendEntry(entries, entry);
}

export function globalCommands(): string[] {
  if (!historyPath) return [];
  return entries.map((e) => e.command);
}
