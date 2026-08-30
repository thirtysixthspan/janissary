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
  default: { return { error: `Unknown remote frame type "${type}".` }; }
  }
}
