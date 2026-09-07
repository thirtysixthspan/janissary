import { refusalValueFor } from '../remote/filesystem-refusal.js';
import type { RemoteFilesystemArguments, RemoteFilesystemOperation } from '../remote/protocol.js';

// One remote session's outstanding filesystem requests, and how each one is settled when no answer
// is coming. Split out of `RemoteFileSystemPort` to keep it under the file-size limit — see
// `ai/guidelines/code-guidelines.md`.
//
// The settlement rule is the `FileSystemPort` contract's, not this module's: an operation whose
// result type can express failure is answered with the per-path report a local tree produces for the
// same action, so the navigator renders it rather than the client receiving a bare error carrying no
// result at all. An operation returning raw data with nowhere to put a reason has only rejection.
//
// The paths such a report echoes are the ones the request carried, in remote form — the same route a
// server-side containment refusal travels, so each port method's own result mapping translates them
// back unchanged.

export const CLOSED_REASON = 'The remote file navigator is closed.';
export const ENDED_REASON = 'The remote connection ended.';

// The operation and arguments travel with the callbacks because that is what naming a failure shape
// requires; the request id alone cannot say which shape an unanswered request needs.
type Pending = {
  operation: RemoteFilesystemOperation;
  args: RemoteFilesystemArguments;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

export class RemotePortRequests {
  private pending = new Map<string, Pending>();

  add(request: string, pending: Pending): void {
    this.pending.set(request, pending);
  }

  // A reply arrived. `undefined` error means success; anything else is a far-side failure, which for
  // a value-returning operation is still a value rather than a transport error.
  answer(request: string, result: unknown, error: string | undefined): void {
    const pending = this.pending.get(request);
    if (!pending) return;
    this.pending.delete(request);
    if (error === undefined) { pending.resolve(result); return; }
    settle(pending, error);
  }

  // Settle everything still waiting. The map is emptied before any callback runs, so a second close
  // or a `dispose` after one finds nothing left to settle twice.
  failAll(reason: string): void {
    const outstanding = [...this.pending.values()];
    this.pending.clear();
    for (const pending of outstanding) settle(pending, reason);
  }
}

// A request that was never sent, because the session was already gone. Same rule, expressed as a
// return value rather than a callback: a value-returning operation gets its report, and the rest
// throw, which is what their half of the contract says.
export function unavailableResult<T>(
  operation: RemoteFilesystemOperation, args: RemoteFilesystemArguments, reason: string,
): T {
  const refusal = refusalValueFor(operation, args, reason);
  if (!refusal.classified) throw new Error(reason);
  return refusal.value as T;
}

function settle(pending: Pending, reason: string): void {
  const refusal = refusalValueFor(pending.operation, pending.args, reason);
  if (refusal.classified) pending.resolve(refusal.value);
  else pending.reject(new Error(reason));
}
