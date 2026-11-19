import { constants, realpathSync } from 'node:fs';
import path from 'node:path';
import { requireString, stringValue } from './argument-checks.js';
import { fileFailureLine } from '../../file-failure.js';
import { readRowStat } from '../../file-navigator/stats.js';
import { canonicalPath } from '../../file-read/canonical.js';
import { checkLexicalPath, checkRealTarget } from '../../file-read/policy.js';
import { descriptorFor } from './operation-types.js';
import { resultDecoders } from './result-decoders.js';

const { S_IFDIR, S_IFLNK, S_IFMT, S_IFREG } = constants;

const TYPE_WORDS = new Map<number, string>([
  [S_IFREG, 'file'],
  [S_IFDIR, 'dir'],
  [S_IFLNK, 'link'],
]);

function typeWord(mode: number): string {
  return TYPE_WORDS.get(mode & S_IFMT) ?? 'file';
}

function isAbsentPathError(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

function resolveExisting(location: string): string {
  try {
    return realpathSync(location);
  } catch {
    const parent = path.dirname(location);
    return parent === location ? location : path.join(resolveExisting(parent), path.basename(location));
  }
}

function resolveRealTarget(root: string, requested: string): { realRoot: string; realTarget: string } | { result: string } {
  const target = path.resolve(root, requested);
  try {
    return { realRoot: canonicalPath(root), realTarget: canonicalPath(target) };
  } catch (error) {
    if (!isAbsentPathError(error)) return { result: 'forbidden' };
    try {
      return { realRoot: canonicalPath(root), realTarget: resolveExisting(target) };
    } catch {
      return { result: 'forbidden' };
    }
  }
}

export const pathExistsOperation = descriptorFor<'path-exists'>()({
  valid: (args) => stringValue(args.path),
  decode: (args) => ({ path: requireString(args.path) }),
  paths: (args) => [args.path], rootDestination: true,
  decodeResult: resultDecoders['path-exists'],
  run: (context, args) => {
    const lexicalFailure = checkLexicalPath(context.root, args.path);
    if (lexicalFailure !== undefined) return { text: fileFailureLine(lexicalFailure, args.path) ?? 'forbidden' };
    const resolved = resolveRealTarget(context.root, args.path);
    if ('result' in resolved) return { text: resolved.result };
    const targetFailure = checkRealTarget(resolved.realRoot, resolved.realTarget);
    if (targetFailure !== undefined) return { text: fileFailureLine(targetFailure, args.path) ?? 'forbidden' };
    const stat = readRowStat(path.resolve(context.root, args.path));
    return { text: stat === null ? 'missing' : typeWord(stat.mode) };
  },
});
