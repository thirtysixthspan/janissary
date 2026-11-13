import type { FileEditRequest, FileMutationRequest, FileWriteRequest } from './types.js';
import { displayPath } from './messages.js';
import { FILE_POLICY_MAX_BYTES } from '../file-read/policy.js';
import { isRecord } from '../value-guards.js';

export const FILE_MUTATION_PRIMER = [
  'To write or edit a file in the workspace, end your reply with one line:',
  'file write {"path":"<path>","content":"<text>"}',
  'file edit {"path":"<path>","oldString":"<text>","newString":"<text>"}',
  String.raw`Keep the JSON on that one line; write newlines inside strings as \n. Paths are relative to the workspace root.`,
  'A write creates or overwrites the file and creates missing parent folders.',
  'An edit replaces exact text that must match once, unless "replaceAll" is true. Files and arguments are limited to 5 MB.',
].join('\n');

export function isFileWriteCommandLine(line: string): boolean {
  return /^file\s+write(\s|$)/i.test(line);
}

export function isFileEditCommandLine(line: string): boolean {
  return /^file\s+edit(\s|$)/i.test(line);
}

export function isFileMutationCommandLine(line: string): boolean {
  return isFileWriteCommandLine(line) || isFileEditCommandLine(line);
}

export const FILE_WRITE_USAGE = 'Usage: file write <JSON>';
export const FILE_EDIT_USAGE = 'Usage: file edit <JSON>';

type Subcommand = 'write' | 'edit';

interface MutationArgument {
  subcommand: Subcommand;
  argument: string;
}

type FieldRead<T> = { ok: true; value: T } | { ok: false };

function extractArgument(input: string): MutationArgument | undefined {
  const trimmed = input.trim();
  const match = /^file\s+(write|edit)(?:\s|$)/i.exec(trimmed);
  if (!match) return undefined;
  const subcommand: Subcommand = match[1].toLowerCase() === 'write' ? 'write' : 'edit';
  return { subcommand, argument: trimmed.slice(match[0].length).trimStart() };
}

function parseJsonObject(argument: string): Record<string, unknown> | undefined {
  if (argument.trim() === '') return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(argument);
  } catch {
    return undefined;
  }
  return isRecord(parsed) ? parsed : undefined;
}

function readRequiredString(record: Record<string, unknown>, key: string): FieldRead<string> {
  const value = Object.hasOwn(record, key) ? record[key] : undefined;
  return typeof value === 'string' ? { ok: true, value } : { ok: false };
}

function readOptionalString(record: Record<string, unknown>, key: string): FieldRead<string | undefined> {
  if (!Object.hasOwn(record, key)) return { ok: true, value: undefined };
  const value = record[key];
  return typeof value === 'string' ? { ok: true, value } : { ok: false };
}

function readOptionalBoolean(record: Record<string, unknown>, key: string): FieldRead<boolean | undefined> {
  if (!Object.hasOwn(record, key)) return { ok: true, value: undefined };
  const value = record[key];
  return typeof value === 'boolean' ? { ok: true, value } : { ok: false };
}

const WRITE_KEYS: ReadonlySet<string> = new Set(['path', 'content', 'expectedHash']);
const EDIT_KEYS: ReadonlySet<string> = new Set(['path', 'oldString', 'newString', 'replaceAll']);

function hasOnlyAllowedKeys(record: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(record).every((key) => allowed.has(key));
}

function buildWriteRequest(record: Record<string, unknown>): FileWriteRequest | undefined {
  if (!hasOnlyAllowedKeys(record, WRITE_KEYS)) return undefined;
  const path = readRequiredString(record, 'path');
  const content = readRequiredString(record, 'content');
  const expectedHash = readOptionalString(record, 'expectedHash');
  if (!path.ok || !content.ok || !expectedHash.ok || path.value === '') return undefined;
  const request: FileWriteRequest = { kind: 'write', path: path.value, content: content.value };
  if (expectedHash.value !== undefined) request.expectedHash = expectedHash.value;
  return request;
}

function buildEditRequest(record: Record<string, unknown>): FileEditRequest | undefined {
  if (!hasOnlyAllowedKeys(record, EDIT_KEYS)) return undefined;
  const path = readRequiredString(record, 'path');
  const oldString = readRequiredString(record, 'oldString');
  const newString = readRequiredString(record, 'newString');
  const replaceAll = readOptionalBoolean(record, 'replaceAll');
  if (!path.ok || !oldString.ok || !newString.ok || !replaceAll.ok) return undefined;
  if (path.value === '' || oldString.value === '') return undefined;
  return {
    kind: 'edit',
    path: path.value,
    oldString: oldString.value,
    newString: newString.value,
    replaceAll: replaceAll.value ?? false,
  };
}

export function parseFileMutation(input: string): FileMutationRequest | { error: string } {
  const extracted = extractArgument(input);
  if (!extracted) return { error: FILE_WRITE_USAGE };
  const usage = extracted.subcommand === 'write' ? FILE_WRITE_USAGE : FILE_EDIT_USAGE;
  const record = parseJsonObject(extracted.argument);
  if (!record) return { error: usage };
  const request = extracted.subcommand === 'write' ? buildWriteRequest(record) : buildEditRequest(record);
  if (!request) return { error: usage };
  if (Buffer.byteLength(extracted.argument, 'utf8') > FILE_POLICY_MAX_BYTES) {
    return { error: `File too large (>5 MB): ${displayPath(request.path)}.` };
  }
  return request;
}

export function describeLoopCommand(command: string): string {
  const extracted = extractArgument(command);
  if (!extracted) return command;
  const label = `file ${extracted.subcommand}`;
  const request = parseFileMutation(command);
  return 'error' in request ? label : `${label} ${displayPath(request.path)}`;
}
