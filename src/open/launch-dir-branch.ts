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

// One entry per launch dir with a refresh currently running, so a burst of opens costs one `git`
// pair rather than one per open — the same coalescing `refreshGit` does for a navigator tab's own
// metadata, and what lets a test await a single settled refresh and know nothing else is in flight.
const inFlight = new Map<string, Promise<void>>();

// The per-case reset for `launch-dir-branch.test.ts`, which is its only caller. It clears the
// in-flight map as well as the record: a reset that left a refresh registered would hand the next
// case a promise resolving into the record it had just cleared.
export function resetLaunchDirBranch(): void {
  cached = undefined;
  inFlight.clear();
}

// Re-read the launch dir's two branch facts and store them against `launchDir`. Never rejects: a
// non-repo root or a git failure resolves `undefined` for both fields inside the record. Concurrent
// calls for the same `launchDir` share one resolution; the in-flight entry is cleared when the
// promise settles rather than when it succeeds, so a future failure cannot wedge a directory into
// never refreshing again.
export function refreshLaunchDirBranch(launchDir: string): Promise<void> {
  const existing = inFlight.get(launchDir);
  if (existing) return existing;
  const running = resolveLaunchDirBranch(launchDir);
  inFlight.set(launchDir, running);
  return running;
}

async function resolveLaunchDirBranch(launchDir: string): Promise<void> {
  try {
    const [branch, detectedDefault] = await Promise.all([currentBranch(launchDir), defaultBranch(launchDir)]);
    cached = { launchDir, branch, defaultBranch: detectedDefault };
  } finally {
    inFlight.delete(launchDir);
  }
}

// Whether the launch dir is confirmably on its primary branch, per `isPrimaryBranch`. A pure read of
// the cache: synchronous by design, because the value was resolved elsewhere, and free of side
// effects so it cannot write module state after the caller has moved on. Scheduling the refresh is
// the caller's job — `OpenFileManager.isSyncPath` fires one on the branch that reads this.
// `undefined` means unconfirmed: nothing has been resolved yet, or the cache holds a different
// launch dir. The caller treats an unconfirmed launch dir as unsynced.
export function isLaunchDirOnPrimaryBranch(launchDir: string): boolean | undefined {
  const known = cached?.launchDir === launchDir ? cached : undefined;
  return known ? isPrimaryBranch(known.branch, known.defaultBranch) : undefined;
}
