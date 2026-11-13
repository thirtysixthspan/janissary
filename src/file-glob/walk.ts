import { readdir } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { createGlobMatcher, type GlobMatcher } from './match.js';

export interface GlobWalkOptions {
  root: string;
  start: string;
  pattern: string;
  hidden: boolean;
  limit: number;
  ignored: ReadonlySet<string>;
}

export interface GlobWalkResult {
  paths: string[];
  truncated: boolean;
}

type EntryKind = 'file' | 'directory' | 'skip';

interface WalkState {
  options: GlobWalkOptions;
  matcher: GlobMatcher;
  paths: string[];
  stopped: boolean;
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

function isPruned(name: string, rootRelative: string, options: GlobWalkOptions): boolean {
  if (name === '.git') return true;
  if (options.hidden) return false;
  return name.startsWith('.') || name === 'node_modules' || options.ignored.has(rootRelative);
}

function classify(entry: Dirent): EntryKind {
  if (entry.isFile()) return 'file';
  if (entry.isDirectory()) return 'directory';
  return 'skip';
}

function record(state: WalkState, startRelative: string, rootRelative: string): void {
  if (!state.matcher(startRelative)) return;
  state.paths.push(rootRelative);
  if (state.paths.length > state.options.limit) state.stopped = true;
}

function joinRelative(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

async function walkDirectory(state: WalkState, absDir: string, startRelDir: string, rootRelDir: string): Promise<void> {
  const entries = await readSorted(absDir);
  for (const entry of entries) {
    if (state.stopped) return;
    const rootRelative = joinRelative(rootRelDir, entry.name);
    if (isPruned(entry.name, rootRelative, state.options)) continue;
    const kind = classify(entry);
    const startRelative = joinRelative(startRelDir, entry.name);
    if (kind === 'file') {
      record(state, startRelative, rootRelative);
    } else if (kind === 'directory') {
      await walkDirectory(state, path.join(absDir, entry.name), startRelative, rootRelative);
    }
  }
}

export async function walkGlob(options: GlobWalkOptions): Promise<GlobWalkResult> {
  const state: WalkState = {
    options,
    matcher: createGlobMatcher(options.pattern, options.hidden),
    paths: [],
    stopped: false,
  };
  const prefix = path.relative(options.root, options.start).split(path.sep).join('/');
  await walkDirectory(state, options.start, '', prefix);
  return { paths: state.paths.slice(0, options.limit), truncated: state.stopped };
}
