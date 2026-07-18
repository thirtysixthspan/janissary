import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// The three git states a file navigator row can render as: an unresolved merge conflict, a
// staged change (added to the index), or a plain change (unstaged modification or untracked
// file). Priority for aggregating a directory row from its descendants is conflict > staged >
// changed — see `PRIORITY` in `file-tree/index.ts`.
export type GitFileStatus = 'changed' | 'staged' | 'conflict';

// Porcelain v1 unmerged-path codes (git's own fixed set for a conflicted file mid-merge/rebase).
const CONFLICT_CODES = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']);

// `git status` reports paths relative to the repository root, even when run from a subdirectory.
// When the tree root sits below the repo root, strip that subdirectory prefix so paths come back
// relative to the tree root (matching the tree's own row paths). `prefix` is the tree root's path
// within the repo (e.g. `sub/`, always forward-slashed) and is empty when the tree root is the
// repo root. The `-- .` pathspec already limits results to the subtree, so every path is prefixed.
function stripPrefix(p: string, prefix: string): string {
  return prefix && p.startsWith(prefix) ? p.slice(prefix.length) : p;
}

// Classify one porcelain `XY` status pair. `X` is the index (staged) column, `Y` is the worktree
// column. An unmerged path (mid-merge/rebase conflict) always wins regardless of the letters
// involved. Otherwise, any non-space, non-`?` index column means the file has staged content —
// staged wins over a same-file unstaged edit, matching "staged files show as green" even for a
// partially-staged file (`MM`). Everything else — an unstaged worktree edit or an untracked file
// (`??`) — is a plain change.
function classify(status: string): GitFileStatus {
  if (CONFLICT_CODES.has(status)) return 'conflict';
  const index = status[0];
  if (index !== ' ' && index !== '?') return 'staged';
  return 'changed';
}

// Split a NUL-terminated `git status --porcelain=v1 -z` payload into a map of root-relative
// changed paths to their git status. Each entry is `XY path` (two status columns, a space, then
// the path). A rename or copy entry (`R`/`C` in either column) is followed by one extra
// NUL-terminated field — the original path — which counts as one more changed path at the same
// status; every other entry is a single field.
function parsePorcelain(stdout: string, prefix: string): Map<string, GitFileStatus> {
  const changed = new Map<string, GitFileStatus>();
  const fields = stdout.split('\0');
  for (let i = 0; i < fields.length; i++) {
    const entry = fields[i];
    if (!entry) continue;
    const status = entry.slice(0, 2);
    const state = classify(status);
    changed.set(stripPrefix(entry.slice(3), prefix), state);
    if (status.includes('R') || status.includes('C')) {
      const original = fields[++i];
      if (original) changed.set(stripPrefix(original, prefix), state);
    }
  }
  return changed;
}

// Given an absolute directory root, resolve to a map of root-relative paths git considers
// changed to their status — modified/untracked, staged, or conflicted (see `GitFileStatus`).
// Scoped to `root`'s own subtree via the `-- .` pathspec so opening a tree deep inside a large
// repo does not pay a full-repository status cost. Resolves to an empty map — never rejects —
// when `root` is not inside a git repository or the command fails for any reason (git missing,
// non-zero exit), so a non-git directory renders with no coloring and no error.
export async function changedPaths(root: string): Promise<Map<string, GitFileStatus>> {
  try {
    const [status, prefix] = await Promise.all([
      execFileAsync('git', ['status', '--porcelain=v1', '--untracked-files=all', '-z', '--', '.'], { cwd: root }),
      execFileAsync('git', ['rev-parse', '--show-prefix'], { cwd: root }),
    ]);
    return parsePorcelain(status.stdout, prefix.stdout.trim());
  } catch {
    return new Map();
  }
}

// Given an absolute directory root, resolve to the name of the currently checked-out branch — the
// literal string `HEAD` for a detached checkout, matching git's own convention. Resolves to
// `undefined` — never rejects — when `root` is not inside a git repository or the command fails
// for any reason, so a non-git directory renders with no branch text and no error.
export async function currentBranch(root: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root });
    const branch = stdout.trim();
    return branch || undefined;
  } catch {
    return undefined;
  }
}
