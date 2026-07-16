import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// `git status` reports paths relative to the repository root, even when run from a subdirectory.
// When the tree root sits below the repo root, strip that subdirectory prefix so paths come back
// relative to the tree root (matching the tree's own row paths). `prefix` is the tree root's path
// within the repo (e.g. `sub/`, always forward-slashed) and is empty when the tree root is the
// repo root. The `-- .` pathspec already limits results to the subtree, so every path is prefixed.
function stripPrefix(p: string, prefix: string): string {
  return prefix && p.startsWith(prefix) ? p.slice(prefix.length) : p;
}

// Split a NUL-terminated `git status --porcelain=v1 -z` payload into the set of changed
// root-relative paths. Each entry is `XY path` (two status columns, a space, then the path). A
// rename or copy entry (`R`/`C` in either column) is followed by one extra NUL-terminated field —
// the original path — which counts as one more changed path; every other entry is a single field.
function parsePorcelain(stdout: string, prefix: string): Set<string> {
  const changed = new Set<string>();
  const fields = stdout.split('\0');
  for (let i = 0; i < fields.length; i++) {
    const entry = fields[i];
    if (!entry) continue;
    const status = entry.slice(0, 2);
    changed.add(stripPrefix(entry.slice(3), prefix));
    if (status.includes('R') || status.includes('C')) {
      const original = fields[++i];
      if (original) changed.add(stripPrefix(original, prefix));
    }
  }
  return changed;
}

// Given an absolute directory root, resolve to the set of root-relative paths git considers
// changed — modified, staged, or untracked (all three treated identically). Scoped to `root`'s own
// subtree via the `-- .` pathspec so opening a tree deep inside a large repo does not pay a
// full-repository status cost. Resolves to an empty set — never rejects — when `root` is not inside
// a git repository or the command fails for any reason (git missing, non-zero exit), so a non-git
// directory renders with no coloring and no error.
export async function changedPaths(root: string): Promise<Set<string>> {
  try {
    const [status, prefix] = await Promise.all([
      execFileAsync('git', ['status', '--porcelain=v1', '--untracked-files=all', '-z', '--', '.'], { cwd: root }),
      execFileAsync('git', ['rev-parse', '--show-prefix'], { cwd: root }),
    ]);
    return parsePorcelain(status.stdout, prefix.stdout.trim());
  } catch {
    return new Set();
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
