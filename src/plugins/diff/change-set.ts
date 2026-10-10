import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseDiff } from './parse-diff.js';
import { isDiffFile, type DiffFile } from './shared.js';
import { git } from './git.js';
import { expandFullFileContext } from './context-diff.js';

// The effectful half of the diff: the working tree's changes versus `HEAD`, read without ever
// writing to the repository. Follows the `execFileAsync` pattern `changedPaths` uses in
// `src/git/status.ts`, with the same 64 MB buffer the project's own file list uses — a workspace's
// whole diff can exceed the default. Untracked files are read in bounded batches, because one git
// process per file is a lot of processes on a workspace full of generated output.

const UNTRACKED_CONCURRENCY = 8;

export type ChangeSetResult =
  | { kind: 'files'; files: DiffFile[] }
  | { kind: 'not-repository' }
  | { kind: 'error'; reason: string };

// A decoded change set as it arrives from another machine. The reads run where the repository is, so
// a remote workspace's result crosses a channel and is a value this plugin did not produce — checked
// before it is believed, and answered as the tab's error state when it is not one of these three.
export function isChangeSetResult(value: unknown): value is ChangeSetResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (result.kind === 'not-repository') return true;
  if (result.kind === 'error') return typeof result.reason === 'string';
  if (result.kind === 'files') return Array.isArray(result.files) && result.files.every(isDiffFile);
  return false;
}

function firstLine(text: string): string {
  return text.split('\n').map((line) => line.trim()).find((line) => line.length > 0) ?? 'git diff failed';
}

function reasonOf(error: unknown): string {
  const stderr = (error as { stderr?: string }).stderr;
  return firstLine(typeof stderr === 'string' ? stderr : String(error));
}

// Whether `root` sits inside a git repository at all, answered by the prefix read itself: a
// non-repository fails it, and so does a bare repository. Asked before anything else, because it is
// the difference between a tab that says "not a git repository" and a tab that shows a failure.
async function prefixIn(root: string): Promise<string | null> {
  try {
    const prefix = await git(root, ['rev-parse', '--show-prefix']);
    return prefix.trim();
  } catch {
    return null;
  }
}

// Whether `HEAD` resolves. A fresh `git init` repository has no commits, and there `git diff HEAD`
// is a fatal error rather than an empty diff, so the caller takes a different route.
async function hasHead(root: string): Promise<boolean> {
  try {
    await git(root, ['rev-parse', '--verify', '--quiet', 'HEAD']);
    return true;
  } catch {
    return false;
  }
}

// The untracked files gitignore admits, root-relative. `-z` so a path with a newline in it survives.
async function untrackedPaths(root: string): Promise<string[]> {
  const stdout = await git(root, ['ls-files', '--others', '--exclude-standard', '-z']);
  return stdout.split('\0').filter(Boolean);
}

// One untracked file's change set, diffed against nothing. `git diff --no-index` exits 1 when the
// files differ, which is the only outcome worth reading here, so its stdout is read off the
// rejection.
async function untrackedFile(root: string, relPath: string): Promise<DiffFile | null> {
  try {
    const stdout = await git(root, ['diff', '--no-index', '--no-color', '--', '/dev/null', path.join(root, relPath)]);
    return parseDiff(stdout, { path: relPath })[0] ?? null;
  } catch (error) {
    const stdout = (error as { stdout?: string }).stdout;
    if (typeof stdout !== 'string' || stdout === '') return null;
    return parseDiff(stdout, { path: relPath })[0] ?? null;
  }
}

async function untrackedFiles(root: string): Promise<DiffFile[]> {
  const paths = await untrackedPaths(root);
  const files: DiffFile[] = [];
  for (let index = 0; index < paths.length; index += UNTRACKED_CONCURRENCY) {
    const batch = await Promise.all(
      paths.slice(index, index + UNTRACKED_CONCURRENCY).map((relPath) => untrackedFile(root, relPath)),
    );
    files.push(...batch.filter((file): file is DiffFile => file !== null));
  }
  return files;
}

// The repository-with-no-commits route: every file gitignore admits, diffed against nothing. A path
// the index holds but the working tree no longer does becomes a deleted record with no hunks — the
// content lived only in the index, and a diff view cannot recover it.
async function unbornChangeSet(root: string): Promise<DiffFile[]> {
  const listed = await git(root, ['ls-files', '--exclude-standard', '-z']);
  const files: DiffFile[] = [];
  const indexed = listed.split('\0').filter(Boolean);
  for (const relPath of indexed) {
    if (existsSync(path.join(root, relPath))) continue;
    files.push({ path: relPath, deleted: true, additions: 0, deletions: 0, hunks: [] });
  }
  return [...files, ...await untrackedFiles(root)];
}

// Read the working tree's changes versus `HEAD` under `root`: tracked changes with rename detection,
// then each untracked file as an all-added record. Never writes to the index — no intent-to-add — so
// the repository the user is working in is untouched.
export async function readChangeSet(
  root: string,
  fullFiles: ReadonlySet<string> = new Set(),
): Promise<ChangeSetResult> {
  const prefix = await prefixIn(root);
  if (prefix === null) return { kind: 'not-repository' };
  try {
    if (!await hasHead(root)) return { kind: 'files', files: await unbornChangeSet(root) };
    const tracked = parseDiff(
      // The `-- .` pathspec scopes the diff to the root's own subtree: `git diff` without one is
      // repository-wide even when run from a subdirectory, the way `changedPaths` handles it.
      await git(root, ['diff', 'HEAD', '-M', '--no-ext-diff', '--no-color', '--unified=3', '--', '.']),
      { prefix },
    );
    const untracked = await untrackedFiles(root);
    const expanded = await expandFullFileContext(root, tracked, prefix, fullFiles);
    // One list in file path order, the way GitHub's files-changed view lists files and the way the
    // keyboard walk expects them, rather than tracked files first because that is how they were read.
    return { kind: 'files', files: [...expanded, ...untracked].toSorted((a, b) => a.path.localeCompare(b.path)) };
  } catch (error) {
    return { kind: 'error', reason: reasonOf(error) };
  }
}
