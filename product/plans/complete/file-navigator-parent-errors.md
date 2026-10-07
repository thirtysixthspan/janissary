# Report failed file-navigator parent navigation

**Complexity: 4/10** — validate a new root before mutating navigator state, report denied navigation through the existing notification feed, and cover local and remote directory reads.

## Root cause

`rerootTree` changes the root before confirming that the destination directory can be read. The local directory reader converts permission errors into an empty listing, and a remote listing rejection is also converted into an empty listing by the cache. The user sees an empty tree at the denied parent with no explanation.

## Correct behavior

Double-clicking `..` and the existing keyboard navigation actions should move the tree to an accessible parent. When the target cannot be read, the navigator should keep its current root and report the failure through the notifications feed.

## Reproduction

Added `keeps the current root and notifies when the parent directory cannot be read` to `src/file-navigator/manager.test.ts`. It opens a navigator at a temporary `sub` directory, removes read permissions from its parent, and reroots. Before the fix, the tab root changes to the unreadable parent and `NotificationQueue.all` remains empty. The focused run was `npm run test:server -- --run src/file-navigator/manager.test.ts -t "parent directory cannot be read"`.

The ordinary UI behavior is already present: `FileNavigatorTab.test.tsx` covers double-clicking `..` and ArrowRight on an expanded directory, and the controller reroot test confirms a readable parent is opened. Those behaviors remain unchanged.

## Approach

Probe the candidate root with the navigator's own filesystem port before tearing down watchers or changing state. Preserve local listing behavior for ordinary rendering, while allowing the reroot preflight to distinguish a denied local read from an empty directory. For a remote navigator, await its directory listing before committing the root. On a read failure, keep the old root and publish one notification with the target and failure reason.

## Implementation steps

1. Add a strict local directory-read path for the reroot preflight while retaining the existing tolerant helper used to render incomplete or unreadable listings.
2. Make reroot validate the new root before clearing caches, replacing watchers, or updating cwd. Handle synchronous local reads and asynchronous remote reads.
3. Report a failed validation through the notifications feed and leave the navigator at its previous root.
4. Update `product/specs/file-navigator-tab.md` to describe the failure notification and retained root.
5. Run the failing manager regression and the existing parent-navigation UI and server tests.

## Regression test

`keeps the current root and notifies when the parent directory cannot be read` in `src/file-navigator/manager.test.ts` denies read permissions on the parent after opening the child navigator. It asserts that the old root remains and a notification is recorded.

## Verification

- Run `./scripts/run.mjs check-diff` after each implementation change.
- The permission-denied manager regression passes. Existing navigator UI tests cover double-clicking `..` and ArrowRight on an expanded directory; server reroot tests pass.
- Live E2E passed on 2026-10-07: opening a navigator in a child directory, denying parent directory permissions, and double-clicking `..` kept the child as root and showed an EACCES notification. The driver restored permissions. The app stopped itself when the driver disconnected; the stop task confirmed `no running janus instance` and cleared the scratch root.

## Out of scope

- Changes to directory traversal outside a file navigator.
- Changes to file mutations, remote workspace containment, or notification wording outside this failure path.
- Public documentation updates; the user documentation does not describe this failure behavior.
