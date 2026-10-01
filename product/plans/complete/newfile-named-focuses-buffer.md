# Fix: `newfile <file>` opens with keyboard focus in the editor body, not the filename

**Complexity: 2/10** — one optional field on the editor view, set by the `newfile` command's open path, and a client rule that reads it before auto-starting the metadata row's rename session. No new command, opener, or wire message.

## Goal

When the `newfile <file>` command opens a new, unsaved editor tab, the user has already named the file, so the tab opens with keyboard focus in the editor buffer, ready to type content. The metadata row's filename does not start a rename session. The file navigator's **New file** button, `Cmd+N`/`Ctrl+N` chord, and context-menu entry still open their default-named `untitled.md` with the name pre-selected for renaming.

## Approach

Every editor opened on a path that does not exist yet carries `newFile: true` (set by `openInEditor` in `src/openers/editor.ts`). The client keys the auto-started rename session on that flag alone: `EditorMetaName` starts editing when `editor.newFile` is set, and `EditorTab` holds back its load-time buffer focus while that session is open. So `newfile notes.txt` and the navigator's New file button look the same to the client.

1. **Mark a named new file on the server.** `EditorView` (`src/tab/types.ts`) gains an optional `named?: boolean`: set when the command that opened the new file already named it. `OpenFileManager.newFile` (`src/open/file-manager.ts`), the `newfile` command's only open path, wraps the open context so the view it hands to `openEditorTab` carries `named: true`. `openInEditor` itself is unchanged, so `edit`, `open`, and the navigator paths keep their current views.
2. **Read it on the client through one rule.** A pure helper `opensRenameSession(editor)` in `web/src/editor/new-file-rename.ts` answers whether a view auto-starts the rename session: a new file that was not named when opened. `EditorMetaName` seeds and auto-starts its edit state from it, and `EditorTab` seeds its `renaming` gate from it, so a named new file never starts a session and the existing load effect focuses the buffer.

`newFile` keeps its other meanings for a named file (no de-dupe against open tabs, no load request, first-save auto-suffix), since those depend on the file not existing on disk, not on who chose its name.

## Implementation steps

1. Add `named?: boolean` with a comment to `EditorView` in `src/tab/types.ts`.
2. In `OpenFileManager.newFile`, pass `openInEditor` a context whose `openEditorTab` adds `named: true` to the view.
3. Add `web/src/editor/new-file-rename.ts` with `opensRenameSession`.
4. Use it in `web/src/editor/EditorMetaName.tsx` (initial state and the auto-start effect) and `web/src/editor/EditorTab.tsx` (initial `renaming` state); update their comments.
5. Run `./scripts/run.mjs check-diff` after each step and resolve failures.
6. Write the tests below and run `./scripts/run.mjs check-diff`.
7. Update `product/specs/editor-tab.md` ("New files") to say a new file named by `newfile <file>` opens with focus in the buffer and no rename session. `product/specs/file-navigator-tab.md` is unaffected.
8. Check `help.md` and `documentation/user-documentation/tab-types/opening-files.md`; update them only if they describe where focus lands when `newfile` opens.

## Tests

- `src/open/file-manager.test.ts`: `OpenFileManager.newFile` opens a view marked `named: true` and `newFile: true`.
- `src/open/file-manager.test.ts`: `OpenFileManager.edit` on a missing path opens a view without `named`.
- `web/src/editor/new-file-rename.test.ts`: the rule is true for an unnamed new file, false for a named new file, and false for an existing file.
- `web/src/editor/EditorMetaName.test.tsx`: a named new-file view renders its name as a static span, with no rename input.
- `web/src/editor/EditorTab.test.tsx`: a named new-file tab opens with the buffer textarea focused and no rename input in the metadata row.

## Out of scope

- `edit <missing file>`, which still opens its new file with the rename session, as before.
- The file navigator's New file button, chord, and context-menu entry, local or remote.
- Save, rename, and auto-suffix behavior for new files.
