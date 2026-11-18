import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { canonicalPath } from './canonical.js';
import { parseFileRead, type FileReadArgs } from './command.js';
import { formatFileLines } from './format.js';
import { checkLexicalPath, checkRealTarget, classifyStats, FILE_POLICY_MAX_BYTES } from './policy.js';
import { fileOperationReason } from '../file-navigator/file-operation-result.js';

// eslint-disable-next-line unicorn/prefer-export-from -- no-restricted-syntax forbids re-exports here; keep the existing import path by assignment
export const FILE_READ_MAX_BYTES = FILE_POLICY_MAX_BYTES;

function loadBytes(root: string, requested: string): Buffer | string {
  try {
    const realRoot = canonicalPath(root);
    const realFile = canonicalPath(path.resolve(root, requested));
    const targetFailure = checkRealTarget(realRoot, realFile);
    if (targetFailure !== undefined) return targetFailure;
    const statsFailure = classifyStats(statSync(realFile));
    if (statsFailure !== undefined) return statsFailure;
    return readFileSync(realFile);
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : undefined;
    if (code === 'ENOENT' || code === 'ENOTDIR') return 'File not found';
    return fileOperationReason(error);
  }
}

function decodeText(bytes: Buffer): string | undefined {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return text.includes('\u{0}') ? undefined : text;
  } catch {
    return undefined;
  }
}

export function readWorkspaceLines(root: string, args: FileReadArgs): string {
  const lexicalFailure = checkLexicalPath(root, args.path);
  if (lexicalFailure !== undefined) return `${lexicalFailure}: ${args.path}.`;
  const bytes = loadBytes(root, args.path);
  if (typeof bytes === 'string') return `${bytes}: ${args.path}.`;
  const text = decodeText(bytes);
  if (text === undefined) return `Not a text file: ${args.path}.`;
  return formatFileLines(text, args);
}

export function readWorkspaceCommand(root: string, input: string): string {
  const parsed = parseFileRead(input);
  if ('error' in parsed) return parsed.error;
  return readWorkspaceLines(root, parsed);
}
