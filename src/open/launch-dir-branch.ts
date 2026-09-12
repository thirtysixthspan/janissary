import { currentBranch, defaultBranch, isPrimaryBranch } from '../git/status.js';

// Cached pair of branch facts for the project launch dir (`tab.launchDir`): its checked-out branch
// and the remote's detected default branch, both resolved by `src/git/status.ts`. This is the
// fallback input `OpenFileManager`'s GitHub-sync gate reads for opens with no file navigator behind
// them — a shell tab's `edit`, a profile restore, a plugin opener. One record, hold-in-memory:
// resolved once at startup (see `create-managers.ts`, alongside `GitSync`'s construction) and then
// refreshed fire-and-forget each time the gate classifies a non-navigator open, never awaited, so
// an open never pays a git call's latency for its classification.
type LaunchDirBranch = { launchDir: string; branch?: string; defaultBranch?: string };

let cached: LaunchDirBranch | undefined;

export function resetLaunchDirBranch(): void {
  cached = undefined;
}

// Re-read the launch dir's two branch facts and store them against `launchDir`. Never rejects: a
// non-repo root or a git failure resolves `undefined` for both fields inside the record.
export async function refreshLaunchDirBranch(launchDir: string): Promise<void> {
  const [branch, detectedDefault] = await Promise.all([currentBranch(launchDir), defaultBranch(launchDir)]);
  cached = { launchDir, branch, defaultBranch: detectedDefault };
}

// Whether the launch dir is confirmably on its primary branch, per `isPrimaryBranch`. Synchronous
// by design — the value was resolved elsewhere. `undefined` means unconfirmed: the launch dir is
// not a git repository, git failed, or the cache holds a different launch dir (a refresh is
// triggered the same way; the caller treats an unconfirmed launch dir as unsynced).
export function isLaunchDirOnPrimaryBranch(launchDir: string): boolean | undefined {
  const known = cached?.launchDir === launchDir ? cached : undefined;
  void refreshLaunchDirBranch(launchDir);
  return known ? isPrimaryBranch(known.branch, known.defaultBranch) : undefined;
}
