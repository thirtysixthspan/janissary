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
export const REMOTE_PROTOCOL_VERSION = 6;

// The single line that flips the channel from a raw terminal to a framed transport. Chosen so it
// cannot occur in ordinary ssh banner, motd, or authentication output.
export const HANDSHAKE_SENTINEL = '__JANUS_REMOTE__';

export type RemoteHandshake = { version: number; root: string };

import type { ProjectTokens } from '../project-tokens.js';
import { decodeKnownFrame } from './frame-decode.js';

// Local → remote. One process family (spawn/input/resize/kill) backs remote harness tabs, remote
// agent tabs' persistent shells, PTY takeover, and inline terminal cards alike; `provision` is the
// only other thing the local side ever asks for.
export type ClientFrame =
  | { type: 'provision'; label: string; tokens?: ProjectTokens }
  | {
    type: 'spawn'; id: string; program: string; command: string;
    // How the remote runs it: `pty` for anything a terminal renders (the harness itself, a PTY
    // takeover, an inline terminal card), `pipe` for an agent tab's persistent shell, whose
    // sentinel-delimited protocol would be corrupted by a tty's echo and line discipline.
    mode: 'pty' | 'pipe';
    // The harness name, when this process *is* the tab's harness: the remote uses it to build the
    // harness-specific environment and to start the transcript source for the tab.
    harness?: string;
    cols: number; rows: number; offline?: boolean;
  }
  | { type: 'input'; id: string; data: string }
  | { type: 'resize'; id: string; cols: number; rows: number }
  | { type: 'kill'; id: string };

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
  | { type: 'transcript'; blocks: string[] };

export type RemoteFrame = ClientFrame | ServerFrame;

const CLIENT_TYPES = new Set(['provision', 'spawn', 'input', 'resize', 'kill']);
const SERVER_TYPES = new Set(['workspace-ready', 'workspace-failed', 'output', 'exit', 'transcript']);

function encodeText(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64');
}

// Terminal bytes and rendered transcript blocks travel base64-encoded so no control byte, escape
// sequence, or embedded newline in a payload can ever be mistaken for framing.
function toWire(frame: RemoteFrame): Record<string, unknown> {
  if (frame.type === 'input' || frame.type === 'output') return { ...frame, data: encodeText(frame.data) };
  if (frame.type === 'transcript') return { ...frame, blocks: frame.blocks.map((block) => encodeText(block)) };
  return { ...frame };
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
  if (typeof type !== 'string' || !(CLIENT_TYPES.has(type) || SERVER_TYPES.has(type))) {
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
