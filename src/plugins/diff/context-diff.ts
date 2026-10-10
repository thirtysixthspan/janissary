import { git } from './git.js';
import { parseDiff } from './parse-diff.js';
import { availableContextBoundaries, expandHunksAtBoundary } from './context-boundaries.js';
import type { DiffFile, DiffHunk } from './shared.js';

async function contextFile(root: string, file: DiffFile, prefix: string, lines: number): Promise<DiffFile | undefined> {
  const paths = file.oldPath === undefined ? [file.path] : [file.path, file.oldPath];
  const output = await git(root, [
    '--literal-pathspecs', 'diff', 'HEAD', '-M', '--no-ext-diff', '--no-color', `--unified=${lines}`, '--', ...paths,
  ]);
  return parseDiff(output, { prefix }).find((candidate) => candidate.path === file.path);
}

function applyBoundaryExpansions(current: DiffHunk[], full: DiffHunk[], requested: ReadonlySet<string>): {
  hunks: DiffHunk[];
  failed: Set<string>;
} {
  let hunks = current;
  const failed = new Set<string>();
  for (const boundary of requested) {
    if (full.length === 0) { failed.add(boundary); continue; }
    const expanded = expandHunksAtBoundary(hunks, full, boundary);
    if (expanded === hunks) failed.add(boundary);
    else hunks = expanded;
  }
  return { hunks, failed };
}

function contextFailure(file: DiffFile, lines: number | undefined, error: unknown, requested: ReadonlySet<string>, boundaries: DiffFile['contextBoundaries']): DiffFile {
  const reason = error instanceof Error ? error.message.split('\n', 1)[0] : String(error);
  const boundaryError = requested.size > 0 && boundaries !== undefined;
  return {
    ...file,
    ...(lines !== undefined && { contextLines: lines }),
    canExpandContext: true,
    contextBoundaries: boundaries?.map((boundary) => requested.has(boundary.id)
      ? { ...boundary, error: reason || 'Context expansion failed' } : boundary),
    ...(!boundaryError && { contextError: reason || 'Context expansion failed' }),
  };
}

async function expandFile(
  root: string,
  file: DiffFile,
  prefix: string,
  contexts: ReadonlyMap<string, number>,
  expandedBoundaries: ReadonlyMap<string, ReadonlySet<string>>,
  widerFiles: ReadonlyMap<string, DiffFile>,
): Promise<DiffFile> {
  const lines = contexts.get(file.path);
  const requested = expandedBoundaries.get(file.path) ?? new Set<string>();
  let boundaries = file.contextBoundaries;
  try {
    const current = lines === undefined || lines === 3 ? file : await contextFile(root, file, prefix, lines);
    const wider = lines === undefined || lines === 3
      ? widerFiles.get(file.path) ?? await contextFile(root, file, prefix, 4)
      : await contextFile(root, file, prefix, lines + 1);
    boundaries = availableContextBoundaries(current?.hunks ?? file.hunks, wider?.hunks ?? [], new Set());
    const full = requested.size === 0 ? undefined : await contextFile(root, file, prefix, 1_000_000);
    const { hunks, failed } = applyBoundaryExpansions(current?.hunks ?? file.hunks, full?.hunks ?? [], requested);
    const next = wider;
    const successful = new Set(requested);
    for (const id of failed) successful.delete(id);
    boundaries = availableContextBoundaries(hunks, wider?.hunks ?? [], successful);
    for (const id of failed) {
      const boundary = availableContextBoundaries(file.hunks, wider?.hunks ?? [], new Set()).find((item) => item.id === id);
      if (boundary) boundaries.push({ ...boundary, error: 'Context expansion failed' });
    }
    return {
      ...(current ?? file), hunks, contextBoundaries: boundaries,
      ...(lines !== undefined && { contextLines: lines }),
      canExpandContext: (lines === undefined || lines < 1_000_000)
        && JSON.stringify(current?.hunks) !== JSON.stringify(next?.hunks),
    };
  } catch (error) {
    return contextFailure(file, lines, error, requested, boundaries);
  }
}

export async function expandContextFiles(
  root: string,
  files: DiffFile[],
  prefix: string,
  contexts: ReadonlyMap<string, number>,
  expandedBoundaries: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
  widerFiles: ReadonlyMap<string, DiffFile> = new Map(),
): Promise<DiffFile[]> {
  const expanded: DiffFile[] = [];
  for (const file of files) {
    if (file.binary || file.hunks.length === 0) { expanded.push(file); continue; }
    expanded.push(await expandFile(root, file, prefix, contexts, expandedBoundaries, widerFiles));
  }
  return expanded;
}
