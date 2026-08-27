# Retry failed git-sync provisioning

**Complexity: 4/10** — the change is confined to the git-sync service's cached provisioning lifecycle, its existing unit tests, and a concise clarification in the synced-editor spec and guide. It reuses `WorkspaceManager.remove` and adds no new architecture.

## Goal

A transient failure while cloning the shared git-sync workspace must not poison every later sync attempt. Concurrent callers should still share one provisioning attempt, its failure should be cleaned up once, and the next open, save, or manual resync should provision a fresh workspace without restarting the app.

## Approach

Keep the synchronous handle cache that deduplicates concurrent calls. Route readiness through one helper that, on rejection, clears the cache only when it still owns that exact handle and removes the failed clone directory before rethrowing. Do not cache synchronous workspace-creation errors, so changes to repository or remote configuration can also be retried. Successful provisioning remains cached for the application's lifetime.

## Implementation steps

1. Update `src/git-sync.ts` to cache only provisioning handles, await them through an identity-checked failure cleanup helper, and use that helper from both open and save cycles.
2. Update `src/git-sync.test.ts` to verify a rejected clone is removed once for concurrent callers and that a later call creates and uses a fresh successful workspace; verify synchronous creation errors are retried as well.
3. Clarify retry behavior in `product/specs/editor-tab.md` and `documentation/user-documentation/tab-types/editor-git-sync.md`.
4. Remove the resolved backlog entry and promote this plan after all checks pass.

## Tests

- `src/git-sync.test.ts`: concurrent opens share one rejected provisioning attempt, remove its directory once, and a later open creates a second handle that succeeds.
- `src/git-sync.test.ts`: a synchronous workspace-creation error is not permanently cached.
- Existing tests retain coverage for successful provisioning deduplication and sync command ordering.

## Out of scope

- Retrying automatically without a later user or application action.
- Changing general `WorkspaceManager` provisioning behavior for agent and harness workspaces.
- Changing pull/rebase conflict handling or the synced-editor protocol.
