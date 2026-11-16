import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { checkLexicalPath, checkRealTarget } from '../file-read/policy.js';

export type GrepSearchTarget =
  | { kind: 'directory'; root: string; prefix: string; searchDir: string }
  | { kind: 'file'; root: string; prefix: string; filePath: string };

export type ResolvedGrepTarget =
  | GrepSearchTarget
  | { kind: 'skip' }
  | { kind: 'failure'; text: string };

type EntryKind = 'directory' | 'file' | 'link' | 'other' | 'failure';

function skip(): ResolvedGrepTarget {
  return { kind: 'skip' };
}

function notFound(typed: string): ResolvedGrepTarget {
  return { kind: 'failure', text: `Path not found: ${typed}.` };
}

function outside(typed: string): ResolvedGrepTarget {
  return { kind: 'failure', text: `Outside the workspace: ${typed}.` };
}

async function inspect(target: string): Promise<EntryKind> {
  try {
    const info = await lstat(target);
    if (info.isSymbolicLink()) return 'link';
    if (info.isDirectory()) return 'directory';
    if (info.isFile()) return 'file';
    return 'other';
  } catch {
    return 'failure';
  }
}

async function inspectTarget(realRoot: string, relative: string): Promise<EntryKind> {
  const segments = relative.split(path.sep).filter(Boolean);
  if (segments.length === 0) return inspect(realRoot);
  let current = realRoot;
  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);
    const kind = await inspect(current);
    if (kind === 'link' || kind === 'failure') return kind;
    const isFinal = index === segments.length - 1;
    if (isFinal) return kind;
    if (kind !== 'directory') return 'failure';
  }
  return 'failure';
}

async function canonicalRoot(root: string): Promise<string | undefined> {
  try {
    const realRoot = await realpath(root);
    return (await inspect(realRoot)) === 'directory' ? realRoot : undefined;
  } catch {
    return undefined;
  }
}

async function canonicalTarget(target: string): Promise<string | undefined> {
  try {
    return await realpath(target);
  } catch {
    return undefined;
  }
}

function toPrefix(relative: string): string {
  return relative === '' ? '' : relative.split(path.sep).join('/');
}

function filePrefix(relative: string): string {
  const parent = path.dirname(relative);
  return parent === '.' ? '' : toPrefix(parent);
}

function selectedTarget(realRoot: string, relative: string, expected: string, kind: EntryKind): GrepSearchTarget {
  if (kind === 'file') {
    return { kind: 'file', root: realRoot, prefix: filePrefix(relative), filePath: expected };
  }
  return { kind: 'directory', root: realRoot, prefix: toPrefix(relative), searchDir: expected };
}

async function resolveContained(realRoot: string, relative: string, typed: string): Promise<ResolvedGrepTarget> {
  const expected = relative === '' ? realRoot : path.join(realRoot, relative);
  const kind = await inspectTarget(realRoot, relative);
  if (kind === 'failure') return notFound(typed);
  if (kind === 'other') return skip();
  const realTarget = await canonicalTarget(expected);
  if (realTarget === undefined) return kind === 'link' ? skip() : notFound(typed);
  const policy = checkRealTarget(realRoot, realTarget);
  if (policy === 'Outside the workspace') return outside(typed);
  if (policy === 'Secret file' || kind === 'link') return skip();
  if (realTarget !== expected) return skip();
  return selectedTarget(realRoot, relative, expected, kind);
}

function typedPath(requestedPath: string | undefined): string {
  if (requestedPath === undefined) return '.';
  return requestedPath;
}

export async function resolveGrepTarget(root: string, requestedPath: string | undefined): Promise<ResolvedGrepTarget> {
  const typed = typedPath(requestedPath);
  const lexical = checkLexicalPath(root, typed);
  if (lexical === 'Outside the workspace') return outside(typed);
  if (lexical === 'Secret file') return skip();
  const realRoot = await canonicalRoot(root);
  if (realRoot === undefined) return notFound(typed);
  if (checkRealTarget(realRoot, realRoot) === 'Secret file') return skip();
  const relative = path.relative(root, path.resolve(root, typed));
  return resolveContained(realRoot, relative, typed);
}
