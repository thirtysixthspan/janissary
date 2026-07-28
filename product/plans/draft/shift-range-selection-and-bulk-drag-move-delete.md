# Shift-range selection, and bulk drag/move/delete

**Complexity: 7/10** — this spans client selection and drag state, two batch filesystem RPCs, conflict-safe execution, and grouped undo, but reuses the existing dialog, path, filesystem, and manager patterns rather than adding parallel abstractions.

**Minimalism review:** Keep the safety-critical server batch executor and the client state extraction required by the 200-line limit, but collapse selection into one module, extend the existing move and delete dialogs for plural cases, return only client-observable batch result fields, and use Node standard-library path/filesystem/UUID primitives.

## Summary

The file navigator will support conventional multi-selection so users can select a visible range with Shift-click, add or remove individual rows with Cmd/Ctrl-click, and then drag, move, or delete the selected items in one operation. Batch operations preserve the navigator's existing safety rules while adding one confirmation for all conflicts, grouped undo for moves, partial-failure reporting, and multi-path insertion when a selection is dropped into a command bar or editor.

## Design decisions

1. **Use one explicit selection model.** The client state consists of a keyboard cursor path, a range-anchor path, and a set of selected paths. An unmodified primary-button press replaces the selection and anchor with that row. Shift-press replaces the selection with the visible range from the anchor (or cursor, then the clicked row if neither exists) to the clicked row. Cmd-press or Ctrl-press toggles one row and makes it the new cursor and anchor. If Shift and Cmd/Ctrl are both held, Shift wins and selects the range rather than toggling it.

2. **Exclude `..` from multi-selection.** An unmodified press may still make `..` the sole cursor/selection so its existing parent-navigation behavior works. A modified press on `..` behaves like an unmodified press, and a Shift range that crosses it omits it.

3. **Keep the first version mouse-focused.** Shift+Arrow range extension and Cmd/Ctrl+A are not part of this feature. Arrow/Home/End/Page navigation, type-ahead, search reveal, and new-directory auto-selection each collapse the selection to their resulting cursor row. Open, expand/collapse, reroot, New file, New directory, and rename act only on the cursor.

4. **Resolve selection on mouse-down, before drag detection.** `useFileNavigatorDrag` currently installs its gesture from `onMouseDown` while the ordinary selection change waits for `onClick` (`web/src/FileNavigatorTab.tsx:106-109,172-184`, identifiers `onRowClick` and `onMouseDown`). Move the selection transition to the primary-button mouse-down path and pass the resulting source snapshot into the drag hook, so dragging an unselected row immediately replaces the selection and dragging a selected row carries the existing selection. Do not run a second selection transition from the later click event. Non-primary buttons do not select or drag.

5. **Normalize filesystem operations, not visual selection.** Before move or delete, preserve visible-row order, remove duplicates and `..`, and remove any selected path whose selected ancestor directory already carries it. The highlights remain on every selected visible row; only the operation payload is normalized.

6. **Validate one destination against the whole normalized selection.** A destination at or inside any normalized source directory is invalid and gets no highlight. A source already in the destination directory is an individual no-op and does not prevent the other sources from moving. If every source is a no-op, release does nothing and creates no history entry.

7. **Dragging a selection has one lead row.** The row under the pointer remains the drag's lead for gesture position. The existing ghost label shows its name for one source; for multiple selected visible rows it shows `<lead name> +<additional count>`. Escape and window blur continue to cancel the whole gesture.

8. **Insert every selected path into text drop targets in visible order.** A command-bar drop inserts active-tab-cwd-relative paths separated by single spaces. An editor drop inserts tree-root-relative paths separated by newlines. The hook calls each existing `insertAtCaret` handle once with the joined string, preserving replacement of an active text selection and one editor undo step. Neither text drop normalizes away selected descendants or moves anything on disk.

9. **Implement the command-bar relativity promised by the spec.** The current hook inserts `gesture.path` directly (`web/src/useFileNavigatorDrag.ts:82-91`, `drop`) even though `FileNavigatorView.absoluteRoot` exists specifically for cross-cwd resolution (`src/tab/types.ts:127-135`) and the spec requires active-tab-cwd-relative text. This feature must add the missing client-side relative-path calculation and target-cwd wiring; it must not describe that conversion as existing reuse.

10. **Preflight every batch conflict server-side and confirm once.** The first bulk move request carries no conflict policy. If any destination already exists, the server moves nothing and returns the full conflict set. The client then shows `Some items already exist in "<folder>".` with **Overwrite all**, **Skip conflicts**, and **Cancel**; `<folder>` is the destination row's name, or the navigator's displayed `files.root` when dropping into the root. Retrying with Overwrite all safely replaces every pre-existing destination; Skip conflicts leaves those sources in place and moves the rest; Cancel sends no retry.

11. **Treat duplicate output names as failures, not overwrite conflicts.** Two selected sources from different directories can share a basename and therefore map to the same target path even when that path did not exist at preflight. Leave every source in such a duplicate-name group unmoved, include each in the final failure list, and continue with distinct names. This prevents Overwrite all from destroying one selected source with another and keeps grouped undo representable.

12. **Bulk delete has one confirmation.** Backspace or Delete with multiple normalized paths opens `Delete <count> items?` with **Delete** and **Cancel**. Confirming attempts the batch; cancelling changes nothing. One normalized path continues through the existing `Delete "<name>"?` dialog and `deleteFileNavigatorItem` message. Zero normalized paths is a silent no-op.

13. **Partial filesystem failures do not stop a batch.** Move and delete continue after an individual error. The result's `total` is the number of normalized, non-no-op sources; `failedPaths` includes validation failures, missing sources, duplicate-output-name sources, and filesystem failures, but not deliberate Skip-conflicts omissions. When `failedPaths` is non-empty, use its length in `Could not move <failed> of <total> items.` or `Could not delete <failed> of <total> items.`, followed by the paths in input order and a **Dismiss** button. Successful items are not rolled back.

14. **One bulk move is one history step.** Record only successfully moved source/destination pairs as one ordered group; skipped, failed, and no-op sources are absent. Scalar moves become one-pair groups internally without changing their observable behavior. A new forward move still clears the redo stack.

15. **Preflight grouped undo/redo before replay.** If any pair in a group conflicts, move nothing until the user chooses **Overwrite all**, **Skip conflicts**, or **Cancel** in a batch dialog titled `Some items already exist in their destinations.` A replay attempts undo pairs in reverse order and redo pairs in forward order. After a partial replay, successful pairs move together to the opposite history stack while failed or skipped pairs remain together at the top of the source stack, so a later command can retry them.

16. **Prune against the new visible rows.** When a watcher rebuild or collapse hides selected rows, remove those paths but retain surviving selections. If the cursor disappears, prefer its nearest still-visible ancestor; otherwise clamp its former visible-row index into the new row list. If the anchor disappears, reset it to the reconciled cursor. A changed `files.absoluteRoot` clears cursor, anchor, and selection so retargeting or rerooting cannot accidentally select same-named paths in a different root.

17. **Keep single-item move/delete protocol messages stable.** `moveFileNavigatorItem` and `deleteFileNavigatorItem` remain the one-item fire-and-forget paths. Add dedicated request/reply messages named `moveFileNavigatorItems` and `deleteFileNavigatorItems` for normalized lists, conflict preflight, and per-path results.

18. **Bulk rename and clipboard file operations remain deferred.** Rename changes only the cursor row. A successful rename replaces that row's old path with its new path in cursor, anchor, and selection while preserving other selected rows. Copy, cut, paste, and other multi-item file commands are not introduced.

## What already exists (reuse, don't rebuild)

| Need | Existing precedent | Location |
| --- | --- | --- |
| Scalar selection, cursor scrolling, watcher clamp, and all tree entry points | `selected`, its effects, `onRowClick`, and `onKeyDown` | `web/src/FileNavigatorTab.tsx:50-76,106-159` |
| Pure cursor navigation and activation outcome | `FileNavigatorKeyOutcome`, `handleFileNavigatorKey`, `typeAheadMatch` | `web/src/file-navigator-keys.ts:3-9,53-82` |
| Cursor consumers outside ordinary navigation | `handleTreeChord`, `newFileTargetDir`, rename/search selection callbacks | `web/src/file-navigator-chords.ts:14-25`, `web/src/file-navigator-new-file.ts:11-21`, `web/src/useFileNavigatorRename.ts:11-67`, `web/src/useFileNavigatorSearch.ts:7-51` |
| Multi-select accessibility primitives already present per row | `role="treeitem"` and `aria-selected` | `web/src/FileNavigatorRowView.tsx:25-35` |
| Gesture threshold, pointer hit testing, Escape/blur cancellation, and text-target detection | `useFileNavigatorDrag` | `web/src/useFileNavigatorDrag.ts:22-177` |
| Pure single-source destination rules | `resolveDropTarget`, `parentPath`, `isSameOrDescendantPath` | `web/src/file-navigator-drag.ts:8-41` |
| Command input splice/highlight handle | `CommandInputDropHandle`, `insertAtCaret`, `setDropHighlighted` | `web/src/CommandInput.tsx:8-13,62-86` |
| Active editor's one-call insertion handle | `EditorDropHandle`, active-only `dropRef` assignment | `web/src/EditorTab.tsx:24-30,52-55` |
| Absolute navigator root and active tab cwd already on the wire | `FileNavigatorView.absoluteRoot`, `TabView.cwd` | `src/tab/types.ts:127-135`, `src/protocol.ts:58-70` |
| Shared modal shells and capture-phase keyboard handling | `MoveConflictDialog`, `DeleteFileDialog`, `ModalDialog`, `useDialogKeyboard`, `ConfirmDialogShell` | `web/src/MoveConflictDialog/MoveConflictDialog.tsx:9-53`, `web/src/DeleteFileDialog.tsx:8-17`, `web/src/ModalDialog.tsx:3-24`, `web/src/useDialogKeyboard.ts:3-30`, `web/src/ConfirmDialogShell.tsx:4-32` |
| Scalar file-navigator RPC declarations | `moveFileNavigatorItem`, `deleteFileNavigatorItem`, `undoFileNavigatorItem`, `redoFileNavigatorItem` | `src/protocol.ts:219-247` |
| Extracted file-navigator dispatch path with synchronous replies | `handleFileNavigatorMessage` | `src/message-handler.ts:86-99`, `src/message-handler-file-navigator.ts:5-54` |
| Controller-facing functions that resolve tab index to label | `moveFileNavigatorItem`, `deleteFileNavigatorItem`, undo/redo wrappers | `src/controller/file-navigator.ts:22-44` |
| Root-relative path helpers and fresh-disk conflict lookup | `parentPath`, `isSameOrDescendantPath`, `hasNameConflict` | `src/file-navigator/index.ts:56-74` |
| Server path containment, file-kind checks, renames/removal, and unique backup suffixes | `node:path` (`isAbsolute`, `resolve`, `relative`, `join`, `dirname`, `basename`), `node:fs` (`lstatSync`, `renameSync`, `rmSync`), and `node:crypto` (`randomUUID`) | Node.js standard library; existing filesystem imports at `src/file-navigator/manager.ts:1-2` |
| Scalar filesystem operations and one rebuild hook | `FileNavigatorManager.move`, `delete`, `rebuild` | `src/file-navigator/manager.ts:119-184,265-276` |
| Existing one-pair history representation and conflict preflight | `MoveEntry`, `UndoRedoResult`, `applyStackMove` | `src/file-navigator/moves.ts:5-40` |
| Existing server and web test conventions | colocated Vitest suites | `src/file-navigator/manager.test.ts`, `src/controller/file-navigator.test.ts`, `src/message-handler.test.ts`, `web/src/FileNavigatorTab.test.tsx`, `web/src/file-navigator-drag.test.ts`, `web/src/useFileNavigatorDrag.test.ts` |

## Proposed changes

### Selection state and row rendering

Add one `web/src/useFileNavigatorSelection.ts` module. It owns the selection state and exports the pure transitions needed for focused tests: replace, range, toggle, collapse-to-cursor, operation normalization, rename-path replacement, and reconciliation from previous visible rows to next visible rows. It returns new state rather than mutating a `Set`, resets when `files.absoluteRoot` changes, reconciles when `files.rows` changes, and exposes callbacks for rename, search reveal, and new-directory auto-rename. `useFileNavigatorRename` currently calls a scalar `setSelected` both optimistically and after the renamed row appears (`web/src/useFileNavigatorRename.ts:20-35`); replace that callback with the selection model's rename-path operation. Search reveal (`web/src/useFileNavigatorSearch.ts:21-27`) and new-directory detection (`web/src/FileNavigatorTab.tsx:78-89`) use replace-selection callbacks. Keep this as one module unless it would exceed the 200-code-line limit; only then extract its pure transitions to `file-navigator-selection.ts`.

Update `FileNavigatorTab.tsx` to consume the hook and pass cursor paths to `handleFileNavigatorKey`, `handleTreeChord`, and `newFileTargetDir`. Type-ahead and ordinary navigation collapse selection to their outcome. Delete receives normalized operation paths. Add `aria-multiselectable="true"` to the tree and expose the keyboard cursor with `aria-activedescendant`; give visible rows stable render-local ids derived from the tree's `useId` prefix and row index. Add a `cursor` row modifier so a cursor toggled out of the selection remains visually locatable without conflating it with `aria-selected`.

Update `FileNavigatorRowView.tsx` and `file-navigator-row-class.ts` to receive explicit `selected` and `cursor` booleans plus the row id. Preserve the existing `selected` and `drop-target` classes, add the cursor modifier beside them at `web/src/theme.css:736-749` (the `.files-row`/`.files-drag-ghost` rules), and keep `aria-selected` true only for actual set membership.

`FileNavigatorTab.tsx` is already 231 physical lines and was previously split into row, action, search, rename, and delete modules specifically for the 200-code-line rule (`web/src/FileNavigatorRowView.tsx:21`, `web/src/useFileNavigatorSearch.ts:5-6`). Keep selection transitions/effects and new modal rendering in focused modules; do not compact this component to make the feature fit.

### Dragging, text insertion, and client batch orchestration

Extend `web/src/file-navigator-drag.ts` to resolve a target against a normalized source list and return the eligible sources, individual no-ops, and client-visible conflicts needed only for highlight/ghost feedback. Server preflight remains authoritative because collapsed target children are absent from `rows` (`web/src/file-navigator-drag.ts:27-30`).

Add `web/src/file-navigator-relative-path.ts`, a pure POSIX-style relative-path helper. Given `files.absoluteRoot`, one tree-relative source, and the active center tab's absolute cwd, it produces the command-bar path. The browser bundle has no Node `path` dependency; keep this utility browser-native and separately tested. Join converted command paths with spaces, and join unchanged tree-relative editor paths with newlines.

Thread the active `current.cwd` from `App.tsx:68-74,170-179` (the existing shared drop refs and `AppShell` call) through `AppShell.tsx:5-40` to both `Sidebar` instances, then through `Sidebar.tsx:23-34,104-108` into the sidebar-mounted `FileNavigatorTab` and drag hook. This is the only reachable command/editor text-drop path: the center-mounted navigator in `ViewTabBody.tsx:24-26` is itself the active view and receives neither drop handle. Reuse `files.absoluteRoot`; its unshortened mapping already exists at `src/tab/view.ts:54` (`files: ... absoluteRoot: tab.files.root`), so no wire-type or server view change is needed.

Split `useFileNavigatorDrag.ts` before adding batch behavior. Keep its existing window-listener gesture lifetime and text-target hit testing in the hook, but move move-request/conflict/undo orchestration into a new `web/src/useFileNavigatorMoveOperations.ts`. The gesture captures the ordered selected paths at mouse-down so watcher renders during a drag cannot silently change the payload. It calls the existing scalar send for one normalized source and `client.request` with `moveFileNavigatorItems` for more than one.

`useFileNavigatorMoveOperations` owns the initial bulk request, the pending bulk conflict, Overwrite all and Skip conflicts retries, grouped undo/redo conflict retries, and move failure results. Preserve the existing scalar `PendingConflict`/`MoveConflictDialog` path for a one-pair move or history entry. Extend `undoFileNavigatorItem` and `redoFileNavigatorItem` params with an optional `skipConflicts` flag while retaining the current optional `overwrite` flag, so current scalar overwrite calls remain valid.

Extend the existing `MoveConflictDialog` (`web/src/MoveConflictDialog/MoveConflictDialog.tsx:9-53`) to accept an explicit title and an optional Skip conflicts action. Preserve its two-action scalar presentation when Skip is absent; use three choices for batch conflicts, select Cancel by default, cycle with Left/Right, confirm the selected action with Enter, and cancel with Escape. This keeps one conflict-dialog implementation for forward moves and history replay.

Extend `useFileNavigatorDelete.ts:4-15` (`pendingDelete`, `confirm`) from a scalar pending path to a scalar-or-list operation. Extend `DeleteFileDialog.tsx:8-17` to accept either the existing item name or a count and choose the singular or plural title while continuing to delegate to `ConfirmDialogShell`; do not add another confirmation component. The batch confirmation calls `client.request` with `deleteFileNavigatorItems` and stores its failures.

Add `web/src/FileNavigatorFailureDialog.tsx`, a one-action `ModalDialog` showing the exact move/delete failure sentence and failed paths. **Dismiss**, Enter, or Escape closes it and returns focus to the tree. This is a modal result, not a transcript entry or notification; no existing app-wide toast/error service exists to reuse.

### Protocol and server batch execution

Export named bulk conflict-policy and result types from `src/protocol.ts` so the React client imports them through `@shared/protocol` instead of duplicating wire shapes. `moveFileNavigatorItems` carries tab index, ordered source relative paths, destination relative path, and an optional overwrite-all/skip-conflicts policy. Its result is either the conflict paths from preflight or a completed response containing only `total` and ordered `failedPaths`, the fields the client displays. `deleteFileNavigatorItems` carries tab index and ordered paths and returns the same completed shape. Successful pairs and skipped conflicts remain server-local execution details.

Add the two method names to the grouped cases in `src/message-handler.ts:86-99` and the extracted union in `src/message-handler-file-navigator.ts:5-8`. Handle both inside `handleFileNavigatorMessage` and always emit their structured synchronous `rpc-reply`, following the existing undo/redo cases (`src/message-handler-file-navigator.ts:45-51`). Do not add methods to the already large `Controller` class.

Add `moveFileNavigatorItems` and `deleteFileNavigatorItems` functions to `src/controller/file-navigator.ts`. Like the scalar wrappers at `:22-44`, each resolves the tab index to a label once, delegates to `FileNavigatorManager`, and returns `{ total: 0, failedPaths: [] }` for a missing tab. Import and call these functions directly from `message-handler-file-navigator.ts`, as that file already does for rename/search/openers (`:3,24,29-43`).

Add `src/file-navigator/batch.ts` for validation, normalization, conflict preflight, and filesystem loops. Use `node:path` rather than a custom path parser: reject `isAbsolute` input, `.`, `..`, empty source paths, and any `resolve`d path whose `relative` path escapes the navigator root. Use `lstatSync` for the real-directory and symlink checks, with missing sources and destinations handled as results rather than thrown errors. Deduplicate exact sources, remove selected descendants with the existing `isSameOrDescendantPath`, identify same-parent no-ops with the existing `parentPath`, reject duplicate `basename` groups, and preserve the remaining input order.

The first move call checks every valid destination against current disk state before mutating anything. With conflicts and no policy, return them and do no work. Skip-conflicts removes those sources from the attempt. Overwrite-all replaces each destination with a recoverable same-directory backup whose suffix comes from `randomUUID`: use `renameSync` to park the old destination, rename the source into place, remove the backup only after success, and restore it if the source rename fails. This handles non-empty directory conflicts without the data-loss window created by deleting the destination first. Clean up or restore temporary siblings before returning, and never expose them in history.

Every retry is a fresh validation against disk. A new conflict that appears between preflight and retry follows the supplied overwrite/skip policy; a source that disappears becomes a failure. Require the destination itself to be a real directory rather than a followed symlink, matching the navigator's rule that symlinks render as non-expandable files (`src/file-navigator/index.ts:11-15`, `readDirSorted`).

`FileNavigatorManager` gains thin `moveMany` and `deleteMany` methods that obtain the tab state, delegate to `batch.ts`, push one successful move group, clear redo once, and rebuild once if any filesystem mutation succeeded. Keep the loops out of `src/file-navigator/manager.ts`, which is already 287 physical lines and owns watchers/navigation in addition to scalar operations.

### Grouped move history

In `src/file-navigator/moves.ts`, retain `MoveEntry` as one source/destination pair and add a `MoveGroup` containing ordered pairs. Change `FilesTabState.undoStack` and `redoStack` (`src/file-navigator/manager.ts:23-35`) to groups. Scalar `move` pushes a one-pair group; bulk move pushes one group containing only its successes.

Replace the one-pair `applyStackMove` contract with group preflight/replay while preserving the current singular result for a one-pair conflict. Multi-pair conflicts return the plural conflict data needed by the batch mode of `MoveConflictDialog`. An absent overwrite/skip policy performs no mutation when any conflict exists. Overwrite and skip use the same safe destination-replacement helper as forward batch moves.

During replay, move successful pairs to one group on the opposite stack and leave failed/skipped pairs as one group at the source stack's top. Rebuild once when at least one pair moved. `UndoRedoResult` reuses the same `total` and ordered `failedPaths` summary so the move failure dialog can report partial replay failures. The existing empty-stack result remains a silent no-op.

### Product specification

Update `product/specs/file-navigator-tab.md` at "Mouse interactions" (`:124-138`), "Moving files by drag-and-drop" (`:148-179`), both text-drop sections (`:181-214`), undo/redo (`:216-235`), delete (`:237-245`), and keyboard interactions (`:268-295`). Replace the single-row/no-multiselect statement with the modifier, cursor, normalization, ghost, destination, dialog, failure, grouped-history, text joining, stale-selection, and explicit out-of-scope behavior from this plan. Correct the command-bar section only if necessary to match the implemented active-tab-cwd-relative behavior it already specifies.

## Implementation order

This plan has no dependency on either of the other draft plans. The active-tab-relative path mismatch identified in decision 9 is included here because the selected multi-path behavior cannot be correct without it.

1. Add the selection hook/pure transitions and relative-path module with their tests.
2. Wire selection into row rendering, rename/search/new-directory callbacks, keyboard behavior, and ARIA; keep scalar operations working.
3. Add protocol result types, server batch validation/execution, thin manager/controller wrappers, extracted message-handler cases, and server tests.
4. Generalize move stacks to groups and update scalar plus grouped undo/redo tests before connecting bulk drag.
5. Split and extend the client drag/move orchestration, generalize the existing conflict dialog, add the failure dialog, and thread target cwd through the sidebar path.
6. Extend delete orchestration to lists, then update integration/component tests and the product spec.

Run `./scripts/run.mjs check-diff` after each step. Relative imports in new `src/` modules use `.js`; imports in `web/src/` stay extensionless.

## Tests

Server tests are colocated as `src/**/*.test.ts`:

- Add `src/file-navigator/batch.test.ts` for normalization order, duplicates, nested sources, same-parent no-ops, traversal/absolute/empty paths, missing sources/destination, destination-inside-source rejection, duplicate basenames, complete conflict preflight with zero mutations, Skip conflicts, safe Overwrite all for files and non-empty directories, backup restoration after a forced move failure, processing after a failure, result counts/order, and one rebuild at the manager boundary.
- Extend `src/file-navigator/manager.test.ts` around scalar move/delete (`:456-509`) and undo/redo (`:571-700`) for one-pair groups, a successful batch as one history step, reverse undo/forward redo ordering, conflict preflight with no mutation, overwrite/skip retries, partial replay stack splitting, empty groups not pushed, redo clearing, and scalar regression behavior.
- Extend `src/controller/file-navigator.test.ts` for both batch wrappers, structured missing-tab results, and manager delegation.
- Extend `src/message-handler.test.ts` for both request/reply routes and their controller-function mocks; also cover plural undo/redo conflict and failure replies.

Web tests are colocated as `web/src/**/*.test.ts(x)`:

- Add focused tests for the pure transitions exported by `useFileNavigatorSelection.ts`: click/Shift/toggle precedence, empty anchor, `..` exclusion, visible ordering, operation normalization, cursor collapse, rename replacement, disappeared/hidden rows, nearest ancestor/index fallback, anchor reset, and root reset.
- Add `web/src/file-navigator-relative-path.test.ts` for same cwd, navigator nested under cwd, cwd nested under navigator, siblings requiring `..`, root equality, and joined multi-path order.
- Extend `web/src/file-navigator-drag.test.ts` for multiple sources, nested normalization, mixed same-parent no-ops, all-no-op drops, destination inside any selected directory, conflicts absent from collapsed client rows, and ghost count inputs.
- Extend `web/src/useFileNavigatorDrag.test.ts` for the mouse-down selection snapshot, selected versus unselected lead row, scalar versus request/reply batch paths, watcher rerender during drag, Escape/blur cleanup, space-joined cwd-relative command insertion, newline-joined editor insertion, and no filesystem request for text drops.
- Extend `MoveConflictDialog.test.tsx` and `DeleteFileDialog.test.tsx` for three-action default/cycling/Enter/Escape behavior, exact forward/history titles and labels, and plural delete copy; add failure-dialog tests for counts, path order, Dismiss, and refocus.
- Extend `web/src/FileNavigatorTab.test.tsx` for all row highlights and `aria-selected`, `aria-multiselectable`, cursor styling/`aria-activedescendant`, modifier mouse-down without click double-application, ordinary navigation/type-ahead collapse, cursor-only actions, rename/search/new-directory callbacks, pruning after rows/root change, batch delete, batch failure display, ghost text, and all existing one-row behavior.
- Extend `web/src/App.test.tsx` or `web/src/Sidebar.test.tsx` through the real sidebar wiring to prove the active tab cwd reaches a docked navigator. The drag-hook tests cover the existing command/editor handles receiving one joined string, so no new tests are needed in those unchanged components.

## Out of scope

- Shift+Arrow keyboard range extension.
- Cmd/Ctrl+A selection of all visible rows.
- Bulk rename.
- Copy, cut, paste, or other clipboard-based file operations.
- Atomic rollback of other successful sources when one source fails.
- Preserving selection for hidden descendants across collapse or navigator-root changes.
- Changing scalar move/delete RPC names or moving their existing client-side confirmation behavior server-side.
- Quoting or escaping the user-selected space/newline separators for multi-path text insertion.

## Open questions

None.

## Verification

- `./scripts/run.mjs check-diff` after each implementation step.
- Manual: dock a navigator containing sibling files, nested directories, two files with the same basename in different folders, and a target with file and non-empty-directory conflicts. Build and toggle selections with Shift and Cmd/Ctrl, verify cursor/selection visuals, drag to the target, and exercise Cancel, Skip conflicts, and Overwrite all. Confirm duplicate basenames remain in place and appear in the failure dialog; one undo reverses all successful moves and one redo reapplies them. Collapse a selected subtree and retarget the navigator to verify pruning/reset. With an active center tab whose cwd differs from the navigator root, drop the selection into its command bar and verify space-separated cwd-relative paths; drop into an editor and verify newline-separated tree-relative paths and one undo. Finally bulk-delete a mixed file/directory selection, cancel once, confirm once, and force one missing or inaccessible path to verify the remaining items process and the exact failure summary lists the failed path.
