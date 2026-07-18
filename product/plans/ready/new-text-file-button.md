# New Text File in the File Navigator

**Complexity: 4/10** — spans web (button, scoped keybinding, path helper) and server (a new `newFile` flag on the editor view, save-time auto-suffix, a `renameTab` branch that renames on disk, open-file-ref remapping, and a de-dupe bypass); several call sites, but no new subsystem, protocol RPC, or concurrency.

The file navigator (file tree tab) gains a **New file** button in its header, plus a `Cmd+N` (`Ctrl+N`) keyboard binding while the navigator is focused. Triggering either opens a fresh, unsaved editor tab named `untitled.md`. On the first save the file is written into the directory the navigator's keyboard cursor points at — the selected directory row, the containing folder of a selected file row, or the tree root when no row is selected. The user names the file by editing the editor tab's label; the typed text becomes the filename literally. This turns the navigator into a place you can create files from, not just browse, reusing the editor tab's existing new-file support rather than building a new editing surface.

## Design decisions

1. **Launch by reusing the `edit` command.** The button and the keybinding dispatch the existing `edit <targetDir>/untitled.md` command (the same `command` RPC `FileTreeTab` already uses for `open`/`edit` at `web/src/FileTreeTab.tsx:63-64`). No new command or RPC is introduced for launching. The editor tab's existing "new file" behavior (opening a path that does not yet exist on disk — see `product/specs/editor-tab.md` "New files") supplies the unsaved buffer named after the path's basename.

2. **Target directory from the keyboard cursor.** The target directory is resolved from `FileTreeTab`'s `selected` row (`web/src/FileTreeTab.tsx:39`, the keyboard cursor):
   - Selected row is a directory (`row.dir === true`) → create the file **inside** that directory.
   - Selected row is a file → create the file in that file's **containing** directory (the selected path minus its last segment).
   - No row selected (`selected === null`) → create the file at the **tree root**.
   Because row paths are relative to the tree root and `edit` resolves relative targets against the tree tab's cwd (its root — see `product/specs/file-tree-tab.md` "Opening from a tab's metadata row" and `OpenFileManager.edit` at `src/open-file-manager.ts:47-52`), the dispatched command is `edit <relativeDir>/untitled.md`, or `edit untitled.md` for the root case. The `..` row is treated as "no directory selected" and falls back to the root.

3. **Default name is `untitled.md`.** The new tab opens named `untitled.md` (a Markdown file, matching the backlog's stated default), so it gets Markdown syntax highlighting immediately.

4. **Auto-suffix on save when `untitled.md` already exists.** If the user never renames the tab and saves while a file named `untitled.md` already exists in the target directory, the save silently writes to the next free name — `untitled-2.md`, `untitled-3.md`, and so on — and updates the tab's editor path/name/label and its open-file ref to match. Saving never overwrites an existing file for the untitled default, and never prompts. This suffixing only applies to a new-file editor that has not yet been saved; once a file exists on disk, ordinary save overwrites it as before.

5. **The tab label sets the filename literally.** Editing a new-file editor tab's label sets the filename to exactly the typed text — `notes` saves a file literally named `notes` (no extension added), `notes.txt` saves `notes.txt`. No extension is appended. This overrides, for a new-file editor tab, the normal alias-only meaning of `renameTab` (`src/tab/manager.ts:231` sets `tab.title` as a display alias). For a new-file editor:
   - Before the first save (file not yet on disk): renaming updates the editor tab's pending target basename in place; nothing is written until the user saves.
   - After the first save (file exists on disk): renaming **renames the file on disk** and retargets the editor to the new path. The tab stays coupled to its filename for the life of the tab.

6. **The coupling is gated on new-file editors only.** Only editor tabs that were opened as new files (the path did not exist on disk when the tab opened) get decisions 4 and 5. An editor tab opened from `edit existing.md` keeps its current behavior: `renameTab` sets a display alias and does not touch the file. A per-tab marker distinguishes the two.

7. **`Cmd+N` is captured inside `FileTreeTab`, not at the window level.** The binding fires only while the navigator has keyboard focus, so it never shadows the OS/browser or other tabs. It is captured the same way `FileTreeTab` already captures `Cmd+Z`/`Cmd+Shift+Z` (`web/src/FileTreeTab.tsx:98-103`) — an early branch in `onKeyDown` that `preventDefault`/`stopPropagation`s before the existing `if (e.ctrlKey || e.metaKey) return;` at `web/src/FileTreeTab.tsx:104` hands other chords to the window handler.

8. **Button appearance.** A file-with-plus FontAwesome icon in the navigator header's `.files-actions` group (`web/src/FileTreeTab.tsx:140-159`, alongside the dock-cycle and collapse-all buttons), with the tooltip **New file**.

9. **Multiple new-file tabs can coexist.** `openEditorTab` de-duplicates by editor path (`src/tab/openers.ts:32`, `t.editor?.path === view.path`), so a second `edit <dir>/untitled.md` would focus the first tab rather than open a new one. For a new-file open (a target path that does not exist on disk — `openInEditor` already computes `size: 'unknown'` for it, `src/openers/editor.ts:32`), **skip the de-dupe and always create a fresh tab**; the de-dupe stays in force for opens of files that already exist on disk (so `edit existing.md` still focuses its open tab). This lets several unsaved `untitled.md` tabs live at once, each auto-suffixing independently when saved (Decision 4).

## What already exists (reuse, don't rebuild)

| Need | Reuse | Location |
|---|---|---|
| Dispatch the new-file action | `edit` via the `command` RPC | `web/src/FileTreeTab.tsx:63-64` (`editFile`/`openFile`) |
| The keyboard cursor / selected row | `selected` state + `files.rows` (`dir`, relative `path`) | `web/src/FileTreeTab.tsx:39,162` |
| Capturing a Cmd chord scoped to the focused tree | `Cmd+Z`/`Cmd+Shift+Z` branch in `onKeyDown` | `web/src/FileTreeTab.tsx:98-103` |
| Header button styling and placement | `.files-actions` dock-cycle / collapse-all buttons | `web/src/FileTreeTab.tsx:140-159` |
| Header button icons | FontAwesome icon exports | `web/src/icons.ts` (`dockSwapIcon`, `expandedIcon`, …) |
| Opening an unsaved editor on a non-existent path | Editor "New files" support | `product/specs/editor-tab.md` "New files"; `OpenFileManager.edit` `src/open-file-manager.ts:47-52` |
| Writing an editor buffer to disk on save | `saveFile` | `src/editor/save.ts`; controller entry `src/controller.ts:106-108` |
| Renaming a tab | `renameTab` | `src/tab/manager.ts:231-239`; controller entry `src/controller.ts:165-167`; client `web/src/ws.ts:75` |
| Editing a tab label in the UI | `TabItem` rename input (double-click) | `web/src/TabItem.tsx:51` (`.tab-rename-input`); wired in `web/src/App.tsx:166` |
| Registering a writable file ref | `registerFile` → `fileRegistry.register`, `openFilePath` → `fileRegistry.get` | `src/open-file-manager.ts:61`; `src/tab/manager.ts:309-315` (used in `src/editor/save.ts:12`) |
| Editor-tab de-dupe by path | `openEditorTab` | `src/tab/openers.ts:29-43` |
| Editor view shape (`name`/`path`/`size`/`url`/`line`) | `EditorView` + `openInEditor` | `src/types.ts` (`EditorView`); `src/openers/editor.ts:24-34` |

## Proposed changes

**Web — `web/src/FileTreeTab.tsx`.**
- Add a **New file** button to the `.files-actions` group in the header, with a file-plus icon and the tooltip `New file`. On click it computes the target directory from `selected`/`files.rows` per Decision 2 and dispatches `edit <targetDir>/untitled.md` through the existing `command` send.
- Extract the target-directory computation (selected row → relative directory path) into a small pure helper module (e.g. `web/src/file-tree-new-file.ts`) with its own colocated test, mirroring how `file-tree-keys.ts` and `file-tree-row-class.ts` are split out. This keeps `FileTreeTab.tsx` under the 200-line `max-lines` limit and makes the path logic unit-testable.
- Add a `Cmd+N`/`Ctrl+N` branch at the top of `onKeyDown`, modeled on the existing `Cmd+Z` branch, that runs the same new-file action and `preventDefault`/`stopPropagation`s before the generic ctrl/meta early return.

**Server — new-file editor marker and its consequences.**
- Mark an editor tab as a *new file* when it is opened on a path that does not exist on disk. The natural place is where the editor view is constructed in `openInEditor` (`src/openers/editor.ts:24-34`), which already stats the file (`bytes === undefined` / `size: 'unknown'` marks a non-existent path). Add a boolean like `newFile` to `EditorView` (`src/types.ts`) and the protocol tab view, set from that same existence check, and clear it once the file has been saved to disk (in `src/editor/save.ts`).
- In `openEditorTab` (`src/tab/openers.ts:29-43`), bypass the path de-dupe for a `newFile` view so multiple unsaved `untitled.md` tabs can coexist (Decision 9); leave the de-dupe intact for existing-on-disk paths.
- **Auto-suffix on save** (`src/editor/save.ts`): when saving a tab whose editor is still `newFile` and the resolved path already exists on disk, resolve the next free `untitled-N.md`-style name in the same directory before writing, then update the tab's editor `path`/`name`/`url`/open-file ref and the display label to the chosen name. Factor the "next free name in a directory" logic into a small helper module with a colocated test rather than inlining it, to stay within the file-size limit. Emit the usual `state`/`dirty` refresh so the client picks up the new label and size.
- **Label-sets-filename** (`src/tab/manager.ts` `renameTab` / `src/controller.ts`): when the renamed tab's editor is a new-file editor, branch away from the alias-only path. If the file is not yet on disk, update the pending target basename (editor `path`/`name`/`url`/ref) in the tab's directory. If the file already exists on disk, rename it on disk (and retarget the editor and its allow-list ref and watcher). For all other tabs, keep the existing alias behavior untouched. Consider extracting the new-file rename branch into a helper to keep `renameTab` small and within the file-size limit.
- Keep the open-file ref consistent whenever the path changes (auto-suffix or rename): call `registerFile` (`src/tab/manager.ts:309`) for the new path to obtain a fresh `url` and update `tab.editor.url`/`path`/`name`, so `saveFile`'s `tab.editor?.url` lookup (`src/editor/save.ts:17`) and `openFilePath` keep resolving.

**Protocol.** No new RPC is required: launching reuses `command`, saving reuses `saveFile`, and naming reuses `renameTab`. The only protocol-visible change is the added `newFile` flag on the editor tab view in `src/protocol.ts`/`src/types.ts` so the client and server agree on which editor tabs are new-file editors (and so the client can, if needed, treat the label as filename-editing).

## Tests

- **`web/src/file-tree-new-file.test.ts`** (new): the target-directory helper — selected directory row → that directory; selected file row → its containing directory; `..` row and no selection → root; nested relative paths.
- **`web/src/FileTreeTab.test.tsx`** (extend): clicking the New file button dispatches `edit <dir>/untitled.md` for each selection case; `Cmd+N` while focused dispatches the same and does not fall through to the window handler; the button renders with the `New file` tooltip.
- **Server save test** (extend `src/editor/save.test.ts` or a colocated test for the new next-free-name helper): saving a new-file editor when `untitled.md` exists writes `untitled-2.md` and updates the tab's path/label/ref; saving when no clash writes `untitled.md`; a non-new-file editor still overwrites as before.
- **Server rename test** (extend `src/tab/manager.test.ts`): renaming a not-yet-saved new-file editor updates its pending basename literally (no extension appended); renaming a saved new-file editor renames the file on disk and retargets the editor; renaming a normal editor/agent tab still sets an alias only.

## Out of scope

- The button lives only in the file navigator's own header, not in agent/harness tab metadata rows (those already carry a folder button that opens the navigator — see `product/specs/tabs.md` "Metadata row"). No new-file affordance is added there.
- No file-type chooser or template picker — the default is always `untitled.md`.
- No overwrite prompt or conflict dialog on save for the untitled default (auto-suffix replaces that need); the existing external-change overwrite dialog for already-on-disk files is unaffected.
- No creation of directories — the file is created in an existing directory only.

## Open questions

None.

## Verification

- Run `./scripts/run.mjs check-diff` after each change (lints changed files, typechecks affected projects, runs server + web tests for the touched areas).
- Manual end-to-end check:
  1. Open a file navigator (`files` or the folder button on an agent tab).
  2. With no row selected, click **New file** — an editor tab named `untitled.md` opens, unsaved. Type some text and save (`Cmd+S`); confirm the file appears at the tree root.
  3. Select a subdirectory row, press `Cmd+N`, type text, save — confirm the file is created inside that subdirectory.
  4. Select a file row inside a subdirectory, create a new file, save — confirm it lands in that file's containing directory.
  5. Create a new file, edit the tab label to `notes` (no extension), save — confirm a file named exactly `notes` is created; edit the label again to `notes-final` and confirm the on-disk file is renamed.
  6. Create two new files in the same directory without renaming either, save both — confirm the second is written as `untitled-2.md`.
