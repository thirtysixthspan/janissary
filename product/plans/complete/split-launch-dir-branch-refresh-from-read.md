# Split the launch-dir branch cache's fire-and-forget refresh out of its read

**Complexity: 3/10** — one module of thirty lines gains a coalescing map and loses a side effect, one caller gains the line the module lost, and one test file gains an `afterEach`. No behavior change visible outside the module: the refresh still fires on exactly the occasions it fired before. The number is not lower because the read is consumed through a `vi.mock` factory in a second test file that has to be widened, and because the coalescing has to clear itself on failure as well as success.

Work item, verbatim: *"Separate the launch-dir cache's refresh from its read so its tests stop racing module state across cases."*

`isLaunchDirOnPrimaryBranch` fires `void refreshLaunchDirBranch(launchDir)` as a side effect of every read. Each case in `src/open/launch-dir-branch.test.ts` therefore leaves an unawaited promise in flight that writes the module-level `cached` record after the case ends — potentially after the next case's `resetLaunchDirBranch()`, and even after its own `await refreshLaunchDirBranch(...)`. The suite fails intermittently on a machine where a `git` subprocess from one case outlives the case that started it, and the failure lands in whichever case ran next rather than the one that caused it — the shape of flake that gets retried and ignored instead of fixed. The file's `beforeEach` also creates a fresh temp directory per case and never removes it, so every run leaves temp directories behind.

## Design decisions

- **A read is a read.** The gate needs a synchronous answer from a value resolved elsewhere; that is the whole design of this module. Mutating global state to produce it is what makes the module untestable in isolation, and removing the mutation costs the caller one line.
- **The one production caller keeps triggering the refresh.** Splitting the refresh out means a caller that forgets to schedule one reads an ever-staler cache. `OpenFileManager.isSyncPath` fires it explicitly on the branch that consults the launch dir, so the refresh still happens on exactly the occasions it happened before — the "refreshed on use, not watched" ceiling the completed sync plan set is unchanged.
- **The refresh coalesces per launch dir.** `refreshGit` already establishes this shape for the navigator's own metadata. A burst of opens should not spawn a `git` process each, and coalescing is also what lets a test await a single settled refresh and know nothing else is in flight for that directory.
- **Coalescing clears on settle, not on success.** `refreshLaunchDirBranch` never rejects today — both reads degrade to `undefined` — but the in-flight entry is cleared on settle regardless, so a future failure cannot wedge the directory into permanently returning a resolved promise that never refreshes again.
- **`resetLaunchDirBranch` stays the per-case reset, and clears the in-flight map too.** A reset that left an in-flight refresh registered would hand the next case a promise resolving into the record it just cleared — the exact cross-case leak this work exists to remove. Its export carries a note that its only caller is the colocated test.

## Proposed changes

- `src/open/launch-dir-branch.ts`:
  - `isLaunchDirOnPrimaryBranch` becomes a pure read of `cached`, with no `void refreshLaunchDirBranch(...)` call. Its comment stops describing a refresh it no longer triggers and says the caller schedules one.
  - `refreshLaunchDirBranch` coalesces concurrent calls per `launchDir` through a module-level in-flight map, cleared when the promise settles.
  - `resetLaunchDirBranch` clears both `cached` and the in-flight map, and its comment records that the colocated test is its only caller.
- `src/open/file-manager.ts` — `isSyncPath` fires `void refreshLaunchDirBranch(launchDir)` immediately before reading `isLaunchDirOnPrimaryBranch(launchDir)`, on the branch that reaches the launch-dir fallback. The gate stays synchronous and the refresh stays unawaited.
- `src/open/file-manager.test.ts` — the `vi.mock('./launch-dir-branch.js', …)` factory gains a `refreshLaunchDirBranch` stub, since the module under test now imports it. Without it the import is `undefined` and every branch-gate case that reaches the fallback throws.

## Tests

- `src/open/launch-dir-branch.test.ts`:
  - An `afterEach` removes every temp directory the case created, matching the `afterEach` cleanup convention in `src/git/status.test.ts`. The `other` directory's cleanup moves out of the last case's body into that hook, so it runs even when the case fails.
  - Every case either awaits a refresh or asserts the unresolved state without triggering one — which is now automatic, since the read no longer triggers anything. The five existing cases assert the classifications that must not move and keep their assertions.
  - One new case pins the coalescing: two overlapping `refreshLaunchDirBranch` calls for the same launch dir return the same promise, so a burst of opens costs one resolution rather than one per open.
- `src/open/file-manager.test.ts`: the existing launch-dir fallback cases assert the refresh is scheduled alongside the read, so the production caller cannot silently stop triggering it.

## Out of scope

- Watching the launch dir for branch changes, or refreshing it from the points `refreshGit` fires. The refresh-on-use ceiling stands.
- The navigator's own `refreshGit` coalescing, which is unchanged and is only the precedent being followed here.
- Any user-visible behavior: the same reads happen at the same times, and the gate's answers are unchanged.

## Verification

- `./scripts/run.mjs check-diff`
