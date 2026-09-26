import type { ShellHistoryRun } from '../protocol-frames.js';
import { malformed, nonEmptyString, type DecodeResult } from './decode-shared.js';

// The `shell-history` decoder, in its own module for the same reason `frame-decode-sessions.ts` has
// one: `frame-decode.ts` is the dispatcher, and a frame carrying a list of records is more validation
// than a dispatcher arm should hold.

function decodeRun(value: unknown): ShellHistoryRun | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return;
  const { source, text } = value as Record<string, unknown>;
  if (!(source === 'input' || source === 'output') || typeof text !== 'string') return;
  return { source, text: Buffer.from(text, 'base64').toString('utf8') };
}

/**
 * Every run is checked before any is kept, the way `decodeSessionStateResult` checks its processes and
 * for the same reason: the runs are read in order to rebuild one transcript entry per command, so a
 * silently shortened list would not look short — it would look like a command that produced the next
 * command's output.
 */
export function decodeShellHistory(record: Record<string, unknown>): DecodeResult {
  if (!nonEmptyString(record.id) || !Array.isArray(record.runs)) return malformed('shell-history');
  const runs: ShellHistoryRun[] = [];
  for (const entry of record.runs) {
    const decoded = decodeRun(entry);
    if (!decoded) return malformed('shell-history');
    runs.push(decoded);
  }
  return { type: 'shell-history', id: record.id, runs };
}
