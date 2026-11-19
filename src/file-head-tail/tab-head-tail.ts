import { constants } from 'node:fs';
import path from 'node:path';
import { fileFailureLine } from '../file-failure.js';
import { readRowStat } from '../file-navigator/stats.js';
import { canonicalPath } from '../file-read/canonical.js';
import { formatFileLines } from '../file-read/format.js';
import { checkLexicalPath } from '../file-read/policy.js';
import { readWorkspaceLines, readWorkspaceText } from '../file-read/read.js';
import { localReadRoot } from '../file-read/tab-read.js';
import type { Managers } from '../managers.js';
import { parseFileHeadTail } from './command.js';

const { S_IFDIR, S_IFLNK, S_IFMT } = constants;

function countLines(text: string): number {
  if (text === '') return 0;
  const lines = text.split('\n');
  return text.endsWith('\n') ? lines.length - 1 : lines.length;
}

function directoryFailureLine(root: string, requested: string): string | undefined {
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

export function headTailInTab(managers: Managers, label: string, input: string): string {
  const parsed = parseFileHeadTail(input);
  if ('error' in parsed) return parsed.error;
  const root = localReadRoot(managers, label);
  if (root === undefined) return 'forbidden';
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
