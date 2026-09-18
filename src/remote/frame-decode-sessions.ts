import { nonEmptyString } from './filesystem-argument-checks.js';
import type { RemoteFrame, RemoteProcessState } from './protocol.js';

// The `session-state-result` decoder, in its own module for the same reason the filesystem frames
// have one: `frame-decode.ts` is the dispatcher, and a frame carrying a list of records is more
// validation than a dispatcher arm should hold.

type DecodeResult = RemoteFrame | { error: string };

function malformed(): DecodeResult {
  return { error: 'Malformed remote frame "session-state-result".' };
}

function optionalNonEmptyString(value: unknown): value is string | undefined {
  return value === undefined || nonEmptyString(value);
}

function decodeProcessState(value: unknown): RemoteProcessState | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return;
  const { id, program, mode, harness, agentName } = value as Record<string, unknown>;
  if (!nonEmptyString(id) || !nonEmptyString(program) || !(mode === 'pty' || mode === 'pipe')
    || !optionalNonEmptyString(harness) || !optionalNonEmptyString(agentName)) return;
  return {
    id, program, mode,
    ...(harness !== undefined && { harness }),
    ...(agentName !== undefined && { agentName }),
  };
}

/**
 * Every entry is checked before any is kept, so a peer describing one malformed process makes the
 * whole answer malformed rather than silently shortening the list a reattach then builds tabs from —
 * a short list would look exactly like a process that had exited, and the session would be ended for
 * being empty.
 */
export function decodeSessionStateResult(record: Record<string, unknown>): DecodeResult {
  if (!Array.isArray(record.processes)) return malformed();
  const processes: RemoteProcessState[] = [];
  for (const entry of record.processes) {
    const decoded = decodeProcessState(entry);
    if (!decoded) return malformed();
    processes.push(decoded);
  }
  return { type: 'session-state-result', processes };
}
