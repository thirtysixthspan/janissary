import { PROJECT_TOKENS, type ProjectTokens } from '../project-tokens.js';
import type { RemoteFrame } from './protocol.js';
import { decodeFilesystemFrame } from './frame-decode-filesystem.js';

type DecodeResult = RemoteFrame | { error: string };

const TOKEN_NAMES = new Set<string>(PROJECT_TOKENS.map(({ name }) => name));

function malformed(type: string): DecodeResult {
  return { error: `Malformed remote frame "${type}".` };
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function optionalNonEmptyString(value: unknown): value is string | undefined {
  return value === undefined || nonEmptyString(value);
}

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

function decodeProvision(record: Record<string, unknown>): DecodeResult {
  const tokens = decodeTokens(record.tokens);
  if (!nonEmptyString(record.label) || tokens === undefined) return malformed('provision');
  return Object.hasOwn(record, 'tokens')
    ? { type: 'provision', label: record.label, tokens }
    : { type: 'provision', label: record.label };
}

function decodeSpawn(record: Record<string, unknown>): DecodeResult {
  const { id, program, command, mode, harness, cols, rows, offline, agentName } = record;
  if (!nonEmptyString(id) || !nonEmptyString(program) || !nonEmptyString(command)
    || !(mode === 'pty' || mode === 'pipe') || !optionalNonEmptyString(harness)
    || !positiveInteger(cols) || !positiveInteger(rows)
    || !(offline === undefined || typeof offline === 'boolean')
    || !optionalNonEmptyString(agentName)) return malformed('spawn');
  return {
    type: 'spawn', id, program, command, mode, cols, rows,
    ...(harness !== undefined && { harness }),
    ...(offline !== undefined && { offline }),
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

function decodeWorkspaceReady(record: Record<string, unknown>): DecodeResult {
  if (!nonEmptyString(record.dir) || !optionalNonEmptyString(record.notice)) return malformed('workspace-ready');
  return record.notice === undefined
    ? { type: 'workspace-ready', dir: record.dir }
    : { type: 'workspace-ready', dir: record.dir, notice: record.notice };
}

function decodeWorkspaceFailed(record: Record<string, unknown>): DecodeResult {
  return nonEmptyString(record.message)
    ? { type: 'workspace-failed', message: record.message }
    : malformed('workspace-failed');
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

// Reject an array and `null` the way `decodeTokens` does, and every non-string value with them: an
// environment override map is spread straight over the ACP subprocess's environment.
function decodeEnv(value: unknown): Record<string, string> | undefined | 'invalid' {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return 'invalid';
  const env: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'string') return 'invalid';
    env[key] = item;
  }
  return env;
}

function decodeAcpOpen(record: Record<string, unknown>): DecodeResult {
  const { id, command, args, offline } = record;
  const env = decodeEnv(record.env);
  if (!nonEmptyString(id) || !nonEmptyString(command) || env === 'invalid'
    || !Array.isArray(args) || args.some((argument) => typeof argument !== 'string')
    || !(offline === undefined || typeof offline === 'boolean')) return malformed('acp-open');
  return {
    type: 'acp-open', id, command, args: args as string[],
    ...(env !== undefined && { env }),
    ...(offline !== undefined && { offline }),
  };
}

// An empty prompt cannot occur (`AcpManager.run` refuses one before sending) but an empty chunk is
// ordinary, so the text is checked for being a string rather than for being nonempty.
function decodeAcpText(type: 'acp-prompt' | 'acp-chunk', record: Record<string, unknown>): DecodeResult {
  if (!nonEmptyString(record.id) || typeof record.text !== 'string') return malformed(type);
  return { type, id: record.id, text: Buffer.from(record.text, 'base64').toString('utf8') };
}

function decodeAcpAddressed(type: 'acp-close' | 'acp-ready', record: Record<string, unknown>): DecodeResult {
  return nonEmptyString(record.id) ? { type, id: record.id } : malformed(type);
}

function decodeAcpEnd(record: Record<string, unknown>): DecodeResult {
  if (!nonEmptyString(record.id) || !nonEmptyString(record.stopReason)) return malformed('acp-end');
  return { type: 'acp-end', id: record.id, stopReason: record.stopReason };
}

// `fatal` is required rather than optional: an absent flag would default a dead session to
// "recoverable", which is the wrong way for this one to fail.
function decodeAcpError(record: Record<string, unknown>): DecodeResult {
  const { id, message, fatal } = record;
  if (!nonEmptyString(id) || !nonEmptyString(message) || typeof fatal !== 'boolean') return malformed('acp-error');
  return { type: 'acp-error', id, message, fatal };
}

export function decodeKnownFrame(type: string, record: Record<string, unknown>): DecodeResult {
  switch (type) {
  case 'provision': { return decodeProvision(record); }
  case 'spawn': { return decodeSpawn(record); }
  case 'input': { return decodeAddressedData(type, record); }
  case 'resize': { return decodeResize(record); }
  case 'kill': { return decodeKill(record); }
  case 'workspace-ready': { return decodeWorkspaceReady(record); }
  case 'workspace-failed': { return decodeWorkspaceFailed(record); }
  case 'output': { return decodeAddressedData(type, record); }
  case 'exit': { return decodeExit(record); }
  case 'transcript': { return decodeTranscript(record); }
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
  default: { return { error: `Unknown remote frame type "${type}".` }; }
  }
}
