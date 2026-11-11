import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { containedAbsolute } from '../path-containment.js';
import { SECRET_DENY_PATHS } from '../sandbox/paths.js';
import { parseFileRead, type FileReadArgs } from './command.js';
import { formatFileLines } from './format.js';

export const FILE_READ_MAX_BYTES = 5 * 1024 * 1024;

type ReadFailure = 'File not found' | 'Is a directory' | 'Not a text file' | 'File too large (>5 MB)' | 'Outside the workspace' | 'Secret file';

const SECRET_SEGMENT_RUNS = SECRET_DENY_PATHS.map((entry) => entry.toLowerCase().split('/'));

function containsRun(segments: string[], run: string[]): boolean {
  for (let start = 0; start + run.length <= segments.length; start += 1) {
    if (run.every((segment, index) => segments[start + index] === segment)) return true;
  }
  return false;
}

function isSecretPath(relative: string): boolean {
  const segments = relative.toLowerCase().split(path.sep);
  const last = segments.at(-1) ?? '';
  if (last === '.env' || last.startsWith('.env.')) return true;
  return SECRET_SEGMENT_RUNS.some((run) => containsRun(segments, run));
}

function checkLexical(root: string, requested: string): ReadFailure | undefined {
  if (path.isAbsolute(requested)) return 'Outside the workspace';
  const resolved = path.resolve(root, requested);
  if (!containedAbsolute(root, resolved)) return 'Outside the workspace';
  return isSecretPath(path.relative(root, resolved)) ? 'Secret file' : undefined;
}

function loadBytes(root: string, requested: string): Buffer | ReadFailure {
  try {
    const realRoot = realpathSync(root);
    const realFile = realpathSync(path.resolve(root, requested));
    if (!containedAbsolute(realRoot, realFile)) return 'Outside the workspace';
    if (isSecretPath(path.relative(realRoot, realFile))) return 'Secret file';
    const stats = statSync(realFile);
    if (stats.isDirectory()) return 'Is a directory';
    if (!stats.isFile()) return 'Not a text file';
    if (stats.size > FILE_READ_MAX_BYTES) return 'File too large (>5 MB)';
    return readFileSync(realFile);
  } catch {
    return 'File not found';
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
  const lexicalFailure = checkLexical(root, args.path);
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
