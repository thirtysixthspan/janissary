import { git } from './git.js';
import type { DiffSource } from './shared.js';

// What a change source compares, as the revision arguments `git diff` takes. The staged source is the
// index against `HEAD`, which `--cached` reads even before the first commit. The last commit is
// compared against its first parent, or against the empty tree when it is the first commit — asked of
// git rather than spelled out, because the empty tree's name depends on the repository's hash.

async function resolves(root: string, revision: string, signal?: AbortSignal): Promise<boolean> {
  try {
    await git(root, ['rev-parse', '--verify', '--quiet', revision], signal);
    return true;
  } catch (error) {
    if (signal?.aborted) throw error;
    return false;
  }
}

async function emptyTree(root: string, signal?: AbortSignal): Promise<string> {
  const tree = await git(root, ['hash-object', '-t', 'tree', '/dev/null'], signal);
  return tree.trim();
}

// Null when the source needs a `HEAD` the repository does not have yet: a fresh `git init` has no
// commits, and there `git diff HEAD` is a fatal error rather than an empty diff.
export async function sourceRange(root: string, source: DiffSource, signal?: AbortSignal): Promise<string[] | null> {
  if (source === 'staged') return ['--cached'];
  if (!await resolves(root, 'HEAD', signal)) return null;
  if (source === 'all') return ['HEAD'];
  if (await resolves(root, 'HEAD^', signal)) return ['HEAD^', 'HEAD'];
  return [await emptyTree(root, signal), 'HEAD'];
}
