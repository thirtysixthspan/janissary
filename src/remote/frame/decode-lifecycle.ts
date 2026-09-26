import { decodeCloned, decodeOrigin } from './decode-root.js';
import {
  malformed, nonEmptyString, optionalNonEmptyString, type DecodeResult,
} from './decode-shared.js';

// The decoders for the frames that run and end one remote session's process — attach, spawn, the
// addressed data and resize in between, the two ways it stops, and the workspace outcome it reports.
// In their own module the way the other `frame-decode-*.ts` families are, so `frame-decode.ts` is
// left holding only the dispatcher and the frames that have no family of their own.

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function decodeAttach(record: Record<string, unknown>): DecodeResult {
  const { session, restore } = record;
  const origin = decodeOrigin(record.origin);
  if (typeof session !== 'string' || !/^[a-f\d-]{36}$/.test(session)
    || !(restore === undefined || typeof restore === 'boolean') || origin === false) return malformed('attach');
  return {
    type: 'attach', session,
    ...(restore !== undefined && { restore }),
    ...(origin !== undefined && { origin }),
  };
}

export function decodeSpawn(record: Record<string, unknown>): DecodeResult {
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

export function decodeAddressedData(type: 'input' | 'output', record: Record<string, unknown>): DecodeResult {
  if (!nonEmptyString(record.id) || typeof record.data !== 'string') return malformed(type);
  return { type, id: record.id, data: Buffer.from(record.data, 'base64').toString('utf8') };
}

export function decodeResize(record: Record<string, unknown>): DecodeResult {
  if (!nonEmptyString(record.id) || !positiveInteger(record.cols) || !positiveInteger(record.rows)) {
    return malformed('resize');
  }
  return { type: 'resize', id: record.id, cols: record.cols, rows: record.rows };
}

export function decodeKill(record: Record<string, unknown>): DecodeResult {
  return nonEmptyString(record.id) ? { type: 'kill', id: record.id } : malformed('kill');
}

export function decodeBrowserExited(record: Record<string, unknown>): DecodeResult {
  if (!nonEmptyString(record.id) || !optionalNonEmptyString(record.message)) return malformed('browser-exited');
  return record.message === undefined
    ? { type: 'browser-exited', id: record.id }
    : { type: 'browser-exited', id: record.id, message: record.message };
}

export function decodeWorkspaceReady(record: Record<string, unknown>): DecodeResult {
  const { dir, notice, cleaned } = record;
  const cloned = decodeCloned(record.cloned);
  if (!nonEmptyString(dir) || !optionalNonEmptyString(notice) || !optionalNonEmptyString(cleaned)
    || cloned === false) return malformed('workspace-ready');
  return {
    type: 'workspace-ready', dir,
    ...(notice !== undefined && { notice }),
    ...(cleaned !== undefined && { cleaned }),
    ...(cloned !== undefined && { cloned }),
  };
}

export function decodeWorkspaceFailed(record: Record<string, unknown>): DecodeResult {
  return nonEmptyString(record.message)
    ? { type: 'workspace-failed', message: record.message }
    : malformed('workspace-failed');
}

// `path` and `reason` travel together or not at all: one without the other describes neither a
// running label nor a failed removal.
export function decodeNameInUse(record: Record<string, unknown>): DecodeResult {
  const { label, path, reason } = record;
  if (!nonEmptyString(label) || !optionalNonEmptyString(path) || !optionalNonEmptyString(reason)
    || (path === undefined) !== (reason === undefined)) return malformed('name-in-use');
  return path === undefined || reason === undefined
    ? { type: 'name-in-use', label }
    : { type: 'name-in-use', label, path, reason };
}

export function decodeExit(record: Record<string, unknown>): DecodeResult {
  if (!nonEmptyString(record.id) || typeof record.exitCode !== 'number' || !Number.isSafeInteger(record.exitCode)) {
    return malformed('exit');
  }
  return { type: 'exit', id: record.id, exitCode: record.exitCode };
}

export function decodeTranscript(record: Record<string, unknown>): DecodeResult {
  if (!Array.isArray(record.blocks) || record.blocks.some((block) => typeof block !== 'string')) {
    return malformed('transcript');
  }
  return { type: 'transcript', blocks: record.blocks.map((block) => Buffer.from(block, 'base64').toString('utf8')) };
}
