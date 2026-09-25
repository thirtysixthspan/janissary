import { PROJECT_TOKENS, type ProjectTokens } from '../project/tokens.js';
import type { GitIdentity } from '../git/identity.js';
import type { RemoteFrame } from './protocol.js';
import {
  malformed, nonEmptyString, optionalNonEmptyString, type DecodeResult,
} from './frame-decode-shared.js';
import { decodeFilesystemFrame } from './frame-decode-filesystem.js';
import { decodeSessionStateResult } from './frame-decode-sessions.js';
import { decodeShellHistory } from './frame-decode-history.js';
import {
  decodeCaptureRequest, decodeCaptureReply, decodeGateEvent, decodeBusyTransition,
} from './frame-decode-detect.js';
import {
  decodeAcpOpen, decodeAcpText, decodeAcpAddressed, decodeAcpEnd, decodeAcpError,
} from './frame-decode-acp.js';

const TOKEN_NAMES = new Set<string>(PROJECT_TOKENS.map(({ name }) => name));
const IDENTITY_KEYS = new Set<string>(['name', 'email']);

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function decodeTokens(value: unknown): ProjectTokens | undefined {
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return;
  const tokens: ProjectTokens = {};
  for (const [name, token] of Object.entries(value)) {
    if (!TOKEN_NAMES.has(name) || !nonEmptyString(token)) return;
    tokens[name as keyof ProjectTokens] = token;
  }
  return tokens;
}

// Same strictness `decodeTokens` applies, for the same reason: the record is installed as this
// machine's git identity, so an unknown key or a non-string value is a mismatched sender rather than
// something to silently drop a field from.
function decodeIdentity(value: unknown): GitIdentity | undefined {
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return;
  const identity: GitIdentity = {};
  for (const [key, item] of Object.entries(value)) {
    if (!IDENTITY_KEYS.has(key) || !nonEmptyString(item)) return;
    identity[key as keyof GitIdentity] = item;
  }
  return identity;
}

function decodeProvision(record: Record<string, unknown>): DecodeResult {
  const tokens = decodeTokens(record.tokens);
  const identity = decodeIdentity(record.identity);
  if (!nonEmptyString(record.label) || tokens === undefined || identity === undefined) return malformed('provision');
  return {
    type: 'provision',
    label: record.label,
    ...(Object.hasOwn(record, 'tokens') && { tokens }),
    ...(Object.hasOwn(record, 'identity') && { identity }),
  };
}

function decodeSpawn(record: Record<string, unknown>): DecodeResult {
  const { id, program, command, mode, harness, cols, rows, offline, agentName, browser, autoApprove } = record;
  if (!nonEmptyString(id) || !nonEmptyString(program) || !nonEmptyString(command)
    || !(mode === 'pty' || mode === 'pipe') || !optionalNonEmptyString(harness)
    || !positiveInteger(cols) || !positiveInteger(rows)
    || !(offline === undefined || typeof offline === 'boolean')
    || !(browser === undefined || typeof browser === 'boolean')
    || !(autoApprove === undefined || typeof autoApprove === 'boolean')
    || !optionalNonEmptyString(agentName)) return malformed('spawn');
  return {
    type: 'spawn', id, program, command, mode, cols, rows,
    ...(harness !== undefined && { harness }),
    ...(offline !== undefined && { offline }),
    ...(browser !== undefined && { browser }),
    ...(autoApprove !== undefined && { autoApprove }),
    ...(agentName !== undefined && { agentName }),
  };
}

function decodeAddressedData(type: 'input' | 'output', record: Record<string, unknown>): DecodeResult {
  if (!nonEmptyString(record.id) || typeof record.data !== 'string') return malformed(type);
  return { type, id: record.id, data: Buffer.from(record.data, 'base64').toString('utf8') };
}

function decodeResize(record: Record<string, unknown>): DecodeResult {
  if (!nonEmptyString(record.id) || !positiveInteger(record.cols) || !positiveInteger(record.rows)) {
    return malformed('resize');
  }
  return { type: 'resize', id: record.id, cols: record.cols, rows: record.rows };
}

function decodeKill(record: Record<string, unknown>): DecodeResult {
  return nonEmptyString(record.id) ? { type: 'kill', id: record.id } : malformed('kill');
}

function decodeBrowserExited(record: Record<string, unknown>): DecodeResult {
  if (!nonEmptyString(record.id) || !optionalNonEmptyString(record.message)) return malformed('browser-exited');
  return record.message === undefined
    ? { type: 'browser-exited', id: record.id }
    : { type: 'browser-exited', id: record.id, message: record.message };
}

function decodeWorkspaceReady(record: Record<string, unknown>): DecodeResult {
  const { dir, notice, cleaned } = record;
  if (!nonEmptyString(dir) || !optionalNonEmptyString(notice) || !optionalNonEmptyString(cleaned)) return malformed('workspace-ready');
  return {
    type: 'workspace-ready', dir,
    ...(notice !== undefined && { notice }),
    ...(cleaned !== undefined && { cleaned }),
  };
}

function decodeWorkspaceFailed(record: Record<string, unknown>): DecodeResult {
  return nonEmptyString(record.message)
    ? { type: 'workspace-failed', message: record.message }
    : malformed('workspace-failed');
}

// `path` and `reason` travel together or not at all: one without the other describes neither a
// running label nor a failed removal.
function decodeNameInUse(record: Record<string, unknown>): DecodeResult {
  const { label, path, reason } = record;
  if (!nonEmptyString(label) || !optionalNonEmptyString(path) || !optionalNonEmptyString(reason)
    || (path === undefined) !== (reason === undefined)) return malformed('name-in-use');
  return path === undefined || reason === undefined
    ? { type: 'name-in-use', label }
    : { type: 'name-in-use', label, path, reason };
}

function decodeExit(record: Record<string, unknown>): DecodeResult {
  if (!nonEmptyString(record.id) || typeof record.exitCode !== 'number' || !Number.isSafeInteger(record.exitCode)) {
    return malformed('exit');
  }
  return { type: 'exit', id: record.id, exitCode: record.exitCode };
}

function decodeTranscript(record: Record<string, unknown>): DecodeResult {
  if (!Array.isArray(record.blocks) || record.blocks.some((block) => typeof block !== 'string')) {
    return malformed('transcript');
  }
  return { type: 'transcript', blocks: record.blocks.map((block) => Buffer.from(block, 'base64').toString('utf8')) };
}

// The `default` branch of the switch below. The `never` parameter is the point: the call only
// typechecks while every frame type in the union has a case, so a type added to `RemoteFrame` but
// not to this dispatcher fails the build rather than being refused at runtime as if it were a frame
// from a mismatched remote. The throw is the runtime backstop.
function unhandledRemoteFrame(type: never): never {
  throw new Error(`Unhandled remote frame type: ${String(type)}`);
}

// `type` is already known to be one of the declared frame types — `decodeFrame` checks membership
// before calling — so the switch is exhaustive over the union rather than open over `string`.
export function decodeKnownFrame(type: RemoteFrame['type'], record: Record<string, unknown>): DecodeResult {
  switch (type) {
  case 'attach': {
    if (record.restore !== undefined && typeof record.restore !== 'boolean') return malformed(type);
    return typeof record.session === 'string' && /^[a-f\d-]{36}$/.test(record.session)
      ? { type, session: record.session, ...(record.restore !== undefined && { restore: record.restore }) } : malformed(type);
  }
  case 'attach-result': {
    if (typeof record.accepted !== 'boolean') return malformed(type);
    if (record.truncated !== undefined && typeof record.truncated !== 'boolean') return malformed(type);
    return {
      type, accepted: record.accepted,
      ...(record.truncated !== undefined && { truncated: record.truncated }),
    };
  }
  case 'session-state': { return { type }; }
  case 'session-state-result': { return decodeSessionStateResult(record); }
  case 'shutdown': { return { type }; }
  case 'provision': { return decodeProvision(record); }
  case 'spawn': { return decodeSpawn(record); }
  case 'input': { return decodeAddressedData(type, record); }
  case 'resize': { return decodeResize(record); }
  case 'kill': { return decodeKill(record); }
  case 'capture-request': { return decodeCaptureRequest(record); }
  case 'capture-reply': { return decodeCaptureReply(record); }
  case 'gate-event': { return decodeGateEvent(record); }
  case 'busy-transition': { return decodeBusyTransition(record); }
  case 'workspace-ready': { return decodeWorkspaceReady(record); }
  case 'workspace-failed': { return decodeWorkspaceFailed(record); }
  case 'name-in-use': { return decodeNameInUse(record); }
  case 'output': { return decodeAddressedData(type, record); }
  case 'exit': { return decodeExit(record); }
  case 'browser-exited': { return decodeBrowserExited(record); }
  case 'transcript': { return decodeTranscript(record); }
  case 'shell-history': { return decodeShellHistory(record); }
  case 'filesystem-open':
  case 'filesystem-close':
  case 'filesystem-request':
  case 'filesystem-reply':
  case 'filesystem-event': { return decodeFilesystemFrame(type, record); }
  case 'acp-open': { return decodeAcpOpen(record); }
  case 'acp-prompt':
  case 'acp-chunk': { return decodeAcpText(type, record); }
  case 'acp-close':
  case 'acp-ready': { return decodeAcpAddressed(type, record); }
  case 'acp-end': { return decodeAcpEnd(record); }
  case 'acp-error': { return decodeAcpError(record); }
  default: { return unhandledRemoteFrame(type); }
  }
}
