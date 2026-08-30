import path from 'node:path';
import { containedPath } from '../file-navigator/batch-paths.js';
import { operationDescriptor } from './filesystem-operations.js';
import type { ClientFrame } from './protocol.js';

type RequestFrame = Extract<ClientFrame, { type: 'filesystem-request' }>;

// Every path this request names that does not resolve inside the workspace root. Which paths those
// are is the operation's own business — its table entry names the extractor — so an operation added
// to the protocol cannot pass containment on a fall-through that never looks at its arguments.
//
// The strings come back exactly as the client sent them: the client maps a refusal's paths back
// through its own remote-to-local translation, so anything the server resolved for itself would not
// survive the trip.
export function refusedPaths(frame: RequestFrame, root: string): string[] {
  const descriptor = operationDescriptor(frame.operation);
  return descriptor.paths(frame.args).filter((candidate) => {
    if (candidate === '' && descriptor.rootDestination) return false;
    const relative = path.isAbsolute(candidate) ? path.relative(root, candidate) : candidate;
    return !containedPath(root, relative);
  });
}

// How a containment refusal is answered. An operation whose result type carries a failure channel
// names the refusal shape matching it — `{ ok: false, reason }` for a single item, the same
// `failedPaths`/`failureReasons` report a wholly-refused local batch produces for the rest — so
// callers branch on the result they already handle instead of catching a transport error. An
// operation with nowhere to put a reason names none, reports `classified: false`, and is refused as
// an error reply.
export function refusalFor(frame: RequestFrame): { classified: true; value: unknown } | { classified: false } {
  const descriptor = operationDescriptor(frame.operation);
  if (!descriptor.refusal) return { classified: false };
  return { classified: true, value: descriptor.refusal(frame.args, descriptor.paths(frame.args)) };
}
