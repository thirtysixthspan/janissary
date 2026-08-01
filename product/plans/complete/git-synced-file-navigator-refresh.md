# Refresh Git-synced file navigators from their root header

**Complexity: 5/10** — the change reuses the existing shared Git-sync workspace and pull-only sync cycle, but it crosses the server-owned navigator state, wire protocol, RPC routing, React header, and documentation. A focused sync module keeps the async lifecycle and stale-result checks out of the already-near-limit navigator manager.

## Goal

Show a Git sync icon in the header of a file navigator rooted in the shared Git-sync workspace. Clicking it pulls the latest `origin/master` and rebuilds that navigator's visible tree. The icon belongs only to the navigator root header, never to nested directory rows.

## Approach

Teach `GitSync` to identify its own workspace root and descendants without provisioning the workspace. The file navigator uses that predicate to attach a sync status only to trees rooted there. A new file-navigator sync module owns the click lifecycle: mark the tree syncing, run the existing pull-only `GitSync.openSync()` cycle, discard a result if the tab closed or changed roots, then mark success or error and rebuild the rows. The client projects that server state as a root-header button using the existing sync glyph and sends a dedicated navigator RPC.

The button is disabled while a pull is already running. On success, the explicit rebuild guarantees that visible rows reflect remote changes even if filesystem watchers miss a Git-driven replacement; the existing Git metadata refresh then updates status colors, branch text, and the GitHub link.

## Implementation

1. **`src/git-sync.ts` and `src/git-sync.test.ts`** — add and test a path predicate that recognizes the shared Git-sync workspace root and its descendants while rejecting sibling paths.
2. **`src/file-navigator/sync.ts`, `src/file-navigator/find-tab.ts`, `src/file-navigator/state.ts`, `src/file-navigator/manager.ts`, `src/file-navigator/navigation.ts`, `src/file-navigator/open.ts`, `src/file-navigator/open-command.ts`, and `src/tab/types.ts`** — represent navigator sync status, mark Git-sync-workspace trees at open/rebuild time, clear stale sync state when a tree changes roots, and implement the guarded pull-and-rebuild lifecycle in a focused module. Extract the manager's repeated state/tab lookup into a small helper so the new public delegation stays within the 200-line limit.
3. **`src/protocol.ts`, `src/controller/file-navigator.ts`, `src/message-handler.ts`, and `src/message-handler-file-navigator.ts`** — add and route the fire-and-forget `resyncFileNavigator` intent by tab index through the existing file-navigator RPC helper module.
4. **`web/src/FileNavigatorHeader.tsx`, `web/src/FileNavigatorTab.tsx`, and `web/src/theme.css`** — render the existing sync glyph only in a synced navigator's root header, disable it in flight, and dispatch the navigator resync intent when clicked.
5. **`src/git-sync.test.ts`, `src/file-navigator/manager.test.ts`, `src/controller/file-navigator.test.ts`, `src/message-handler.test.ts`, and `web/src/FileNavigatorTab.test.tsx`** — cover workspace-path detection, synced-root metadata, pull/rebuild state changes, selected-tab delegation, RPC routing, root-only rendering, and click dispatch.
6. **`product/specs/file-navigator-tab.md` and `documentation/user-documentation/tab-types/file-navigator.md`** — document which navigators show the root sync control and that it refreshes from `origin/master` before rerendering the tree. `help.md` does not describe header sync actions, so no help update is needed.

## Tests

- The Git-sync path predicate accepts the workspace root and descendants but not lookalike sibling paths.
- A navigator rooted in the shared Git-sync workspace carries synced state; an ordinary navigator does not.
- Clicking resync transitions the navigator through syncing to synced, pulls once, and rebuilds rows changed by the pull; a failed pull ends in error and a second click during an in-flight pull is ignored.
- The new client RPC routes to the selected file navigator.
- The root header renders the icon only when sync state is present, disables it while syncing, and sends `resyncFileNavigator` when clicked; row rendering gains no sync buttons.

## Out of scope

- Adding sync icons to nested directory or file rows.
- Treating an arbitrary Git checkout as a Git-synced navigator; the control is limited to the app's dedicated shared sync workspace.
- Changing which project paths are configured for automatic synced-file editing.
- Committing or pushing from the file navigator; this control is pull-only.
- Refreshing every open navigator after one tree pulls. Other trees continue to use their existing filesystem watchers.
