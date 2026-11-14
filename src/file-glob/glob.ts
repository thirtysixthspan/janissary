import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { checkLexicalPath, checkRealTarget } from '../file-read/policy.js';
import { formatGlobResult, parseFileGlob, type FileGlobArgs } from './command.js';
import { loadIgnoredPaths } from './ignored.js';
import { walkGlob } from './walk.js';

export const GLOB_TIMEOUT_MS = 30_000;

type StartResolution = { failure: string } | { secret: true } | { start: string; realStart?: string };

async function resolveReal(root: string, target: string): Promise<{ realRoot: string; realTarget: string } | undefined> {
  try {
    return { realRoot: await realpath(root), realTarget: await realpath(target) };
  } catch {
    return undefined;
  }
}

async function isDirectory(target: string): Promise<boolean> {
  try {
    const stats = await stat(target);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

async function resolveStart(root: string, dir: string): Promise<StartResolution> {
  const lexical = checkLexicalPath(root, dir);
  if (lexical === 'Outside the workspace') return { failure: `Outside the workspace: ${dir}.` };
  const start = path.resolve(root, dir);
  const real = await resolveReal(root, start);
  if (real === undefined) return { failure: `Directory not found: ${dir}.` };
  const target = checkRealTarget(real.realRoot, real.realTarget);
  if (target === 'Outside the workspace') return { failure: `Outside the workspace: ${dir}.` };
  if (!(await isDirectory(real.realTarget))) return { failure: `Not a directory: ${dir}.` };
  if (lexical === 'Secret file' || target === 'Secret file') return { secret: true };
  return { start, realStart: path.relative(real.realRoot, real.realTarget).split(path.sep).join('/') };
}

export async function globWorkspace(root: string, args: FileGlobArgs, deadline: number): Promise<string> {
  const resolution = args.dir === undefined ? { start: root } : await resolveStart(root, args.dir);
  if ('failure' in resolution) return resolution.failure;
  if ('secret' in resolution) return formatGlobResult([], { limit: args.limit, truncated: false, timedOut: false });
  const ignored = args.hidden ? new Set<string>() : await loadIgnoredPaths(root, deadline);
  if (ignored === undefined) return formatGlobResult([], { limit: args.limit, truncated: false, timedOut: true });
  const result = await walkGlob({
    root,
    start: resolution.start,
    realStart: resolution.realStart,
    pattern: args.pattern,
    hidden: args.hidden,
    dirs: args.dirs,
    limit: args.limit,
    deadline,
    ignored,
  });
  return formatGlobResult(result.paths, { limit: args.limit, truncated: result.truncated, timedOut: result.timedOut });
}

export async function globWorkspaceCommand(root: string, input: string): Promise<string> {
  const parsed = parseFileGlob(input);
  if ('error' in parsed) return parsed.error;
  return globWorkspace(root, parsed, Date.now() + GLOB_TIMEOUT_MS);
}
