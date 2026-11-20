import { constants } from 'node:fs';
import path from 'node:path';
import { fileFailureLine } from '../file-failure.js';
import { readRowStat } from '../file-navigator/stats.js';
import { canonicalPath } from '../file-read/canonical.js';
import type { HeadTailArgs } from './command.js';
import { formatFileLines } from '../file-read/format.js';
import { checkLexicalPath } from '../file-read/policy.js';
import { readWorkspaceLines, readWorkspaceText } from '../file-read/read.js';

const { S_IFDIR, S_IFLNK, S_IFMT } = constants;

export function countLines(text: string): number {
  if (text === '') return 0;
  const lines = text.split('\n');
  return text.endsWith('\n') ? lines.length - 1 : lines.length;
}

export function directoryFailureLine(root: string, requested: string): string | undefined {
  const stat = readRowStat(path.resolve(root, requested));
  if (stat === null) return undefined;
  const kind = stat.mode & S_IFMT;
  if (kind === S_IFDIR) return fileFailureLine('Is a directory', requested) ?? 'notdir';
  if (kind !== S_IFLNK) return undefined;
  let realRoot: string;
  let realTarget: string;
  try {
    realRoot = canonicalPath(root);
    realTarget = canonicalPath(path.resolve(root, requested));
  } catch {
    return undefined;
  }
  if (checkLexicalPath(realRoot, path.relative(realRoot, realTarget)) !== undefined) return undefined;
  const targetStat = readRowStat(realTarget);
  if (targetStat !== null && (targetStat.mode & S_IFMT) === S_IFDIR) {
    return fileFailureLine('Is a directory', requested) ?? 'notdir';
  }
  return undefined;
}

export function headTail(root: string, parsed: HeadTailArgs): string {
  const lexicalFailure = checkLexicalPath(root, parsed.path);
  if (lexicalFailure === undefined) {
    const failure = directoryFailureLine(root, parsed.path);
    if (failure !== undefined) return failure;
  }
  if (parsed.direction === 'head') {
    return readWorkspaceLines(root, { path: parsed.path, offset: 1, limit: parsed.count });
  }
  const full = readWorkspaceText(root, parsed.path);
  if ('error' in full) return full.error;
  const total = countLines(full.text);
  return formatFileLines(full.text, {
    path: parsed.path,
    offset: Math.max(1, total - parsed.count + 1),
    limit: parsed.count,
  });
}
