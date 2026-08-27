# Preserve git-sync saves on rebase failure

**Complexity: 5/10** — the behavior change is localized to the shared git-sync service, its existing command-level unit tests, and the synced-editor spec and user guide. It changes failure recovery but requires no new protocol, UI, or persistence architecture.

## Goal

A failed `git pull --rebase` must never erase the local commit created for a synced editor save. The sync should leave the workspace out of an in-progress rebase, preserve the local branch and working tree, skip the push, and report the pull failure through the existing sync-error path so the user can retry after the conflict or transient failure is addressed.

## Approach

Keep the current pull/rebase workflow and error result contract. When the pull fails, attempt `git rebase --abort` only to restore the pre-rebase branch state, then rethrow the original pull error. Remove the fetch and hard reset that currently choose `origin/master` and discard the saved commit. This also treats network and authentication failures accurately instead of converting every pull failure into remote replacement.

## Implementation steps

1. Update `src/git-sync.ts` so `pullRebase` aborts a started rebase after failure and propagates the original error without fetching or resetting the workspace.
2. Update `src/git-sync.test.ts` to verify a failed save pull reports an error, preserves the local commit by issuing no destructive reset, and never attempts to push; retain coverage that the rebase abort is attempted.
3. Update `product/specs/editor-tab.md` and `documentation/user-documentation/tab-types/editor-git-sync.md` so their conflict and error descriptions match the preserved-local-change behavior.
4. Remove the resolved entry from `product/backlog/technical-debt.md` and promote this plan to complete after all checks pass.

## Tests

- `src/git-sync.test.ts`: a save whose pull/rebase fails returns the pull error, attempts to abort the rebase, does not fetch or hard-reset, and does not push.
- Existing git-sync tests continue to cover successful open and save cycles, commit ordering, authentication environment, and push errors.

## Out of scope

- Adding merge-conflict resolution UI or automatically resolving conflicts.
- Changing the synced-editor wire protocol or status states.
- Retrying failed workspace provisioning; that is a separate backlog item.
- Supporting a configurable default branch instead of `master`.
