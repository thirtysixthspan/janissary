# Revoke Pending File Navigator Watches

Complexity: 7/10

## Goal

Make collapse, reroot, pruning, and tab close revoke pending watcher acquisitions so a late handle cannot become active after its directory is no longer owned.

## Approach

Track pending acquisitions by relative path alongside resolved handles. Each acquisition reserves a unique token before calling the filesystem port and captures the root it belongs to. Completion attaches the handle only while the tab state, root, and token still match. `unwatchDir` revokes pending tokens and stops resolved handles; bulk teardown and pruning use the same lifecycle.

## Implementation steps

1. Add `pendingWatchers` to `FilesTabState` and initialize it for new navigators.
2. Update `watchDir` and `unwatchDir` in `src/file-navigator/watch.ts` to deduplicate pending requests, guard completions by state/root/token, and stop late handles.
3. Route pruning and tab teardown through the same revocation helper.
4. Add deferred tests for collapse, duplicate expansion, reroot with old completion before and after the new root watch, and tab close.
5. Run `./scripts/run.mjs check-diff`.

## Tests

- Verify collapse revokes an unresolved acquisition and stops its late handle.
- Verify duplicate expansion creates one acquisition.
- Verify old-root completions cannot occupy or revoke the new-root watch, regardless of completion order.
- Verify tab close stops resolved handles and stops handles that arrive after close.
- Retain synchronous local watch behavior.

## Out of scope

- Changing filesystem watcher event delivery or debounce behavior.
