import { refusalValueFor } from '../../remote/filesystem/refusal.js';
import type { RemoteFilesystemArguments, RemoteFilesystemOperation } from '../../remote/protocol-frames.js';

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
export const TIMED_OUT_REASON = 'The remote machine did not answer in time.';

// How long a request may wait for its reply before it is settled as unanswered. A reply can be lost
// without the channel ever closing: the transport dies with the request in it and the session comes
// back, or the detached peer's bounded replay buffer evicts the reply before reattach. Nothing else
// would ever settle such a request — a pull would stay `pulling` and block every later pull and
// commit, a listing would never load. The deadline is not failed early on a reconnect, because the
// peer replays what it queued and a reply still in that queue arrives after reattach.
//
// Generous on purpose: a spurious timeout reports a failure for work that may still land, so the
// deadline only has to bound a lost reply, not a slow one. Operations that do real work on the far
// side — git, search, bulk moves and pastes, history replay, whole-file transfers — get far longer.
export const REQUEST_DEADLINE_MS = 60_000;
export const LONG_REQUEST_DEADLINE_MS = 600_000;

const LONG_RUNNING: ReadonlySet<RemoteFilesystemOperation> = new Set([
  'git-pull', 'git-commit', 'search', 'move-many', 'delete-many', 'paste', 'replay', 'read-file', 'write-file',
]);

export function requestDeadline(operation: RemoteFilesystemOperation): number {
  return LONG_RUNNING.has(operation) ? LONG_REQUEST_DEADLINE_MS : REQUEST_DEADLINE_MS;
}

// The operation and arguments travel with the callbacks because that is what naming a failure shape
// requires; the request id alone cannot say which shape an unanswered request needs.
type Pending = {
  operation: RemoteFilesystemOperation;
  args: RemoteFilesystemArguments;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

type Waiting = { pending: Pending; timer: ReturnType<typeof setTimeout> };

export class RemotePortRequests {
  private waiting = new Map<string, Waiting>();

  constructor(private deadline: (operation: RemoteFilesystemOperation) => number = requestDeadline) {}

  add(request: string, pending: Pending): void {
    const timer = setTimeout(() => { this.expire(request); }, this.deadline(pending.operation));
    timer.unref?.();
    this.waiting.set(request, { pending, timer });
  }

  // A reply arrived. `undefined` error means success; anything else is a far-side failure, which for
  // a value-returning operation is still a value rather than a transport error. A reply to a request
  // already settled — expired, or failed by a close — finds nothing and is dropped.
  answer(request: string, result: unknown, error: string | undefined): void {
    const pending = this.take(request);
    if (!pending) return;
    if (error === undefined) { pending.resolve(result); return; }
    settle(pending, error);
  }

  // Settle everything still waiting. The map is emptied before any callback runs, so a second close
  // or a `dispose` after one finds nothing left to settle twice.
  failAll(reason: string): void {
    const outstanding = [...this.waiting.values()];
    this.waiting.clear();
    for (const { pending, timer } of outstanding) {
      clearTimeout(timer);
      settle(pending, reason);
    }
  }

  private expire(request: string): void {
    const pending = this.take(request);
    if (pending) settle(pending, TIMED_OUT_REASON);
  }

  private take(request: string): Pending | undefined {
    const waiting = this.waiting.get(request);
    if (!waiting) return undefined;
    this.waiting.delete(request);
    clearTimeout(waiting.timer);
    return waiting.pending;
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
