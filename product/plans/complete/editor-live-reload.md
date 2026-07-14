# Live-reload an open editor file when another process changes it

**Complexity: 6/10** — no existing per-file watch mechanism; needs a new server-side manager, a
new `EditorView` field, and client-side reconciliation between "dirty" and "changed on disk."

## Goal

When a file open in the in-app editor is **not** dirty (no unsaved edits) and another process
changes it on disk, the editor live-reloads the new content. If the buffer **is** dirty when the
external change lands, the buffer is left untouched, but the next save attempt shows an "Overwrite
this file?" prompt (save/overwrite or cancel) instead of silently clobbering the on-disk change.

## Design decisions

**Detect changes with one `fs.watch` per open editor tab, not by diffing content.** The existing
`FileTreeManager` (`src/file-tree-manager.ts`) already watches directories with a debounced
rebuild; this fix mirrors that pattern with a new `EditorWatchManager` that watches individual
files, keyed by tab label.

**Suppress the app's own save-triggered watch event via a baseline mtime, not a time-based
debounce window.** Writing the file from `editor-save.ts` fires the same `fs.watch` callback used
for genuine external changes. Instead of guessing a "quiet period" after a save, `EditorWatchManager`
tracks a `baselineMtimeMs` per tab and exposes `markSaved(label, mtimeMs)`, called right after
`editor-save.ts` writes the file and re-stats it. The watcher's own debounced check only reports a
change when the file's mtime differs from the baseline — the app's own write moves the baseline
forward before the resulting watch event is even processed, so it's never mistaken for an external
change, and there's no race window to tune.

**Push the new mtime through the existing `EditorView` → `TabView` state broadcast**, not a new
push-message type. Add `mtimeMs?: number` to `EditorView` (`src/types.ts`); the manager updates
`tab.editor = {...tab.editor, mtimeMs}` and emits `state`/`dirty` exactly like every other
tab-mutating manager already does. The client already re-renders `EditorTab` on every state
broadcast, so no new WebSocket message shape is needed.

**Client decides reload-vs-conflict from `dirty`, tracked entirely client-side.** `EditorTab`
already computes `dirty` (buffer text vs. last-saved text). A new effect watches `editor.mtimeMs`:
the first sighting is the load-time baseline (no-op); every value after that is a genuine external
change. If not dirty, refetch and reload (preserving the cursor line). If dirty, set a
`conflictPendingRef` flag; the next `save()` call opens the conflict dialog instead of writing,
and confirming forces the write through.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Per-directory `fs.watch` + debounce pattern to mirror | `src/file-tree-manager.ts` |
| `EditorView` type | `src/types.ts` (`EditorView`) |
| `TabManager.openEditorTab` (where a watch starts) | `src/tab-manager.ts` |
| `closeTabResources` (where a watch stops) | `src/tab-cleanup.ts` |
| `saveFile` (where the baseline moves forward) | `src/editor-save.ts` |
| `Managers` registry + `Controller` wiring pattern | `src/managers.ts`, `src/controller.ts` |
| Client dirty-tracking + save flow | `web/src/EditorTab.tsx` |
| Existing 3-button modal to mirror styling from (not reuse directly — this needs 2 buttons) | `web/src/SaveChangesDialog/SaveChangesDialog.tsx` |

## Server changes

1. **`src/editor-watch-manager.ts` (new)** — `EditorWatchManager` with `watch(label, filePath)`,
   `markSaved(label, mtimeMs)`, `closeTab(label)`, `dispose()`. Stats the file to seed
   `baselineMtimeMs` on `watch`; a debounced (100ms) `fs.watch` callback re-stats and, only if the
   mtime moved past the baseline, updates `tab.editor.mtimeMs` and emits `state`/`dirty`.
2. **`src/managers.ts` / `src/controller.ts`** — register `editorWatch: EditorWatchManager` in the
   `Managers` interface, instantiate it in the constructor, and call `dispose()` in `shutdown()`
   (same shape as `fileTree`).
3. **`src/tab-manager.ts` `openEditorTab`** — after adding the tab, call
   `this.managers.editorWatch.watch(<new tab's label>, view.path)`.
4. **`src/tab-cleanup.ts`** — call `managers.editorWatch.closeTab(tab.label)` unconditionally
   alongside `managers.fileTree.closeTab(tab.label)`.
5. **`src/editor-save.ts`** — after `writeFileSync`, stat the file once and call
   `managers.editorWatch.markSaved(tab.label, stat.mtimeMs)` in addition to refreshing the
   displayed size.
6. **`src/types.ts`** — add `mtimeMs?: number` to `EditorView`.

## Web changes

7. **`web/src/OverwriteConflictDialog.tsx` (new)** — a 2-button modal ("Overwrite (y)" /
   "Cancel (Esc)"), styled and keyboard-driven like `SaveChangesDialog` but without the
   discard option (there's nothing to discard — the buffer is just left as-is on cancel).
8. **`web/src/EditorTab.tsx`**:
   - Factor the fetch-and-decode logic out of the load effect into a small `fetchContent` helper
     so it can be reused for reloads.
   - Add a `conflictPendingRef` (set when an external change lands while dirty, cleared on a
     successful save) and a `conflictOpen` state for the dialog.
   - Add an effect on `editor.mtimeMs`: skip the first sighting (that's the load-time baseline);
     on every later change, reload (preserving the cursor line) if not dirty, or set
     `conflictPendingRef.current = true` if dirty.
   - `save()` checks `conflictPendingRef` first and opens the dialog instead of writing; the
     dialog's "Overwrite" path calls the underlying write directly, bypassing the check.

## Tests

- **`src/editor-watch-manager.test.ts`** — watches a file and reports a new `mtimeMs` after an
  external write; ignores a watch event when the mtime hasn't moved; `markSaved` prevents the
  app's own write from being reported; `closeTab`/`dispose` close watchers.
- **`src/tab-cleanup.test.ts`** — `closeTabResources` calls `managers.editorWatch.closeTab`.
- **`web/src/OverwriteConflictDialog.test.tsx`** — mirrors `SaveChangesDialog.test.tsx`'s
  keyboard/click/focus coverage for the 2-button variant.
- **`web/src/EditorTab.test.tsx`** — reloads clean content when `mtimeMs` changes; leaves a dirty
  buffer untouched and shows the conflict dialog on the next save attempt; the dialog's Overwrite
  button saves and closes it; Cancel leaves the buffer dirty and unsaved.

## Verification

- `./scripts/run.mjs check-diff` — lint, incremental typecheck, and the related server + web
  tests.
- Manual (not run in this environment): open a file with `edit`, modify it from another terminal
  while the buffer is untouched — confirm it live-reloads. Type into the buffer first, then modify
  the file externally, then try to save — confirm the overwrite-conflict prompt appears and
  behaves correctly for both Overwrite and Cancel.

## Out of scope

- Reconciling the file-tree's directory watcher with the editor's per-file watcher (they're
  independent; both can watch the same directory).
- Diff/merge UI for the conflicting content — the prompt is a binary overwrite-or-cancel choice,
  per the original issue.
