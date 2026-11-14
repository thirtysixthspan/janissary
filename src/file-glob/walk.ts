import { readdir, realpath, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { createRealTargetCheck, type FilePolicyFailure } from '../file-read/policy.js';
import { createGlobMatcher, type GlobMatcher } from './match.js';

export interface GlobWalkOptions {
  root: string;
  start: string;
  pattern: string;
  hidden: boolean;
  dirs: boolean;
  limit: number;
  deadline: number;
  ignored: ReadonlySet<string>;
  realStart?: string;
  signal?: AbortSignal;
}

export interface GlobWalkResult {
  paths: string[];
  truncated: boolean;
  timedOut: boolean;
}

type EntryKind = 'file' | 'link' | 'directory' | 'skip';

interface WalkState {
  options: GlobWalkOptions;
  realRoot: string;
  realPrefix: string | undefined;
  secretCheck: (realTarget: string) => FilePolicyFailure | undefined;
  matcher: GlobMatcher;
  paths: string[];
  stopped: boolean;
  timedOut: boolean;
}

function compareCodeUnits(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

async function readSorted(dir: string): Promise<Dirent[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.toSorted((a, b) => compareCodeUnits(a.name, b.name));
  } catch {
    return [];
  }
}

function isIgnored(state: WalkState, rootRelative: string, startRelative: string): boolean {
  const { ignored } = state.options;
  if (ignored.has(rootRelative)) return true;
  return state.realPrefix !== undefined && ignored.has(joinRelative(state.realPrefix, startRelative));
}

function isPruned(state: WalkState, name: string, rootRelative: string, startRelative: string): boolean {
  if (name === '.git') return true;
  if (state.options.hidden) return false;
  return name.startsWith('.') || name === 'node_modules' || isIgnored(state, rootRelative, startRelative);
}

async function classify(entry: Dirent, absDir: string): Promise<EntryKind> {
  if (entry.isFile()) return 'file';
  if (entry.isDirectory()) return 'directory';
  if (!entry.isSymbolicLink()) return 'skip';
  try {
    const target = await stat(path.join(absDir, entry.name));
    return target.isFile() ? 'link' : 'skip';
  } catch {
    return 'skip';
  }
}

async function linkTargetAllowed(state: WalkState, absPath: string): Promise<boolean> {
  try {
    return state.secretCheck(await realpath(absPath)) === undefined;
  } catch {
    return false;
  }
}

function isSecretMatch(state: WalkState, startRelative: string, rootRelative: string): boolean {
  if (state.secretCheck(path.join(state.realRoot, rootRelative)) === 'Secret file') return true;
  if (state.realPrefix === undefined) return false;
  return state.secretCheck(path.join(state.realRoot, state.realPrefix, startRelative)) === 'Secret file';
}

async function record(state: WalkState, startRelative: string, rootRelative: string, kind: Exclude<EntryKind, 'skip'>, absPath: string): Promise<void> {
  if (!state.matcher(startRelative)) return;
  if (isSecretMatch(state, startRelative, rootRelative)) return;
  if (kind === 'link' && !(await linkTargetAllowed(state, absPath))) return;
  state.paths.push(kind === 'directory' ? `${rootRelative}/` : rootRelative);
  if (state.paths.length > state.options.limit) state.stopped = true;
}

function joinRelative(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

async function visitEntry(state: WalkState, entry: Dirent, absDir: string, startRelative: string, rootRelative: string): Promise<void> {
  const kind = await classify(entry, absDir);
  const absPath = path.join(absDir, entry.name);
  if (kind === 'file' || kind === 'link') {
    if (!state.options.dirs) await record(state, startRelative, rootRelative, kind, absPath);
  } else if (kind === 'directory') {
    if (state.options.dirs) await record(state, startRelative, rootRelative, kind, absPath);
    await walkDirectory(state, absPath, startRelative, rootRelative);
  }
}

async function walkDirectory(state: WalkState, absDir: string, startRelDir: string, rootRelDir: string): Promise<void> {
  if (state.stopped) return;
  if (state.options.signal?.aborted === true) {
    state.stopped = true;
    return;
  }
  if (Date.now() >= state.options.deadline) {
    state.timedOut = true;
    state.stopped = true;
    return;
  }
  const entries = await readSorted(absDir);
  for (const entry of entries) {
    if (state.stopped) return;
    const rootRelative = joinRelative(rootRelDir, entry.name);
    const startRelative = joinRelative(startRelDir, entry.name);
    if (isPruned(state, entry.name, rootRelative, startRelative)) continue;
    await visitEntry(state, entry, absDir, startRelative, rootRelative);
  }
}

async function resolveRoot(root: string): Promise<string | undefined> {
  try {
    return await realpath(root);
  } catch {
    return undefined;
  }
}

export async function walkGlob(options: GlobWalkOptions): Promise<GlobWalkResult> {
  const realRoot = await resolveRoot(options.root);
  if (realRoot === undefined) return { paths: [], truncated: false, timedOut: false };
  const prefix = path.relative(options.root, options.start).split(path.sep).join('/');
  const state: WalkState = {
    options,
    realRoot,
    realPrefix: options.realStart === prefix ? undefined : options.realStart,
    secretCheck: createRealTargetCheck(realRoot),
    matcher: createGlobMatcher(options.pattern, options.hidden),
    paths: [],
    stopped: false,
    timedOut: false,
  };
  await walkDirectory(state, options.start, '', prefix);
  return {
    paths: state.paths.slice(0, options.limit),
    truncated: state.paths.length > options.limit,
    timedOut: state.timedOut,
  };
}
