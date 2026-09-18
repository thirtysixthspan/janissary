import type { Managers } from '../managers.js';
import { terminateRemoteEntry, type RemoteEntry } from './reattach.js';
import type { RemoteProcessState, ServerFrame } from './protocol.js';

// A launch that is really a reattach. The workspace already exists on the far side, so this side
// brings the session id and the directory the record remembers rather than asking for a new clone,
// and the peer's answer is what decides whether there was anything to come back to.

export type RemoteResume = {
  session: string;
  workspaceDir: string;
  // Told which way the peer answered. Accepted means "now ask what is still running there"; refused
  // establishes that the session is over and the record describes nothing.
  onResult: (accepted: boolean) => void;
  // The launch never got as far as an answer: an unreachable host, a failed authentication, a
  // `janus` missing from the remote PATH. It establishes nothing about the session, so the record
  // survives and the row keeps its reattach button.
  onFailed?: (message: string) => void;
};

/**
 * Settle the placeholder tab of an accepted reattach. A reattach answers no `workspace-ready` — the
 * clone was made by the launch this is resuming — so the recorded directory is what resolves the
 * promise the tab is waiting on, through the very path a fresh provision resolves it. Without this
 * the tab would sit as a placeholder until its own deadline and then close, with a working session
 * behind it.
 */
function settleResume(entry: RemoteEntry, resume: RemoteResume, label: string): void {
  if (!entry.closed) {
    entry.workspaceDir = resume.workspaceDir;
    entry.settled = true;
    entry.resolveReady(resume.workspaceDir);
  }
  entry.handlers.get(label)?.onReady(resume.workspaceDir);
  resume.onResult(true);
}

// Cleared by the first answer, so a later transport loss runs the ordinary reconnect path rather
// than re-entering the resume one.
export type ResumeState = { resuming: boolean };

/**
 * The peer's answer to a reattach, whichever kind of reattach it was. A reconnect after a lost
 * transport and a resume from a record are the same exchange, which is the point: one connection
 * routine serves both, and this is the one place their answers diverge — a resume also has a
 * placeholder tab waiting and a caller waiting to be told.
 *
 * A refusal establishes termination: the peer is there and says that session is over, so the entry
 * is terminated rather than retried.
 */
export function handleReattachResult(
  managers: Managers,
  entry: RemoteEntry,
  frame: Extract<ServerFrame, { type: 'reattach-result' }>,
  label: string,
  resume: RemoteResume | undefined,
  state: ResumeState,
  onTruncated: () => void,
): void {
  if (frame.accepted) {
    entry.reconnect.accepted();
    if (frame.truncated) onTruncated();
    if (state.resuming && resume) { state.resuming = false; settleResume(entry, resume, label); }
    return;
  }
  if (state.resuming && resume) { state.resuming = false; resume.onResult(false); }
  terminateRemoteEntry(managers, entry);
}

// How long a peer that has already accepted the reattach has to answer what is running in its
// workspace. The ssh connection is up and the handshake is done by this point, so what is being
// waited on is one frame from a local process on the far host. Deliberately looser than the
// reconnect backoff's 15-second connect deadline: a peer under load answering slowly is not a dead
// one, and calling it dead would park a session that was about to come back.
export const SESSION_STATE_TIMEOUT_MS = 30_000;

/**
 * Ask the peer what is still running in its workspace. The local side knows what it once started;
 * only the far side knows what survived, and a reattach has to open one tab per surviving process
 * rather than a single representative one.
 *
 * Resolves `undefined` when no answer comes — the deadline passes, or the entry stops being able to
 * answer. That is deliberately distinguishable from an empty list: an empty list is the peer saying
 * its workspace is empty, which ends the session, while no answer establishes nothing and leaves the
 * row parked with its reattach button. A peer can accept a reattach and then never answer this —
 * most concretely when a remote `janus` was upgraded while the session sat detached, since the
 * handshake is answered by the relaying process rather than by the parked peer behind it.
 */
export function askSessionState(entry: RemoteEntry): Promise<RemoteProcessState[] | undefined> {
  return new Promise((resolve) => {
    const deadline = setTimeout(() => { entry.sessionState = undefined; resolve(undefined); },
      SESSION_STATE_TIMEOUT_MS);
    entry.sessionState = (processes) => { clearTimeout(deadline); resolve(processes); };
    entry.channel.send({ type: 'session-state' });
  });
}

export function answerSessionState(entry: RemoteEntry, processes: RemoteProcessState[]): void {
  const resolve = entry.sessionState;
  entry.sessionState = undefined;
  resolve?.(processes);
}

// The entry can no longer answer — it was terminated or detached — so a waiter is released now
// rather than left to wait out a deadline for something that can never arrive.
export function cancelSessionState(entry: RemoteEntry): void {
  const resolve = entry.sessionState;
  entry.sessionState = undefined;
  resolve?.(undefined);
}
