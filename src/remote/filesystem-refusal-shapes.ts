import { failureReasons, failureResult } from '../file-navigator/file-operation-result.js';
import type { RemoteFilesystemArguments } from './protocol.js';

// How a refusal is shaped for an operation whose result type can carry a reason. Each operation's
// table entry names the one that matches its own result, so a refusal reaches the caller as the
// value that operation always answers with rather than as a transport error.
//
// The `reason` is the refusing side's to supply: the server refuses for containment, the client for
// a connection that ended or a far-side error. The shape is the same either way, which is the point
// — a caller branches on one report whatever went wrong.
//
// Kept apart from `filesystem-refusal.ts`, which reads the operation table: the table names these,
// so having them here is what keeps the two modules from importing each other.

// A refusal reports every path the request named as failed, not only the offending ones: a refused
// request runs nothing, so none of what the caller asked for happened.
function refusedBatch(attempted: string[], reason: string): Record<string, unknown> {
  const reasons = new Map(attempted.map((candidate) => [candidate, reason]));
  return {
    total: attempted.length,
    failedPaths: attempted,
    ...failureReasons(reasons),
    mutated: false,
  };
}

export function refusedItem(_args: RemoteFilesystemArguments, _attempted: string[], reason: string): unknown {
  return failureResult(reason);
}

export function refusedMoveMany(_args: RemoteFilesystemArguments, attempted: string[], reason: string): unknown {
  return { ...refusedBatch(attempted, reason), moved: [] };
}

export function refusedPaste(_args: RemoteFilesystemArguments, attempted: string[], reason: string): unknown {
  return { ...refusedBatch(attempted, reason), pairs: [] };
}

export function refusedDeleteMany(_args: RemoteFilesystemArguments, attempted: string[], reason: string): unknown {
  return refusedBatch(attempted, reason);
}

// The stacks come back exactly as the caller sent them: nothing was replayed, so neither moved.
export function refusedReplay(args: RemoteFilesystemArguments, attempted: string[], reason: string): unknown {
  return {
    result: refusedBatch(attempted, reason),
    undoStack: args.undoStack ?? [],
    redoStack: args.redoStack ?? [],
    mutated: false,
  };
}
