# Bind editor sync completions to their owner

Complexity: 6/10

## Goal

Only the latest sync operation for the editor tab that started it may update that tab's sync status or report a failure under its label.

## Approach

Add a server-only sync generation to `TabRuntime` and a focused editor helper that begins an operation with the current runtime identity and generation, then resolves the still-current editor only when the tab remains open and its generation has not advanced. Runtime identity survives tab-array copies but changes when a tab is reopened with a reused label. Keep `refreshSyncedTabs` outside the status guard so every completed shared-workspace pull refreshes all affected tabs.

## Implementation steps

1. Add the runtime generation field and a focused helper for beginning and resolving current editor sync operations.
2. Use operation tokens in save-triggered sync so stale completions cannot alter status or notify under a reused label; always refresh synced tabs after the pull settles.
3. Use the same token in manual resync while retaining its success-only shared refresh behavior.
4. Add delayed-completion coverage for successive saves, close and label reuse, and an unrelated tab removal that shallow-copies the surviving tab record. Cover manual resync ownership and newer requests too.
5. Update the editor tab spec to describe that only the current tab's latest sync completion changes its status.
6. Check help and public documentation for descriptions affected by this behavior and update only if present.

## Tests

- `src/editor/save.test.ts`: two delayed saves settle out of order without an old status or notification overwriting the latest; closing and reusing a label leaves the replacement tab unchanged; removing an unrelated tab does not invalidate the owner; every completed pull still refreshes all synced tabs.
- `src/editor/resync.test.ts`: an older delayed manual resync cannot complete a newer request or a replacement tab, and unrelated removal preserves valid ownership.
- Run the scoped server checks after each implementation step and after the spec/backlog update.

## Out of scope

- Cancelling Git subprocesses when tabs close.
- Changing the shared Git sync queue or pull behavior.
- Changing how a valid current sync failure is displayed.
