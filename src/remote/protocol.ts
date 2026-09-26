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
//
// Version 19 has `provision` check the label before cloning. A label something is already running
// under on the host is refused with the new `name-in-use` frame, and so is a leftover workspace under
// that label that could not be removed (carried as `path` and `reason`). A leftover that was removed
// is reported by `workspace-ready`'s new `cleaned` field. `name-in-use` is a frame of its own rather
// than a `workspace-failed` so the local side can tell a name refusal from a clone failure: the
// first closes the placeholder at once, the second shows its error first. A version-18 remote never
// checks and never sends it, so a launch against one would land on a leftover's failed clone exactly
// as before while both ends looked healthy.
//
// Version 20 has the navigator's single-item `move` refuse to replace an existing destination unless
// the request carries the new `overwrite` flag, answering `{ conflictPaths }` instead. A version-19
// remote drops the flag and renames straight over whatever is there, so a drop into a collapsed
// folder would keep silently destroying a same-named file while both ends looked healthy.
//
// Version 21 moves settling the remote project root from startup to the first `provision` or
// `attach`, so a root that is missing or wrong reaches the local side as a structured answer instead
// of dying before the handshake. The handshake stops carrying `root`, since it is not known yet when
// the line is written. `provision` gains `origin`, the launching project's origin, so the far side
// can check it holds a clone of *this* project, and `attach` and `capture-request` gain it too, so a
// relay finds a root the launch cloned into the home directory. A new `clone-offer` asks whether to create a missing
// clone, answered by `clone-answer`; `root-refused` carries the reason a root could not be settled;
// and `workspace-ready` gains `cloned`, reporting a clone made on the way. A version-20 remote
// resolves its root before the handshake and never offers, so it is refused here like every other
// mismatch rather than failing a launch with no reason at all.
//
// Version 22 stops the frame codec re-encoding file contents. A `write-file` request's `content`
// and a `read-file` reply's `content` are base64 already — the filesystem port encodes the bytes —
// and the codec used to wrap them in a second layer, sniffing any reply result with a string
// `content` field to decide. A version-21 peer would read the single layer as double-encoded and
// hand the navigator base64 text as file contents, so it is refused here instead.
export const REMOTE_PROTOCOL_VERSION = 22;

// The single line that flips the channel from a raw terminal to a framed transport. Chosen so it
// cannot occur in ordinary ssh banner, motd, or authentication output.
export const HANDSHAKE_SENTINEL = '__JANUS_REMOTE__';

export type RemoteHandshake = { version: number; session?: string };

// The frame shapes live in `protocol-frames.ts`; this module is the codec over them. Everything the
// frames declare is re-exported here, so the protocol is still imported from one module.
import { decodeKnownFrame } from './frame-decode.js';
import {
  CLIENT_FRAME_TYPES, SERVER_FRAME_TYPES, type RemoteFrame,
} from './protocol-frames.js';

export { CLIENT_FRAME_TYPES, SERVER_FRAME_TYPES } from './protocol-frames.js';
export type {
  ClientFrame, RemoteFilesystemArguments, RemoteFilesystemOperation, RemoteFrame,
  RemoteProcessState, ServerFrame, ShellHistoryRun,
} from './protocol-frames.js';


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
  if (frame.type === 'acp-prompt' || frame.type === 'acp-chunk') return { ...frame, text: encodeText(frame.text) };
  if (frame.type === 'gate-event' && frame.capture !== undefined) return { ...frame, capture: encodeText(frame.capture) };
  if (frame.type === 'capture-reply' && frame.text !== undefined) return { ...frame, text: encodeText(frame.text) };
  return { ...frame };
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

export function encodeHandshake(session?: string): string {
  return `${HANDSHAKE_SENTINEL} ${JSON.stringify({ version: REMOTE_PROTOCOL_VERSION, session })}`;
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
  return { version, ...(typeof record.session === 'string' && { session: record.session }) };
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
