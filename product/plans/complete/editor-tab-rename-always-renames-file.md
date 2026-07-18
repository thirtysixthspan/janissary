# Editor tab rename always renames the file

## Complexity
3/10 — extend one existing helper's condition and adjust `TabManager.renameTab`, plus test updates.

## Problem
`TabManager.renameTab` (`src/tab/manager.ts`) only renames the on-disk file when `tab.newFileEditor` is set. For an ordinary editor tab opened on an existing file, renaming the tab label just sets `tab.title` as a display-only alias (`src/tab/manager.ts:245-247`) — the underlying file is left untouched. Editor tabs represent a file on disk; they should have no such alias concept. `src/tab/rename-new-file.ts` already implements the on-disk rename correctly (renames the file, retargets `tab.editor`, rewatches) but is gated to `newFileEditor` tabs only.

## Solution
Route every editor tab's rename through the on-disk rename path (`renameNewFileEditor`, renamed to drop the "new file" framing since it now applies to all editor tabs), keyed on `tab.editor` being present rather than `tab.newFileEditor`. Agent/harness/page/markdown/image tabs keep the existing alias-only behavior — this fix is scoped to `editor` tabs only, per the issue text.

## Changes

### `src/tab/rename-new-file.ts` → rename to `src/tab/rename-editor.ts`
- Rename the exported function `renameNewFileEditor` → `renameEditorTab`. Behavior is unchanged: trim/clamp the title, no-op if empty or unchanged, rename the file on disk if it exists, retarget `tab.editor`, set `tab.title`, rewatch.

### `src/tab/manager.ts`
- `renameTab`: replace the `tab.newFileEditor && tab.editor` branch condition with `tab.editor` — any editor tab renames the file. Update the import to `renameEditorTab` from `./rename-editor.js`.
- `tab.newFileEditor` (`src/types.ts:185`) becomes fully dead once this is the only place that read it (its one other reference, `src/tab/openers.ts:40`, only ever sets it) — remove the field and that assignment.

### `src/tab/rename-new-file.test.ts` → rename to `src/tab/rename-editor.test.ts` (if such a dedicated test file exists — otherwise tests live in `manager.test.ts`, see below)

### `src/tab/manager.test.ts`
- Update the existing test `'renaming a normal editor tab still sets a display alias only, without touching any file'` (line ~302): change the expectation — renaming a normal (non-new-file) editor tab now renames the file on disk and retargets `tab.editor`, mirroring the saved-new-file-editor test.
- Keep `'renaming an agent tab still sets an alias only'` unchanged — agent tabs are unaffected.

## Out of scope
- Widening the rename input's `maxLength` to 50 characters (separate backlog item).
- Markdown/image tab rename semantics — issue text specifically says "editor tab".
