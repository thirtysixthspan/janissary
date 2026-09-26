# Make the shared git-sync workspace follow the repository's default branch

**Complexity: 3/10** — one module (`src/git/sync.ts`) changes, reusing two branch helpers that already exist in `src/git/status.ts`, plus its colocated test and the spec and user docs that describe the sync branch. No new architecture, no wire changes.

Whether a config-listed file syncs is decided against the remote's detected default branch (`defaultBranch` plus `isPrimaryBranch` in `src/git/status.ts`, used by `FileNavigatorManager.onPrimaryBranch`), but `GitSync` then hard-codes `git pull --rebase origin master` and `git push origin HEAD:master`. On a project whose default branch is `main`, every synced file passes the gate and then fails every pull and push. The spec even lists "a project whose default branch is not literally named `master`" as an expected error.

## Goal

The shared sync workspace pulls from and pushes to the branch the eligibility gate approved: the clone's `origin/HEAD`, falling back to the clone's own checked-out branch, then `master`. The branch is resolved once per provisioned workspace and discarded with it when provisioning fails.

## Approach

1. In `src/git/sync.ts`, add `resolveSyncBranch(dir)`: `defaultBranch(dir)`, else `currentBranch(dir)` unless it is absent or the detached `HEAD`, else `'master'`. Both helpers never reject, so neither does this.
2. Cache the resolved branch on the cached workspace handle itself (`branch?: Promise<string>`), stored as a copy of what `WorkspaceManager.create` returned rather than mutating the manager's object. Because the branch lives on the handle, clearing the handle after a failed provision clears the branch with it, and the next provisioning attempt resolves afresh. Caching the promise means concurrent cycles share one resolution.
3. Add a private `readyBranch(handle)` that awaits `waitForWorkspace` and then returns the cached branch promise. `openSync` and `saveSync` call it in place of `waitForWorkspace` and pass the branch to `pullRebase(dir, branch)` and `push(dir, branch)`, which build `pull --rebase origin <branch>` and `push origin HEAD:<branch>`.

## Implementation steps

1. Update `src/git/sync.ts` as above.
2. Extend `src/git/sync.test.ts`.
3. Update the "GitHub syncing" section of `product/specs/editor-tab.md`.
4. Update `documentation/user-documentation/tab-types/editor-git-sync.md` and `documentation/user-documentation/tab-types/editor.md`, which name `origin/master` and the `master`-only error.

## Tests

In `src/git/sync.test.ts`, extend the `node:child_process` mock with a per-command stdout map so it can answer `symbolic-ref refs/remotes/origin/HEAD` and `rev-parse --abbrev-ref HEAD`. Existing cases keep their `master` assertions (both lookups answer empty, so the `master` fallback applies) and the `GH_TOKEN` environment assertions stay. New cases:

- `origin/HEAD` reports `main`: the pull targets `origin main` and the push `HEAD:main`.
- No `origin/HEAD`, clone checked out on `trunk`: pull and push target `trunk`.
- A detached clone with no `origin/HEAD` falls back to `master`.
- The branch is resolved once across an open cycle and a later save cycle (one `symbolic-ref` call).
- After a failed provision, the retried workspace resolves its branch once it is ready.

## Out of scope

- Changing the eligibility gate (`isPrimaryBranch`) or how the workspace clone is provisioned.
- The file navigator's and editor's commit-to-origin cycle (`src/git/commit.ts`), which already pushes to the current branch's own name.
- Re-resolving the branch if the remote's default branch changes while the app is running.

## Specs and docs

- `product/specs/editor-tab.md` ("GitHub syncing"): the synced branch is the repository's default branch, and a non-`master` default is no longer an error cause.
- `documentation/user-documentation/tab-types/editor-git-sync.md` and `documentation/user-documentation/tab-types/editor.md`: same correction.
