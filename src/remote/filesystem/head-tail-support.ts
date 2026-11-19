import { constants } from 'node:fs';
import path from 'node:path';
import { fileFailureLine } from '../../file-failure.js';
import { FILE_HEAD_TAIL_MAX_LINES } from '../../file-head-tail/command.js';
import { readRowStat } from '../../file-navigator/stats.js';
import { canonicalPath } from '../../file-read/canonical.js';
import { checkLexicalPath } from '../../file-read/policy.js';
import { boundedInteger, requireBoundedInteger } from './argument-checks.js';

const { S_IFDIR, S_IFLNK, S_IFMT } = constants;

export function validLineCount(value: unknown): boolean {
  return boundedInteger(value, 1, FILE_HEAD_TAIL_MAX_LINES);
}

export function decodeLineCount(args: Record<string, unknown>): number {
  return requireBoundedInteger(args.count, 1, FILE_HEAD_TAIL_MAX_LINES);
}

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
