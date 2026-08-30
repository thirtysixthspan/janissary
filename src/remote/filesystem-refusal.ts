import path from 'node:path';
import { containedPath } from '../file-navigator/batch-paths.js';
import {
  failureReasons, failureResult, OUTSIDE_ROOT_REASON,
} from '../file-navigator/file-operation-result.js';
import type { ClientFrame } from './protocol.js';
import type { HistoryStep } from '../file-navigator/moves.js';

type RequestFrame = Extract<ClientFrame, { type: 'filesystem-request' }>;

// Operations whose empty path means the workspace root itself rather than an unnamed path, so an
// empty candidate is legitimate for them and is not a containment failure.
const ROOT_DESTINATION_OPERATIONS = new Set<RequestFrame['operation']>([
  'read-directory', 'watch', 'unwatch', 'move', 'move-many', 'paste', 'create-file', 'create-directory',
]);

// The operations whose result type has no failure channel at all — they answer with directory
// entries, stats, file content, or nothing — so a refusal has nowhere to live in the value and is
// reported as an error reply instead. Every other operation is classified; see `refusalFor`.
const UNCLASSIFIABLE_OPERATIONS = new Set<RequestFrame['operation']>([
  'read-directory', 'stat', 'watch', 'unwatch', 'git', 'search', 'read-file',
]);

function historyPaths(steps: HistoryStep[]): string[] {
  return steps.flatMap((step) => 'entries' in step
    ? step.entries.flatMap((entry) => [entry.from, entry.to])
    : step.pairs.flatMap((pair) => [pair.from, pair.to]));
}

function requestPaths(frame: RequestFrame): string[] {
  const { operation, args } = frame;
  switch (operation) {
  case 'stat':
  case 'delete-many': { return args.paths ?? []; }
  case 'move-many': { return [...(args.sources ?? []), args.destination ?? '']; }
  case 'paste': { return [...(args.sources ?? []), args.destination ?? '']; }
  case 'move': { return [args.from ?? '', args.to ?? '']; }
  case 'git':
  case 'search': { return []; }
  case 'replay': { return historyPaths([...(args.undoStack ?? []), ...(args.redoStack ?? [])] as HistoryStep[]); }
  default: { return [args.path ?? args.destination ?? '']; }
  }
}

// Every path this request names that does not resolve inside the workspace root. The strings come
// back exactly as the client sent them: the client maps a refusal's paths back through its own
// remote-to-local translation, so anything the server resolved for itself would not survive.
export function refusedPaths(frame: RequestFrame, root: string): string[] {
  const rootDestination = ROOT_DESTINATION_OPERATIONS.has(frame.operation);
  return requestPaths(frame).filter((candidate) => {
    if (candidate === '' && rootDestination) return false;
    const relative = path.isAbsolute(candidate) ? path.relative(root, candidate) : candidate;
    return !containedPath(root, relative);
  });
}

// A refusal reports every path the request named as failed, not only the offending ones: a refused
// request runs nothing, so none of what the client asked for happened.
function refusedBatch(frame: RequestFrame): Record<string, unknown> {
  const attempted = requestPaths(frame);
  const reasons = new Map(attempted.map((candidate) => [candidate, OUTSIDE_ROOT_REASON]));
  return {
    total: attempted.length,
    failedPaths: attempted,
    ...failureReasons(reasons),
    mutated: false,
  };
}

function refusedValue(frame: RequestFrame): unknown {
  switch (frame.operation) {
  case 'move-many': { return { ...refusedBatch(frame), moved: [] }; }
  case 'paste': { return { ...refusedBatch(frame), pairs: [] }; }
  case 'delete-many': { return refusedBatch(frame); }
  case 'replay': {
    return {
      result: refusedBatch(frame),
      undoStack: frame.args.undoStack ?? [],
      redoStack: frame.args.redoStack ?? [],
      mutated: false,
    };
  }
  default: { return failureResult(OUTSIDE_ROOT_REASON); }
  }
}

// How a containment refusal is answered. An operation whose result type carries a failure channel
// answers with a value shaped like its own result — `{ ok: false, reason }` for a single item, the
// same `failedPaths`/`failureReasons` report a wholly-refused local batch produces for the rest —
// so callers branch on the result they already handle instead of catching a transport error. The
// operations with nowhere to put a reason report `classified: false` and are refused as an error.
export function refusalFor(frame: RequestFrame): { classified: true; value: unknown } | { classified: false } {
  if (UNCLASSIFIABLE_OPERATIONS.has(frame.operation)) return { classified: false };
  return { classified: true, value: refusedValue(frame) };
}
