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
export const REMOTE_PROTOCOL_VERSION = 11;

// The single line that flips the channel from a raw terminal to a framed transport. Chosen so it
// cannot occur in ordinary ssh banner, motd, or authentication output.
export const HANDSHAKE_SENTINEL = '__JANUS_REMOTE__';

export type RemoteHandshake = { version: number; root: string };

export type RemoteFilesystemOperation =
  | 'read-directory' | 'stat' | 'watch' | 'unwatch' | 'git' | 'git-pull' | 'search' | 'read-file'
  | 'write-file' | 'move' | 'move-many' | 'delete' | 'delete-many' | 'rename' | 'paste'
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
  mode?: 'copy' | 'cut';
  undoStack?: unknown[];
  redoStack?: unknown[];
  direction?: 'undo' | 'redo';
  overwrite?: boolean;
  skipConflicts?: boolean;
};

import type { ProjectTokens } from '../project-tokens.js';
import type { GitIdentity } from '../git-identity.js';
import { decodeKnownFrame } from './frame-decode.js';

// Local → remote. One process family (spawn/input/resize/kill) backs remote harness tabs, remote
// agent tabs' persistent shells, PTY takeover, and inline terminal cards alike; `provision` is the
// only other thing the local side ever asks for.
export type ClientFrame =
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
  }
  | { type: 'input'; id: string; data: string }
  | { type: 'resize'; id: string; cols: number; rows: number }
  | { type: 'kill'; id: string }
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
  // `notice` is what the remote knows about the workspace it just made and the local side cannot
  // work out for itself: whether its processes are actually confined, and which GitHub credential
  // it ended up with. Both are facts about the machine they hold on, so they are reported from
  // there; `serve-notice.ts` composes them into this one string.
  | { type: 'workspace-ready'; dir: string; notice?: string }
  | { type: 'workspace-failed'; message: string }
  | { type: 'output'; id: string; data: string }
  | { type: 'exit'; id: string; exitCode: number }
  | { type: 'transcript'; blocks: string[] }
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

export type RemoteFrame = ClientFrame | ServerFrame;

// The admitted frame types as data, keyed by the unions above rather than re-listed as strings —
// the idiom `CAPABILITIES` in `src/plugins/api.ts` uses and explains: adding a name to `ClientFrame`
// or `ServerFrame` without an entry here is a compile error, instead of a frame type that encodes,
// ships, and is then silently refused by the receiving end as unknown.
export const CLIENT_FRAME_TYPES: Record<ClientFrame['type'], true> = {
  provision: true, spawn: true, input: true, resize: true, kill: true,
  'filesystem-open': true, 'filesystem-close': true, 'filesystem-request': true,
  'acp-open': true, 'acp-prompt': true, 'acp-close': true,
};
export const SERVER_FRAME_TYPES: Record<ServerFrame['type'], true> = {
  'workspace-ready': true, 'workspace-failed': true, output: true, exit: true, transcript: true,
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
  if (frame.type === 'filesystem-request' && frame.operation === 'write-file') {
    return { ...frame, args: { ...frame.args, content: encodeText(frame.args.content ?? '') } };
  }
  if (frame.type === 'filesystem-reply' && isContentResult(frame.result)) {
    return { ...frame, result: { ...frame.result, content: encodeText(frame.result.content) } };
  }
  if (frame.type === 'acp-prompt' || frame.type === 'acp-chunk') return { ...frame, text: encodeText(frame.text) };
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
export function decodeFrame(line: string): RemoteFrame | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return { error: `Malformed remote frame: ${line.slice(0, 80)}` };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { error: 'Malformed remote frame: not an object.' };
  }
  const record = parsed as Record<string, unknown>;
  const type = record.type;
  if (typeof type !== 'string' || !isRemoteFrameType(type)) {
    return { error: `Unknown remote frame type "${String(type)}".` };
  }
  return decodeKnownFrame(type, record);
}

export function encodeHandshake(root: string): string {
  return `${HANDSHAKE_SENTINEL} ${JSON.stringify({ version: REMOTE_PROTOCOL_VERSION, root })}`;
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
  return { version, root: typeof record.root === 'string' ? record.root : '' };
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
