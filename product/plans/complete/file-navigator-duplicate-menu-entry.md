# Duplicate a file or directory from the file navigator's context menu

**Complexity: 2/10** — client-only. The server already does every part of the work; what is missing is a menu entry that asks it for the one paste the navigator cannot express today.

Right-clicking a row in the file navigator offers Open/Edit/Open with, Copy/Paste, Rename/Delete, and New file/New folder. There is no way to say "give me a second copy of this, right here" with the mouse. Doing it by hand today means `Cmd+C`, then `Cmd+V` with the cursor parked on the right row — two chords and a selection move to express one intention that Finder and Explorer both offer as a single menu entry.

The behavior itself already exists and is already specified. `pasteBatch` treats a copy whose destination is the source's own directory as a deliberate in-place duplicate: it resolves the name through `nextFreeName` up front, so `report.md` becomes `report-2.md`, never prompts, and never overwrites. Directories go through `copyItem`, which is recursive. The paste lands on the tab's undo stack like any other. So a Duplicate entry is not new machinery — it is one new call site that pins the clipboard's sources to the clicked row and the destination to that row's own parent directory.

## Approach

**Duplicate is a paste, not a new RPC.** `pasteFileNavigatorItems` with `mode: 'copy'`, `sources: [<clicked row, made absolute>]`, and `destinationPath: <the row's parent directory>` is exactly the operation. Adding a server method for it would be a second definition of one behavior (architecture principle 5) and would duplicate the auto-rename, undo-recording, and failure-reporting `pasteBatch` already owns.

**The clipboard is not involved.** Duplicate must not overwrite whatever the user has copied or cut, and must not require anything to be on the clipboard first. So it calls `sendPaste` directly with its own sources rather than going through `paste()`, which reads the app-wide snapshot. This is why it belongs in `useFileNavigatorPaste` — that hook already owns `sendPaste`, the conflict state, and the retry flow — rather than in a new hook that would re-derive them.

**It acts on the clicked row alone.** Every entry in this menu acts on the right-clicked row except Delete, which is called out in the spec as the exception because destructive multi-row actions are the convention worth matching. Copy, the entry Duplicate sits beside, is single-row too. Following the file's own stated rule keeps `fileNavigatorMenuItems`' contract intact: one row in, one action out.

**Placement: last in the Copy/Paste group, absent on `..`.** Duplicate is a clipboard-adjacent copy operation, so it belongs in that group rather than opening a fifth one; putting it after Paste keeps the Copy/Paste pair adjacent, where users expect to find it. The `..` row stands for a directory outside the tree — the same reason Rename and Open are withheld there withholds Duplicate.

**No keyboard chord.** The issue asks for a menu entry, and every chord in this tab is spent carefully; `Cmd+C`/`Cmd+V` already expresses this for a keyboard user.

## Implementation steps

1. `web/src/file-navigator/useFileNavigatorPaste.ts` — add a `duplicate(row)` that calls the existing `sendPaste` with the row made absolute against `absoluteRoot` as its single source, `dirname(row.path)` as the destination, and `'copy'` as the mode. Export it alongside `paste`. `dirname` comes from `../rel-path`, which the hook already imports `basename` from, and returns `''` for a top-level row — the tree root, which is what `sendPaste` already sends for a rootless paste.
2. `web/src/file-navigator/file-navigator-menu-items.ts` — add `duplicate: (row: FileNavigatorRow) => void` to `FileNavigatorMenuActions`, and a `duplicateEntry` withheld on the `..` row in the same shape `renameEntry` uses. Append it to the Copy/Paste group.
3. `web/src/file-navigator/FileNavigatorTab.tsx` — wire `duplicate: (row) => paste.duplicate(row)` into `menuActions`.
4. Update the spec and the user documentation (steps 5 and 6 of the task).

## Tests

- `web/src/file-navigator/file-navigator-menu-items.test.ts`
  - The ordinary file row now lists `['Copy', 'Paste', 'Duplicate']` as its second group — extend the existing four-group expectation and the contributed-entry expectation rather than adding a parallel case.
  - With an empty clipboard the group is `['Copy', 'Duplicate']`, so Duplicate does not depend on the clipboard.
  - The `..` row omits Duplicate along with Open, Edit, Open with, and Rename.
  - The routing test asserts `duplicate` was called with the clicked row.
- `web/src/file-navigator/useFileNavigatorPaste.test.ts`
  - `duplicate` on a nested row sends `pasteFileNavigatorItems` with the row absolute against the root, `destinationPath` its parent directory, `mode: 'copy'`, and no policy.
  - `duplicate` on a top-level row sends `destinationPath: ''`.
  - `duplicate` sends its own source with an empty clipboard, and leaves a populated clipboard untouched.
- `web/src/file-navigator/FileNavigatorTab.test.tsx`
  - Right-clicking a nested row and choosing Duplicate sends the RPC with the params above, end to end through the rendered menu.

## Out of scope

- **A keyboard chord for Duplicate** — see the Approach note.
- **Duplicating a whole multi-row selection.** The menu's one selection-wide entry is Delete, by an explicit convention this change does not reopen.
- **Any server change.** `pasteBatch`'s in-place-copy naming, recursion, undo recording, and failure reporting are already what this needs.
- **Renaming the duplicate in place after it lands**, the way New folder does. That flow guesses a path and waits for the watcher to produce it; the duplicate's name depends on what already exists on disk, so the guess would usually be wrong.

## Verification

Automated: `./scripts/run.mjs check-diff`.

Manual: right-click a file with siblings and choose Duplicate — `report.md` yields `report-2.md`, and a second Duplicate yields `report-3.md`. Right-click a directory and confirm its contents come with it. Confirm `Cmd+Z` removes the duplicate, and that a copy left on the clipboard beforehand still pastes afterward.
