import { constants } from 'node:fs';
import path from 'node:path';
import { fileFailureLine } from '../file-failure.js';
import { readRowStat } from '../file-navigator/stats.js';
import { checkLexicalPath, createRequestedTargetCheck } from '../file-read/policy.js';

const { S_IFDIR, S_IFLNK, S_IFMT, S_IFREG } = constants;

const TYPE_WORDS = new Map<number, string>([
  [S_IFREG, 'file'],
  [S_IFDIR, 'dir'],
  [S_IFLNK, 'link'],
]);

function typeWord(mode: number): string {
  return TYPE_WORDS.get(mode & S_IFMT) ?? 'file';
}

export function fileExists(root: string, requested: string): string {
  const lexicalFailure = checkLexicalPath(root, requested);
  if (lexicalFailure !== undefined) return fileFailureLine(lexicalFailure, requested) ?? 'forbidden';
  const targetFailure = createRequestedTargetCheck(root)(requested);
  if (targetFailure !== undefined) return fileFailureLine(targetFailure, requested) ?? 'forbidden';
  const stat = readRowStat(path.resolve(root, requested));
  if (stat === null) return 'missing';
  return typeWord(stat.mode);
}
