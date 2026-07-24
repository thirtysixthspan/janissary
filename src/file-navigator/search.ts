import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const execFileAsync = promisify(execFile);

// VS Code's `files.exclude` defaults, matching the sync walk in `file-navigator/index.ts` (`EXCLUDES`).
const EXCLUDES = new Set(['.git', '.svn', '.hg', '.DS_Store', 'Thumbs.db']);

// A recursive, promise-based walk of `absDir` that never blocks the event loop, used when `root`
// is not inside a git repository (so `git ls-files` can't answer). Applies the same default
// excludes as the file navigator's own sync walk, but skips gitignore entirely — there's no `.git` to
// ask. Collects files only; directories are traversed but never themselves returned.
async function walkFiles(absDir: string, relDir: string): Promise<string[]> {
  let dirents;
  try {
    dirents = await readdir(absDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const results: string[] = [];
  for (const entry of dirents) {
    if (EXCLUDES.has(entry.name)) continue;
    const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...await walkFiles(path.join(absDir, entry.name), relPath));
    } else {
      results.push(relPath);
    }
  }
  return results;
}

// Given an absolute directory root, resolves to a sorted array of root-relative file paths,
// gitignore-aware: tracked files plus untracked-but-not-ignored files, via `git ls-files
// --cached --others --exclude-standard -z` (async, off the event loop — the exact `execFileAsync`
// pattern `changedPaths` uses in `git-status.ts`). Falls back to an async recursive walk (also
// off the event loop) applying the file navigator's own default excludes when `root` is not inside a
// git repository or the git invocation fails for any other reason. Directories are never
// included; every path is relative to `root`.
export async function listProjectFiles(root: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      'git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, maxBuffer: 1024 * 1024 * 64 },
    );
    return stdout.split('\0').filter(Boolean).toSorted((a, b) => a.localeCompare(b));
  } catch {
    const files = await walkFiles(root, '');
    return files.toSorted((a, b) => a.localeCompare(b));
  }
}
