import { failureReasons, failureResult, OUTSIDE_ROOT_REASON } from '../file-navigator/file-operation-result.js';
import type { RemoteFilesystemArguments } from './protocol.js';

// How a containment refusal is shaped for an operation whose result type can carry a reason. Each
// operation's table entry names the one that matches its own result, so a refusal reaches the
// client as the value that operation always answers with rather than as a transport error.
//
// Kept apart from `filesystem-refusal.ts`, which reads the operation table: the table names these,
// so having them here is what keeps the two modules from importing each other.

// A refusal reports every path the request named as failed, not only the offending ones: a refused
// request runs nothing, so none of what the client asked for happened.
function refusedBatch(attempted: string[]): Record<string, unknown> {
  const reasons = new Map(attempted.map((candidate) => [candidate, OUTSIDE_ROOT_REASON]));
  return {
    total: attempted.length,
    failedPaths: attempted,
    ...failureReasons(reasons),
    mutated: false,
  };
}

export function refusedItem(): unknown {
  return failureResult(OUTSIDE_ROOT_REASON);
}

export function refusedMoveMany(_args: RemoteFilesystemArguments, attempted: string[]): unknown {
  return { ...refusedBatch(attempted), moved: [] };
}

export function refusedPaste(_args: RemoteFilesystemArguments, attempted: string[]): unknown {
  return { ...refusedBatch(attempted), pairs: [] };
}

export function refusedDeleteMany(_args: RemoteFilesystemArguments, attempted: string[]): unknown {
  return refusedBatch(attempted);
}

// The stacks come back exactly as the client sent them: nothing was replayed, so neither moved.
export function refusedReplay(args: RemoteFilesystemArguments, attempted: string[]): unknown {
  return {
    result: refusedBatch(attempted),
    undoStack: args.undoStack ?? [],
    redoStack: args.redoStack ?? [],
    mutated: false,
  };
}
