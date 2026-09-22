// The frame contract shared by both ends of a remote janissary session: imported by
// `janus remote-serve` on the far side and by the local channel on this one, so there is exactly
// one definition of what may cross the wire. It carries its own version constant, checked at the
// handshake, plus the codec — newline-delimited JSON with base64 payloads, which is
// `JSON.parse`/`JSON.stringify` and `Buffer`, so it needs no module of its own.

// The contract's version, checked at the handshake. It covers what the frames *carry*, not only
// their shape: a field one end fills in and the other is expected to honor is as much a contract as
// a new frame type, because an end that merely ignores it looks healthy while doing the wrong thing.
// That is why every credential added to `provision` moved it — versions 1 through 5 were the
// contract before any token, then one per token as `githubToken`, `claudeToken`, `opencodeToken`,
// and `geminiToken` arrived as their own fields.
//
// Version 6 replaces those four fields with a single `tokens` map (see `project-tokens.ts`), so
// adding a credential no longer touches this file at all. It is also the one bump so far that
// changes a frame's shape rather than adding to it: a version-5 remote finds none of the fields it
// reads and provisions a workspace with no credentials whatsoever, which the same refusal covers.
// Version 7 adds workspace filesystem sessions and a per-spawn agent name.
//
// Version 8 adds the ACP family (`acp-open`/`acp-prompt`/`acp-close` out, `acp-ready`/`acp-chunk`/
// `acp-end`/`acp-error` back), which moves a remote agent tab's ACP client onto the far side. A
// version-7 remote recognizes none of them: it would refuse each one as an unknown frame while the
// local tab sat waiting, accepting prompts and answering nothing — precisely the "looks healthy
// while doing the wrong thing" failure this check exists to prevent.
//
// Version 9 adds the `git-pull` filesystem operation, backing the file navigator header's pull
// button. A version-8 remote refuses it as an unknown operation, so the pull fails with a clear
// error reply rather than both ends disagreeing silently about what the button does.
//
// Version 10 adds `identity` to `provision`: the git name and email of the user who opened
// janissary, which the remote is expected to install over its own machine's. This is the archetype
// of the failure the check exists for — a version-9 remote ignores the field, provisions normally,
// and silently attributes every commit the workspace makes to the ssh destination's account.
//
// Version 11 widens what `git-pull` answers with: git's own outcome summary, which the file
// navigator reports as a notifications line. A version-10 remote replies with no result at all, so
// every remote pull would report the bare fallback text while both ends looked healthy — the same
// carries-not-shape distinction the `identity` bump above is the archetype of.
//
// Version 12 adds the e2e browser: `browser` on `spawn`, which the remote acts on by starting its
// own protocol guard and confined Chromium on its own host, and a `browser-exited` frame back for
// when that browser is gone. Two changes, one bump. A version-11 remote ignores the flag and spawns
// the harness with no browser variables at all, so a `harness … on <host> -b` tab would come up
// looking healthy while every `chromium.connect` inside it failed with nothing to point at — the
// same failure the check exists for.
//
// Version 13 adds the `git-commit` filesystem operation, backing the file navigator's commit button
// and its `Commit to origin` menu entry. A version-12 remote refuses it as an unknown operation, so
// the commit fails with a clear error reply rather than both ends disagreeing silently — the same
// shape the `git-pull` bump above took. `git-commit` also carries an optional `root`: the navigator
// root's workspace-relative prefix, sent only with the whole-tree form (an empty `paths` list), so a
// navigator rooted below the workspace root stages and commits only its own subtree rather than
// everything the far side's single shared workspace root can see.
//
// Version 14 adds the attach frames — spelled `reattach` and `reattach-result` at the time, renamed
// by version 16 below — and a `session` id
// carried on the handshake, backing reconnection to a peer that outlived its transport across a
// laptop sleep. A version-13 remote has no rendezvous to answer an attach request against, so the
// handshake check above is what turns a stale far side into a clear refusal instead of an attach
// request nobody on the other end recognizes.
//
// Version 15 adds the session-state query (`session-state` out, `session-state-result` back), which
// asks a peer to describe the processes still alive in its workspace. It is what turns an accepted
// attach into tabs: a janissary that was restarted since the launch holds a record of what it
// started, but only the far side knows what is still running, and the sessions tab has to open one
// tab per surviving process rather than a single representative one. A version-14 remote recognizes
// neither frame and is refused at the handshake like any other mismatch.
//
// That check is narrower here than elsewhere, and deliberately so. An attach's handshake is written
// by the freshly started `janus remote-serve` that then relays into the parked peer (`relayPeer` in
// `./serve-detach.ts`), not by the parked peer itself — so it binds the relaying process's version,
// which is whatever is installed on the host now. A peer parked across a remote upgrade therefore
// announces 15 and hands the query to a 14 that refuses it by name. Nothing in the handshake can see
// that, so the bounded wait in `askSessionState` is what catches it: the attach reports a failure
// and the session stays parked, rather than waiting for an answer that will never come.
// Version 16 adds `restore` to attachment so rebuilt tabs receive retained display and transcript
// history while transport recovery does not duplicate transcript blocks already delivered. It also
// renames version 14's two frames to `attach` and `attach-result`, so the wire uses the one word the
// rest of the session vocabulary does. The rename needs no bump of its own: the handshake admits
// only an exact match, and every build that speaks the old names announces 14 or 15.
//
// Version 17 adds retained shell input and the `shell-history` frame that replays it. A remote agent
// tab's shell runs in `pipe` mode so no tty echo can corrupt its sentinel protocol, which means the
// far side only ever emits that shell's *output* — the commands were written in and never echoed
// back. A peer now retains the input it was sent for a piped process alongside the output it
// produced, and replays the pair as ordered runs when an attach is rebuilding tabs, so a restored
// agent transcript reads as commands beside their output rather than as responses alone. This is the
// carries-not-shape case the `identity` bump above is the archetype of: a version-16 peer retains no
// input, so it would answer an attach with command-less history while both ends looked healthy.
//
// Version 18 moves gate-detection, auto-approve, and busy/ready status for a remote harness tab onto
// the far side, so all three keep working while the tab is detached — replacing the old approach of
// computing them locally from relayed PTY bytes. Four changes travel together because they are one
// feature (a version-17 remote knows none of them, so a `-y` remote harness would come up silently
// unable to auto-approve at all, not merely unable to while detached):
//  - `spawn` gains `autoApprove`, telling the far side whether this harness process should inject
//    approval keystrokes at all. A version-17 remote ignores the field and injects nothing, in
//    keeping with today's split where the far side has never run gate detection.
//  - `gate-event` reports a detected/approved (or stood-down) permission gate, carrying what the
//    local `notify()` needs to reconstruct the same notification a local detector would have raised:
//    the message, the original detection time, and — inline, base64-encoded like `output` — the
//    triggering screen capture. It travels through the existing detached-peer replay buffer
//    unchanged, so one already reached while detached queues and replays exactly like `output` does.
//  - `busy-transition` reports the harness's current busy/ready state and whether the tab should be
//    marked unread. Unlike `gate-event`, it is a snapshot of current state, not a log entry: it is
//    never queued while detached, and exactly one is sent on a successful attach, carrying only
//    whatever the far side's classifier currently holds.
//  - `capture-request`/`capture-reply` let `harness capture <name>` ask the far side for a fresh
//    snapshot on demand — over the live channel while attached, or through a lightweight query that
//    reaches a parked peer without attaching it, while fully detached.
// A version-17 remote refuses all three new frame types as unknown, which is exactly the mismatch
// this check exists to catch before a `-y` remote harness ships silently inert.
export const REMOTE_PROTOCOL_VERSION = 18;

// The single line that flips the channel from a raw terminal to a framed transport. Chosen so it
// cannot occur in ordinary ssh banner, motd, or authentication output.
export const HANDSHAKE_SENTINEL = '__JANUS_REMOTE__';

export type RemoteHandshake = { version: number; root: string; session?: string };

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

import type { ProjectTokens } from '../project/tokens.js';
import type { GitIdentity } from '../git/identity.js';
import { decodeKnownFrame } from './frame-decode.js';

// Local → remote. One process family (spawn/input/resize/kill) backs remote harness tabs, remote
// agent tabs' persistent shells, PTY takeover, and inline terminal cards alike; `provision` is the
// only other thing the local side ever asks for.
export type ClientFrame =
  // Ask to take over a session that outlived its transport. `session` is the id the handshake
  // announced when the peer was first created, and it is the only credential the far side checks:
  // `relayPeer` refuses any `attach` whose id does not match the peer it found.
  | { type: 'attach'; session: string; restore?: boolean }
  // No payload: there is one workspace per peer, so "which processes are alive" has a single
  // answer and nothing to address it by.
  | { type: 'session-state' }
  // No payload: the far side removes its workspace and exits, exactly as SIGTERM does — sent by
  // every local path that ends a session on purpose rather than losing its transport.
  | { type: 'shutdown' }
  // `identity` is the git name and email of the user who opened janissary locally, so commits made
  // in the remote workspace are attributed to them rather than to whatever account the ssh
  // destination resolved to.
  | { type: 'provision'; label: string; tokens?: ProjectTokens; identity?: GitIdentity }
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
  | { type: 'capture-request'; session: string; id: string; request: string }
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
  | { type: 'workspace-ready'; dir: string; notice?: string }
  | { type: 'workspace-failed'; message: string }
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
  provision: true, spawn: true, input: true, resize: true, kill: true, 'capture-request': true,
  'filesystem-open': true, 'filesystem-close': true, 'filesystem-request': true,
  'acp-open': true, 'acp-prompt': true, 'acp-close': true,
};
export const SERVER_FRAME_TYPES: Record<ServerFrame['type'], true> = {
  'attach-result': true, 'session-state-result': true,
  'workspace-ready': true, 'workspace-failed': true, output: true, exit: true, transcript: true,
  'shell-history': true, 'browser-exited': true, 'gate-event': true, 'busy-transition': true, 'capture-reply': true,
  'filesystem-reply': true, 'filesystem-event': true,
  'acp-ready': true, 'acp-chunk': true, 'acp-end': true, 'acp-error': true,
};

// A predicate rather than a bare membership test, so the narrowed type reaches `decodeKnownFrame`
// and its switch can be exhaustive over the union instead of over `string`.
function isRemoteFrameType(type: string): type is RemoteFrame['type'] {
  return Object.hasOwn(CLIENT_FRAME_TYPES, type) || Object.hasOwn(SERVER_FRAME_TYPES, type);
}

function encodeText(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64');
}

// Terminal bytes and rendered transcript blocks travel base64-encoded so no control byte, escape
// sequence, or embedded newline in a payload can ever be mistaken for framing.
function toWire(frame: RemoteFrame): Record<string, unknown> {
  if (frame.type === 'input' || frame.type === 'output') return { ...frame, data: encodeText(frame.data) };
  if (frame.type === 'transcript') return { ...frame, blocks: frame.blocks.map((block) => encodeText(block)) };
  if (frame.type === 'shell-history') {
    return { ...frame, runs: frame.runs.map((run) => ({ ...run, text: encodeText(run.text) })) };
  }
  if (frame.type === 'filesystem-request' && frame.operation === 'write-file') {
    return { ...frame, args: { ...frame.args, content: encodeText(frame.args.content ?? '') } };
  }
  if (frame.type === 'filesystem-reply' && isContentResult(frame.result)) {
    return { ...frame, result: { ...frame.result, content: encodeText(frame.result.content) } };
  }
  if (frame.type === 'acp-prompt' || frame.type === 'acp-chunk') return { ...frame, text: encodeText(frame.text) };
  if (frame.type === 'gate-event' && frame.capture !== undefined) return { ...frame, capture: encodeText(frame.capture) };
  if (frame.type === 'capture-reply' && frame.text !== undefined) return { ...frame, text: encodeText(frame.text) };
  return { ...frame };
}

function isContentResult(value: unknown): value is { content: string } & Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && typeof (value as Record<string, unknown>).content === 'string';
}

export function encodeFrame(frame: RemoteFrame): string {
  return JSON.stringify(toWire(frame));
}

// Parse one line into a frame, rejecting anything outside the union rather than ignoring it — an
// unrecognized frame means the two ends disagree about the contract, which is not a thing to
// silently skip past.
//
// A line that is not a JSON object at all is a different thing, and says so with `stray`. `ssh -t`
// folds the far side's stderr into the same tty the frames travel on, so anything the remote prints
// outside the protocol — node-pty's own write-error log among them — arrives here looking like a
// frame and is not one. That is terminal output, not a contract disagreement, and the caller is
// what decides the difference (see `RemoteChannel.dispatch`).
export function decodeFrame(line: string): RemoteFrame | { error: string; stray?: true } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return { error: `Malformed remote frame: ${line.slice(0, 80)}`, stray: true };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { error: 'Malformed remote frame: not an object.', stray: true };
  }
  const record = parsed as Record<string, unknown>;
  const type = record.type;
  if (typeof type !== 'string' || !isRemoteFrameType(type)) {
    return { error: `Unknown remote frame type "${String(type)}".` };
  }
  return decodeKnownFrame(type, record);
}

export function encodeHandshake(root: string, session?: string): string {
  return `${HANDSHAKE_SENTINEL} ${JSON.stringify({ version: REMOTE_PROTOCOL_VERSION, root, session })}`;
}

// Read the handshake line's payload, rejecting a protocol version this build does not speak. The
// message names both versions so it is obvious which side is behind.
export function parseHandshake(line: string): RemoteHandshake | { error: string } {
  const payload = line.slice(line.indexOf(HANDSHAKE_SENTINEL) + HANDSHAKE_SENTINEL.length).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return { error: 'Malformed remote handshake.' };
  }
  if (typeof parsed !== 'object' || parsed === null) return { error: 'Malformed remote handshake.' };
  const record = parsed as Record<string, unknown>;
  const version = typeof record.version === 'number' ? record.version : -1;
  if (version !== REMOTE_PROTOCOL_VERSION) {
    return {
      error: `Remote janissary speaks protocol version ${version}; this one speaks ${REMOTE_PROTOCOL_VERSION}. `
        + 'Update janissary so both hosts match.',
    };
  }
  if (record.session !== undefined && (typeof record.session !== 'string' || !/^[a-f\d-]{36}$/.test(record.session))) {
    return { error: 'Malformed remote session id.' };
  }
  return { version, root: typeof record.root === 'string' ? record.root : '',
    ...(typeof record.session === 'string' && { session: record.session }) };
}

// How many trailing characters of `text` must be held back because they could be the start of
// `sentinel` split across two reads. Normally zero, so pre-handshake bytes — including a
// newline-less `password:` prompt — reach the terminal the moment they arrive.
export function heldBackLength(text: string, sentinel = HANDSHAKE_SENTINEL): number {
  const most = Math.min(text.length, sentinel.length - 1);
  for (let n = most; n > 0; n--) {
    if (text.endsWith(sentinel.slice(0, n))) return n;
  }
  return 0;
}
