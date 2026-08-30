import type { RemoteFilesystemArguments } from './protocol.js';
import type { HistoryStep } from '../file-navigator/moves.js';

// The value-shape predicates every filesystem operation's argument validator is built from, and the
// one decode helper two of them share. Kept apart from both the operation table and the frame
// decoder so neither has to import the other to reach them.

export function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function stringValue(value: unknown): value is string {
  return typeof value === 'string';
}

export function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function policy(value: unknown): boolean {
  return value === undefined || ['overwrite-all', 'skip-conflicts'].includes(String(value));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function moveEntry(value: unknown): boolean {
  return isRecord(value) && stringValue(value.from) && stringValue(value.to);
}

function historyStep(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (Array.isArray(value.entries)) return value.entries.every((entry) => moveEntry(entry));
  return (value.mode === 'copy' || value.mode === 'cut')
    && Array.isArray(value.pairs) && value.pairs.every((pair) => moveEntry(pair));
}

export function history(value: unknown): boolean {
  return Array.isArray(value) && value.every((step) => historyStep(step));
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
export function optionalPolicy(value: unknown): Pick<RemoteFilesystemArguments, 'policy'> {
  return value === undefined ? {} : { policy: value as RemoteFilesystemArguments['policy'] };
}
