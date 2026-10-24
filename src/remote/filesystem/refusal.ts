import path from 'node:path';
import { containedPath } from '../../path-containment.js';
import { OUTSIDE_ROOT_REASON } from '../../file-navigator/file-operation-result.js';
import { operationDescriptor } from './operations.js';
import type { ClientFrame, RemoteFilesystemOperation, RemoteFilesystemOperationRequestFor } from '../protocol-frames.js';
import { physicallyContainedPath } from './path-containment.js';

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
  return descriptor.paths(frame.args as never).filter((candidate) => {
    if (candidate === '' && descriptor.rootDestination) return false;
    const relative = path.isAbsolute(candidate) ? path.relative(root, candidate) : candidate;
    return !containedPath(root, relative) || !physicallyContainedPath(root, relative);
  });
}

export type Refusal = { classified: true; value: unknown } | { classified: false };

// How a failure is answered for one operation. An operation whose result type carries a failure
// channel names the refusal shape matching it — `{ ok: false, reason }` for a single item, the same
// `failedPaths`/`failureReasons` report a wholly-failed local batch produces for the rest — so
// callers branch on the result they already handle instead of catching a transport error. An
// operation with nowhere to put a reason names none, reports `classified: false`, and is refused as
// an error.
//
// Both halves of the channel ask this, with the reason each of them knows: the server for a
// containment refusal, the client for a connection that ended or an error the far side replied with.
export function refusalValueFor<K extends RemoteFilesystemOperation>(
  request: RemoteFilesystemOperationRequestFor<K>, reason: string,
): Refusal {
  const descriptor = operationDescriptor(request.operation);
  if (!descriptor.refusal) return { classified: false };
  return {
    classified: true,
    value: descriptor.refusal(request.args as never, descriptor.paths(request.args as never), reason),
  };
}

// A containment refusal: the request named a path outside the workspace root and ran nothing.
export function refusalFor(frame: RequestFrame): Refusal {
  return refusalValueFor(frame, OUTSIDE_ROOT_REASON);
}
