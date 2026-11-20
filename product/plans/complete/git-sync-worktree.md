# Use a worktree for the shared git-sync workspace

**Complexity: 5/10** — ~115 production lines added across 2 edited files plus a new worktree module, with 8 requirements and 11 test scenarios (p=5.59)

## Goal

Provision the one shared git-sync workspace as a Git worktree of the project repository instead of a separate `git clone`. Every agent and shell workspace keeps using clones; only git-sync changes.

## Approach

The git-sync workspace edits files that live in the project's own repository, so a linked worktree gives it an isolated working directory and index while sharing the repository's objects and refs. That removes the second copy of the repo and the HTTPS/credential rewrite that only existed for a freshly cloned origin. The worktree is created detached at the remote's default-branch tip (`refs/remotes/origin/HEAD`) when that ref resolves, otherwise at the local HEAD, so it never starts from unpushed local commits. The old depth-1, `product/`-only sparse checkout is kept: in a linked worktree Git stores sparse config in the worktree's own `config.worktree`, so the main checkout is untouched. Trust and scratch-directory setup stay exactly as they are. Provisioning stays lazy and is de-duplicated exactly once by `GitSync`, and the sync cycles (branch resolution, commit, pull/rebase, push, serialization, cancellation) are unchanged.

Teardown must remove the worktree through Git, not just delete its directory: `git worktree remove --force <dir>` drops the registration in the repository's common git dir. `WorkspaceManager` tracks which directories are worktrees and uses that removal path in both the per-workspace release and the shutdown sweep, falling back to the ordinary clone removal for everything else.

## Implementation steps

1. Add `src/workspace/worktree.ts` exporting `provisionSyncWorktree(name, projectDir)` and `removeSyncWorktree(dir, projectDir)`. Provisioning finds the repo root with `findRepoRoot`, runs `git -C <root> worktree add --detach <target> <ref>` through `execFile` (trying `refs/remotes/origin/HEAD` then falling back to `HEAD`), sets the `product/` sparse checkout, then runs `trustWorkspace` and `createWorkspaceScratch` and returns a `ProvisionHandle`. The handle's `cancel` kills the child; a failed add removes any directory it created. Removal runs `git worktree remove --force <dir>` best-effort, then untrusts the directory and removes its scratch dir. File stays under 200 lines.

2. In `src/workspace/manager.ts`, add a `worktrees` set and a `createWorktree(name)` method that mirrors `create()` but calls `provisionSyncWorktree(name, this.projectDir)` and records the directory. Update `release`/`removeAll` so a tracked worktree directory goes through `removeSyncWorktree`, while every other workspace keeps `removeWorkspace`.

3. In `src/git/sync.ts`, switch `ensureWorkspace` to `workspace.createWorktree(SYNC_WORKSPACE_NAME)` (dropping the clone's `depth`/`sparseDirectories` options) and correct the clone vocabulary in comments. No change to the cycles, cache, queue, or branch resolution.

4. Update the syncing behavior in `product/specs/editor-tab.md` and `product/specs/root-path.md` from a shared clone to a shared worktree of the project repository, and correct the "shared git-sync clone" wording in any other spec that describes that workspace (`diff-tab.md`, `shell-tab.md`, `file-navigator-tab.md`) where applicable. Update `documentation/user-documentation/tab-types/editor-git-sync.md` where it describes the shared copy as a clone. No help command or key-binding changes are needed.

5. Complete the plan and remove the resolved backlog entry.

## Tests

1. New `src/workspace/worktree.test.ts` with real repositories: a bare origin, a main checkout, and a provisioned worktree. Verify the target has its own index and a `.git` file, HEAD is detached at the origin default-branch tip, only `product/` is materialized, the main checkout's origin and sparse config stay unchanged, and trust plus scratch are set up. Verify teardown drops the worktree from `git worktree list`. Verify a failed provisioning cleans up its directory so a retry can succeed.
2. Update `src/git/sync.test.ts` so its workspace fake supplies `createWorktree`, and assert `GitSync` provisions via `createWorktree` once with just the name. Keep every existing pull/save/branch/error/cancellation test unchanged.
3. Extend `src/workspace/manager.test.ts` to cover `createWorktree` tracking and that release/shutdown remove a worktree directory through Git while ordinary workspaces still use `removeWorkspace`.

Run `$janissary/scripts/run.mjs check-diff` after each step.

## Out of scope

Changing how agent or shell workspaces are provisioned, changing sync cycles or Git commands, moving the shared workspace path, changing the `$git-sync` display shortcut, and any other backlog entry.
