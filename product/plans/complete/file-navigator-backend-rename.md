# Rename backend file-tree module and wire protocol to file-navigator

**Complexity: 7/10** — a large, coordinated rename spanning the backend `src/file-tree/` module, `src/protocol.ts`/`src/types.ts` wire types, the message-handler dispatch layer, and the ~9 `web/src` files that still emit the old RPC method names and type imports (left untouched by the earlier React-component rename specifically because this piece requires a matching backend change). No new architecture — every change is a mechanical identifier/file rename with no logic changes — but the two-sided coordination and breadth of fan-out puts it at the top of the resolvable range.

## Goal

Finish the "file tree" → "file navigator" rename: the backend module, its manager class, the wire-protocol types (`FileTreeRow`/`FileTreeView`), and the RPC method names (`fileTreeToggle`, `moveFileTreeItem`, etc.) all still use the old name. This is the last piece of the technical-debt item that CSS, documentation, and the React components have already moved off of.

## Background

Investigation confirmed:
- No persistence hazard: none of these type/method names are serialized into `.janissary/` state or `--relaunch` snapshots — `Tab.files?: FileTreeView` is rebuilt fresh, not restored from disk. So this is a pure rename, not a migration.
- It is a **two-sided** rename: the RPC method-name strings are matched by direct `switch`/`case` in `src/message-handler-file-tree.ts` with no version negotiation, and the client (`web/src` hooks, already renamed to `FileNavigator*` in a prior item) still sends the *old* method strings and imports the *old* `FileTreeRow`/`FileTreeView` type names. Both sides must change together in this one PR.
- The `src/file-tree/` module (17 files, ~2,127 lines: `manager.ts`, `watch.ts`, `poll.ts`, `git-refresh.ts`, `moves.ts`, `navigation.ts`, `search.ts`, `open.ts`, `open-command.ts`, `args.ts`, `git-mark.ts`, `rebuild.ts`, `index.ts`, `manager-ports.ts`, plus their colocated tests) is a real subsystem (`FileTreeManager`) living on the shared `Managers` registry (`src/managers.ts`, instantiated in `src/controller/create-managers.ts`) — the rename is mechanical (no logic changes) but touches every file in the module.
- Fan-out beyond the module: `src/protocol.ts`, `src/types.ts`, `src/message-handler.ts` (dispatch registration), `src/message-handler-file-tree.ts`, `src/controller.ts`, `src/controller/file-tree.ts` (+ test), `src/tab/creators.ts`, `src/tab/openers.ts`, `src/tab/opening-state.ts`, `src/tab/index.ts`, `src/tab/focus-history.ts`, `src/tab/manager.ts`, `src/tab/cleanup.ts` (+ tests), `src/profile/files.ts` (+ test), `src/profile/agent-opener.test.ts`, `src/profile/save.test.ts`, `src/commands/files.ts` (+ test), `src/project-files.ts` (+ test), `src/git-status.ts` (comment), `src/notifications-tab.ts` (comment).
- On the client: `web/src/useFileNavigatorSearch.ts`, `useFileNavigatorDrag.ts`, `useFileNavigatorRename.ts`, `useFileNavigatorDelete.ts`, `useFileNavigatorOpener.ts`, `FileNavigatorHeader.tsx`, `FileNavigatorTab.tsx`, `FileNavigatorRowView.tsx`, `file-navigator-keys.ts`, `file-navigator-drag.ts`, `file-navigator-new-file.ts`, `file-navigator-row-class.ts`, `file-navigator-chords.ts`, and their test files — all currently import `FileTreeRow`/`FileTreeView` from `@shared/protocol` and/or send the old RPC method strings; these get updated to the new names in this same PR.

## Approach

1. `git mv src/file-tree` → `src/file-navigator` (directory rename; individual filenames inside don't contain "file-tree" themselves, so no further file renames needed there).
2. `git mv` the three backend files whose names do contain "file-tree": `src/message-handler-file-tree.ts` → `src/message-handler-file-navigator.ts`, `src/controller/file-tree.ts` → `src/controller/file-navigator.ts`, `src/controller/file-tree.test.ts` → `src/controller/file-navigator.test.ts`.
3. Rename every backend identifier (class, types, functions, RPC method-name strings, the `Managers.fileTree` property) to its `FileNavigator`/`fileNavigator` equivalent — see the full list below.
4. Update every backend fan-out file's imports and usages accordingly (`src/tab/*.ts`, `src/profile/*.ts`, `src/commands/files.ts`, `src/project-files.ts`, `src/git-status.ts` comment, `src/notifications-tab.ts` comment).
5. Update the ~13 `web/src` files (already `FileNavigator*`-named) that still import `FileTreeRow`/`FileTreeView` or send the old RPC method strings, plus their test assertions.
6. Update import path strings referencing the renamed directory/files (`./file-tree/...` → `./file-navigator/...`, `./file-tree.js` → `./file-navigator.js`, etc.) across all touched files.

## Implementation

### File/directory renames

| Old | New |
|---|---|
| `src/file-tree/` (17 files) | `src/file-navigator/` |
| `src/message-handler-file-tree.ts` | `src/message-handler-file-navigator.ts` |
| `src/controller/file-tree.ts` | `src/controller/file-navigator.ts` |
| `src/controller/file-tree.test.ts` | `src/controller/file-navigator.test.ts` |

### Identifier renames

Type/class: `FileTreeManager` → `FileNavigatorManager`, `FileTreeManagerInstance` (test-only) → `FileNavigatorManagerInstance`, `FileTreeRow` → `FileNavigatorRow`, `FileTreeView` → `FileNavigatorView`, `FileTreeMessage` → `FileNavigatorMessage`.

Functions: `handleFileTreeMessage` → `handleFileNavigatorMessage`, `parseFileTreeArgs` → `parseFileNavigatorArgs`, `mostRecentFileTreeLabel` → `mostRecentFileNavigatorLabel`.

RPC method names (string literals + matching controller/wrapper function names, changed on **both** client and server): `fileTreeToggle` → `fileNavigatorToggle`, `fileTreeCollapseAll` → `fileNavigatorCollapseAll`, `fileTreeReroot` → `fileNavigatorReroot`, `moveFileTreeItem` → `moveFileNavigatorItem`, `deleteFileTreeItem` → `deleteFileNavigatorItem`, `renameFileTreeItem` → `renameFileNavigatorItem`, `fileTreeSearch` → `fileNavigatorSearch`, `revealFileTreeItem` → `revealFileNavigatorItem`, `fileTreeOpeners` → `fileNavigatorOpeners`, `undoFileTreeItem` → `undoFileNavigatorItem`, `redoFileTreeItem` → `redoFileNavigatorItem`.

Manager registry: `Managers.fileTree` property → `Managers.fileNavigator` (`src/managers.ts`, `src/controller/create-managers.ts`, and every `managers.fileTree.*` call site).

Import alias: `fileTreeRpc` (in `controller.ts`) → `fileNavigatorRpc`.

`openFileNavigatorFor` (in `src/controller/file-tree.ts`) already uses the target naming — left as-is.

### Explicitly unchanged

- `FileOpenerChoice` — doesn't contain "file tree" naming, not part of this rename.
- `product/specs/file-tree-tab.md` and its filename/cross-references, and the `spec/file-tree-tab.md` comment reference in `web/src/file-navigator-keys.ts` — specs are a separate category with no behavior change to reflect.
- `data-doc-shot="file-tree-view"` in `web/src/FileNavigatorTab.tsx` and `scripts/docs-screenshots/manifest.mjs` — tied to docs tooling, out of the allowed file scope for this task.

## Tests

No new tests — pure rename, no behavior change. Existing colocated tests are updated in place and must continue to pass:

Backend: `src/file-navigator/index.test.ts`, `src/file-navigator/manager.test.ts`, `src/file-navigator/search.test.ts`, `src/controller/file-navigator.test.ts`, `src/controller.test.ts`, `src/message-handler.test.ts`, `src/tab/cleanup.test.ts`, `src/tab/manager.test.ts`, `src/profile/files.test.ts`, `src/profile/agent-opener.test.ts`, `src/profile/save.test.ts`, `src/commands/files.test.ts`, `src/project-files.test.ts`.

Frontend (already-renamed files, updated for the type/method-name change only): `web/src/FileNavigatorTab.test.tsx`, `web/src/useFileNavigatorDrag.test.ts`, `web/src/file-navigator-keys.test.ts`, `web/src/file-navigator-new-file.test.ts`, `web/src/file-navigator-drag.test.ts`, `web/src/file-navigator-row-class.test.ts`.

## Out of scope

- Any logic change to file watching, git status, move/undo-redo, search, or opener resolution — this is a rename only.
- `product/specs/file-tree-tab.md` and other spec files.
- `help.md` / `documentation/user-documentation/` — no user-visible behavior changes.
- `scripts/docs-screenshots/manifest.mjs` and the `/screenshots/file-tree*.png` assets.
