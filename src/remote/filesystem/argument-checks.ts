import type { RemoteFilesystemArgumentsByOperation } from '../protocol-frames.js';
import type { HistoryStep, MoveEntry } from '../../file-navigator/moves.js';
import type { PastePair } from '../../file-navigator/paste.js';
import { isRecord } from '../../value-guards.js';

// The value-shape predicates every filesystem operation's argument validator is built from, and the
// one decode helper two of them share. Kept apart from both the operation table and the frame
// decoder so neither has to import the other to reach them. `nonEmptyString`, which every frame
// decoder needs too, lives in `src/remote/frame/decode-shared.ts`.
const INVALID_ARGUMENTS = 'Invalid remote filesystem operation arguments.';

export function stringValue(value: unknown): value is string {
  return typeof value === 'string';
}

export function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function requireString(value: unknown): string {
  if (typeof value !== 'string') throw new Error(INVALID_ARGUMENTS);
  return value;
}

export function requireStringArray(value: unknown): string[] {
  if (!stringArray(value)) throw new Error(INVALID_ARGUMENTS);
  return value;
}

export function requireBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error(INVALID_ARGUMENTS);
  return value;
}

export function requireDirection(value: unknown): 'undo' | 'redo' {
  if (value !== 'undo' && value !== 'redo') throw new Error(INVALID_ARGUMENTS);
  return value;
}

export function requirePasteMode(value: unknown): 'copy' | 'cut' {
  if (value !== 'copy' && value !== 'cut') throw new Error(INVALID_ARGUMENTS);
  return value;
}

export function policy(value: unknown): value is RemoteFilesystemArgumentsByOperation['move-many']['policy'] {
  return value === undefined || (typeof value === 'string' && ['overwrite-all', 'skip-conflicts'].includes(value));
}

function moveEntry(value: unknown): value is MoveEntry {
  return isRecord(value) && stringValue(value.from) && stringValue(value.to);
}

function pastePair(value: unknown): value is PastePair {
  return isRecord(value) && stringValue(value.from) && stringValue(value.to)
    && (value.identity === undefined || typeof value.identity === 'string' || value.identity === null);
}

function historyStep(value: unknown): value is HistoryStep {
  if (!isRecord(value)) return false;
  if (Array.isArray(value.entries)) return value.entries.every((entry) => moveEntry(entry));
  return (value.mode === 'copy' || value.mode === 'cut')
    && Array.isArray(value.pairs) && value.pairs.every((pair) => pastePair(pair));
}

export function history(value: unknown): value is HistoryStep[] {
  return Array.isArray(value) && value.every((step) => historyStep(step));
}

export function requireHistory(value: unknown): HistoryStep[] {
  if (!history(value)) throw new Error(INVALID_ARGUMENTS);
  return value;
}

// Every path a replay's history steps name, in both directions — the paths `replay` carries instead
// of naming them in its own arguments.
export function historyPaths(steps: HistoryStep[]): string[] {
  return steps.flatMap((step) => 'entries' in step
    ? step.entries.flatMap((entry) => [entry.from, entry.to])
    : step.pairs.flatMap((pair) => [pair.from, pair.to]));
}

// A conflict policy is optional on the wire, so it is spread in only when the client sent one —
// writing `policy: undefined` would put a key on the decoded arguments the operation never carried.
export function optionalPolicy(value: unknown): Pick<RemoteFilesystemArgumentsByOperation['paste'], 'policy'> {
  if (!policy(value)) throw new Error(INVALID_ARGUMENTS);
  return value === undefined ? {} : { policy: value };
}

// `git-commit`'s whole-tree-form root marker, optional for the same reason a conflict policy is.
export function optionalRoot(value: unknown): Pick<RemoteFilesystemArgumentsByOperation['git-commit'], 'root'> {
  if (value !== undefined && !stringValue(value)) {
    throw new Error(INVALID_ARGUMENTS);
  }
  return value === undefined ? {} : { root: value };
}
