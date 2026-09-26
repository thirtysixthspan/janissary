import type { ProjectTokens } from '../project/tokens.js';
import type { GitIdentity } from '../git/identity.js';
import type { RootRefusal } from './root-refusal.js';

// The frame shapes of the remote protocol, split out of `protocol.ts` so the wire *codec* and the
// wire *grammar* are two files: this one says what a frame may carry, `protocol.ts` says how one is
// encoded, split and decoded. Every symbol here is re-exported from `protocol.ts`, so the protocol
// is still imported from one module.

export type RemoteFilesystemOperation =
  | 'read-directory' | 'stat' | 'watch' | 'unwatch' | 'git' | 'git-pull' | 'git-commit' | 'search'
  | 'read-file' | 'write-file' | 'move' | 'move-many' | 'delete' | 'delete-many' | 'rename' | 'paste'
  | 'create-file' | 'create-directory' | 'replay';

export type RemoteFilesystemArguments = {
  path?: string;
  paths?: string[];
  content?: string;
  from?: string;
  to?: string;
  sources?: string[];
  destination?: string;
  policy?: 'overwrite-all' | 'skip-conflicts';
  name?: string;
  // The commit message the user approved in the navigator's own field, carried with `git-commit` so
  // the far side never has to prompt for one mid-operation.
  message?: string;
  // `git-commit`'s whole-tree form (an empty `paths`) names the navigator root's workspace-relative
  // prefix here, since the far side's single shared workspace root cannot otherwise tell one
  // navigator's root from another's.
  root?: string;
  mode?: 'copy' | 'cut';
  undoStack?: unknown[];
  redoStack?: unknown[];
  direction?: 'undo' | 'redo';
  overwrite?: boolean;
  skipConflicts?: boolean;
};

// Local → remote. One process family (spawn/input/resize/kill) backs remote harness tabs, remote
// agent tabs' persistent shells, PTY takeover, and inline terminal cards alike; `provision` is the
// only other thing the local side ever asks for.
export type ClientFrame =
  // Ask to take over a session that outlived its transport. `session` is the id the handshake
  // announced when the peer was first created, and it is the only credential the far side checks:
  // `relayPeer` refuses any `attach` whose id does not match the peer it found. `origin` is the
  // attaching project's, as `provision` carries it, so a relay finds the root a launch cloned into
  // the home directory.
  | { type: 'attach'; session: string; restore?: boolean; origin?: string }
  // No payload: there is one workspace per peer, so "which processes are alive" has a single
  // answer and nothing to address it by.
  | { type: 'session-state' }
  // No payload: the far side removes its workspace and exits, exactly as SIGTERM does — sent by
  // every local path that ends a session on purpose rather than losing its transport.
  | { type: 'shutdown' }
  // `identity` is the git name and email of the user who opened janissary locally, so commits made
  // in the remote workspace are attributed to them rather than to whatever account the ssh
  // destination resolved to. `origin` is the launching project's `origin` with any embedded
  // credential removed: the far side's root must be a clone of that repository, and a missing one
  // is offered from it.
  | { type: 'provision'; label: string; tokens?: ProjectTokens; identity?: GitIdentity; origin?: string }
  // The user's answer to `clone-offer`, typed into the placeholder tab's terminal.
  | { type: 'clone-answer'; accept: boolean }
  | {
    type: 'spawn'; id: string; program: string; command: string;
    // How the remote runs it: `pty` for anything a terminal renders (the harness itself, a PTY
    // takeover, an inline terminal card), `pipe` for an agent tab's persistent shell, whose
    // sentinel-delimited protocol would be corrupted by a tty's echo and line discipline.
    mode: 'pty' | 'pipe';
    // The harness name, when this process *is* the tab's harness: the remote uses it to build the
    // harness-specific environment and to start the transcript source for the tab.
    harness?: string;
    cols: number; rows: number; offline?: boolean; agentName?: string;
    // `-b`: start an e2e browser for this process on the remote host. A boolean rather than an
    // endpoint computed here and shipped over, following the shape `offline` and `harness` already
    // use — the remote starts its own guard, its own confined browser, and its own workspace
    // directory, exactly as `harnessEnv`'s doc comment states the general rule.
    browser?: boolean;
    // Whether this harness process should auto-approve its own permission gates on the far side.
    // Meaningful only alongside `harness`; ignored for a plain PTY takeover or inline terminal card.
    autoApprove?: boolean;
  }
  | { type: 'input'; id: string; data: string }
  | { type: 'resize'; id: string; cols: number; rows: number }
  | { type: 'kill'; id: string }
  // Ask the far side for a fresh screen capture of the process `id`. `session` names the peer to ask:
  // ignored by a `RemoteServer` that already holds the live workspace (it answers from its own
  // detection pipeline instead), and required by a freshly relaying process with no workspace of its
  // own, which forwards the query into the parked peer matching `session` without attaching it.
  // `origin` finds that peer's root the way `attach.origin` does.
  | { type: 'capture-request'; session: string; id: string; request: string; origin?: string }
  | { type: 'filesystem-open'; session: string }
  | { type: 'filesystem-close'; session: string }
  | {
    type: 'filesystem-request'; session: string; request: string;
    operation: RemoteFilesystemOperation; args: RemoteFilesystemArguments;
  }
  // The ACP family: a remote agent tab's ACP client is hosted by the far side, so what crosses here
  // is prompts and reply text, never JSON-RPC. The local side still chooses which agent and model
  // run, which is why the open frame names the command rather than the remote deciding for itself.
  | {
    type: 'acp-open'; id: string; command: string; args: string[];
    env?: Record<string, string>; offline?: boolean;
  }
  | { type: 'acp-prompt'; id: string; text: string }
  | { type: 'acp-close'; id: string };

// Remote → local: the process family's output/exit, the provisioning answer, and the transcript
// blocks the remote's own `createTranscriptSource` yields.
export type ServerFrame =
  // The answer to `attach`. A refusal is terminal rather than retryable — it says that session is
  // gone, not that this attempt failed — which is the distinction `src/remote/attach.ts` turns
  // into an ended tab instead of another round of backoff. `truncated` says the peer's replay buffer
  // overflowed while it waited, so what follows is missing its oldest output.
  | { type: 'attach-result'; accepted: boolean; truncated?: boolean }
  // The answer to `session-state`: one entry per process still running in the workspace. An empty
  // list is a real answer and not a failure — it says the peer is holding a workspace with nothing
  // in it, which is the one case the local side ends rather than attaches.
  | { type: 'session-state-result'; processes: RemoteProcessState[] }
  // `notice` is what the remote knows about the workspace it just made and the local side cannot
  // work out for itself: whether its processes are actually confined, and which GitHub credential
  // it ended up with. Both are facts about the machine they hold on, so they are reported from
  // there; `serve-notice.ts` composes them into this one string.
  // `cleaned` is the absolute path of a leftover workspace under the same label that was removed
  // before this one was cloned, so the local side can say so. `cloned` is the project root this
  // provision cloned first, after an accepted `clone-offer`.
  | { type: 'workspace-ready'; dir: string; notice?: string; cleaned?: string; cloned?: { url: string; path: string } }
  // The answer to a `provision` whose project root is missing: may `url` be cloned into `path`?
  // `home` is present when `path` is `<home>/<repo-name>`, so the prompt can say where it looked.
  | { type: 'clone-offer'; path: string; url: string; home?: string }
  // The answer to a `provision` whose project root cannot be used, and nothing was provisioned.
  | { type: 'root-refused'; refusal: RootRefusal }
  | { type: 'workspace-failed'; message: string }
  // The answer to a `provision` whose label is taken on this host: with neither optional field,
  // something is running under it; with both, a leftover workspace at `path` could not be removed
  // because of `reason`. Nothing is provisioned either way.
  | { type: 'name-in-use'; label: string; path?: string; reason?: string }
  | { type: 'output'; id: string; data: string }
  | { type: 'exit'; id: string; exitCode: number }
  // The remote's e2e browser for that session is gone — a failed launch, a browser that exited, or
  // a guard that died. The local side raises the same notification it would for a local one. No
  // supervisor and no restart on either side: once it is gone, `connect()` fails with a plain
  // connection error.
  //
  // `message` is what the far side composed, the confined browser's own output included. It is
  // optional because only that host can say anything useful about a host the local side never sees;
  // absent, the local side falls back to naming the remote and nothing more.
  | { type: 'browser-exited'; id: string; message?: string }
  | { type: 'transcript'; blocks: string[] }
  // One piped process's retained history, as the runs the far side saw them in: what was written to
  // it and what it produced, in order. Sent only when an attach is rebuilding tabs, and never for a
  // `pty` process, whose tty already echoed its input into the retained output. It is a frame of its
  // own rather than more `output` because the recorded input carries the sentinel `echo` the shell
  // protocol delimits commands with, and a live command's scan of the output stream would match it
  // before the command had run.
  | { type: 'shell-history'; id: string; runs: ShellHistoryRun[] }
  // A detected (and, when auto-approve is on, injected-against) permission gate, or a stand-down when
  // auto-approve could not clear it — the far side's report of exactly what `HarnessAutoApprover`'s
  // own `notify` callback would have told a local detector. `capturedAt` is when the gate was seen,
  // not when this frame was sent, so a replay after reattaching shows the original timeline (a queued
  // frame can sit in `DetachedPeer.pending` for anywhere from seconds to the full detach window).
  // `capture` is the triggering screen text, inline and base64-encoded like `output`, so the client
  // writes the same capture file a local detector would have without a second round trip.
  | { type: 'gate-event'; id: string; message: string; capturedAt: number; capture?: string }
  // The harness's current busy/ready state, and whether the tab should be marked unread because of
  // this transition. A snapshot of current state rather than a log entry — see version 18's comment
  // above — so this is sent live on every real change while attached, and exactly once (reflecting
  // whatever is current) on a successful attach; never queued while detached.
  | { type: 'busy-transition'; id: string; busy: boolean; unread: boolean }
  // The answer to `capture-request`: the process's latest screen capture, or no fields at all when
  // it has none yet — the same "nothing captured yet" a local `latestCapture()` can return.
  | { type: 'capture-reply'; id: string; request: string; text?: string; capturedAt?: number }
  | { type: 'filesystem-reply'; session: string; request: string; result?: unknown; error?: string }
  | { type: 'filesystem-event'; session: string; path: string }
  // `acp-ready` carries the id alone: its only job is to say the handshake completed. What the agent
  // reports as its "model" is really the session's current mode name, and the local side already
  // knows the model it asked for, so there is nothing else worth sending back.
  | { type: 'acp-ready'; id: string }
  | { type: 'acp-chunk'; id: string; text: string }
  | { type: 'acp-end'; id: string; stopReason: string }
  // `fatal` distinguishes a session that no longer exists (a failed spawn, a dead agent) from a
  // prompt that merely failed (a rate limit). Only the remote can tell which, and the two must not
  // be collapsed: dropping a live session throws away its conversation, and keeping a dead one
  // means the next prompt writes into a corpse.
  | { type: 'acp-error'; id: string; message: string; fatal: boolean };

// One unbroken stretch of a piped shell's history, tagged with the direction it travelled. Tagged
// rather than inferred: the local side reconstructs a transcript entry per command from these, and
// guessing which text was a command from its shape would mistake output that happens to look like
// one.
export type ShellHistoryRun = { source: 'input' | 'output'; text: string };

// One live process as the far side describes it. The fields are exactly what the local side needs to
// rebuild the tab that was driving it: the spawn id its output is routed by, what is running, how it
// was started, and the harness or agent name that decides which kind of tab it belongs in.
export type RemoteProcessState = {
  id: string;
  program: string;
  mode: 'pty' | 'pipe';
  harness?: string;
  autoApprove?: boolean;
  agentName?: string;
};

export type RemoteFrame = ClientFrame | ServerFrame;

// The admitted frame types as data, keyed by the unions above rather than re-listed as strings —
// the idiom `CAPABILITIES` in `src/plugins/api.ts` uses and explains: adding a name to `ClientFrame`
// or `ServerFrame` without an entry here is a compile error, instead of a frame type that encodes,
// ships, and is then silently refused by the receiving end as unknown.
export const CLIENT_FRAME_TYPES: Record<ClientFrame['type'], true> = {
  attach: true, 'session-state': true, shutdown: true,
  provision: true, 'clone-answer': true, spawn: true, input: true, resize: true, kill: true, 'capture-request': true,
  'filesystem-open': true, 'filesystem-close': true, 'filesystem-request': true,
  'acp-open': true, 'acp-prompt': true, 'acp-close': true,
};
export const SERVER_FRAME_TYPES: Record<ServerFrame['type'], true> = {
  'attach-result': true, 'session-state-result': true, 'clone-offer': true, 'root-refused': true,
  'workspace-ready': true, 'workspace-failed': true, 'name-in-use': true, output: true, exit: true, transcript: true,
  'shell-history': true, 'browser-exited': true, 'gate-event': true, 'busy-transition': true, 'capture-reply': true,
  'filesystem-reply': true, 'filesystem-event': true,
  'acp-ready': true, 'acp-chunk': true, 'acp-end': true, 'acp-error': true,
};
