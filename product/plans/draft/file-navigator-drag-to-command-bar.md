# File navigator drag-to-command-bar

Dragging a row in the file tree tab and releasing it over the command bar inserts that file or directory's path — relative to the target tab's current working directory — into the command bar at the caret, without moving the file on disk. This gives a fast way to reference a file from the tree while composing a command (`open `, `edit `, etc.) instead of typing or tab-completing the path by hand. It reuses the tree's existing click-drag-release gesture (the same one that already moves files between directories) and adds a second possible drop target — the command bar — alongside the existing directory-row drop target.

## Design decisions

1. **The inserted path is relative to the target tab's cwd**, not the file tree's own root. The target tab is whichever tab's command bar receives the drop — its own commands (`open <path>`, `edit <path>`) already resolve relative arguments against that tab's cwd, so the dropped path must match.

2. **The path lands at the current caret position**, replacing any active selection — the same behavior a normal paste would have. It does not append to the end of the command bar's text and does not replace the box's entire contents.

3. **Both file and directory rows can be dropped onto the command bar.** This mirrors the tree's existing move-drag, which already lets either kind of row be picked up.

4. **The command bar is not a valid drop target when the active tab is a harness tab.** A harness tab has no normal command-line textarea, only a live PTY. Rather than typing the path directly into a running terminal session (as `populateCommandLine`'s existing PTY fallback does for picker selections), a drag released over a harness tab's area does nothing — no highlight, no insertion.

5. **The inserted path is never quoted, regardless of whether it contains spaces.** `open`/`edit` (`src/commands/open.ts:9-26`, `src/commands/edit.ts:9`) take everything after the keyword as a single verbatim target string — they do not split on spaces and do not strip surrounding quotes. Wrapping the path in quotes would insert literal quote characters that these commands would treat as part of the filename, breaking a direct drop-then-`open` flow. A path with a space already works correctly today when typed unquoted after `open`/`edit`, so the drop simply inserts the raw path text.

6. **Resolving the path relative to the target tab's cwd happens entirely client-side, with no new RPC.** The file tree's wire payload (`FileTreeView`) currently sends only a display-abbreviated root (`root`, already shortened via `abbreviatePath` before being sent — `src/tab/view.ts:47`); it does not currently carry the tree's real absolute root path, which is needed to combine with a row's tree-relative `path` and then compute that combination's path relative to the target tab's (unabbreviated) `cwd`. Rather than adding a request/response RPC that resolves the relative path on the server (and introduces a round-trip delay before the path appears), `FileTreeView` gains a second field carrying the real absolute root, and a small new pure client-side utility computes the relative path locally. This keeps the drop-to-insert interaction synchronous, matching how releasing a drag over a directory row already applies instantly (fire-and-forget) rather than waiting on a server round trip.

## What already exists (reuse, don't rebuild)

| Need | Existing precedent | Location |
| --- | --- | --- |
| Click-drag-release gesture (threshold, ghost label, global mousemove/mouseup, Escape/blur cancel) | `useFileTreeDrag` | `web/src/useFileTreeDrag.ts` |
| Pure drop-target resolution logic (given rows + dragged path + hovered path) | `resolveDropTarget` | `web/src/file-tree-drag.ts` |
| Hit-testing an arbitrary DOM element under the pointer during a drag | `hoveredRowPath` (via `document.elementFromPoint`) | `web/src/useFileTreeDrag.ts:32-36` |
| A docked file tree (in a sidebar) and an active tab's command bar are DOM siblings, not nested — confirms a pointer-based hit test works across that boundary | `AppShell` (`Sidebar` / `app-center` as siblings) | `web/src/AppShell.tsx` |
| Populating the command bar without submitting, plus the harness-tab PTY-input fallback | `populateCommandLine` | `web/src/populate-command-line.ts` |
| Splicing text into the command bar at the current caret/selection, dispatching a real `input` event | `insertNewline` | `web/src/CommandInput.tsx:79-88` |
| A ref-exposed imperative function the parent can call into the command bar (the `recallRef` pattern) | `recall` / `recallRef` | `web/src/CommandInput.tsx:44-48` |
| Server-side absolute-vs-abbreviated path handling to model the new wire field on | `shorten` / `abbreviatePath`, `tab.files.root` (absolute before shortening) vs. `tab.cwd` (sent raw) | `src/tab/manager.ts:350-352`, `src/tab/view.ts:10,25,47` |
| Existing drag/drop interaction spec to extend | "Moving files by drag-and-drop" section | `product/specs/file-tree-tab.md` |

## Proposed changes

### Wire payload

`FileTreeView` (`src/types.ts:115`) gains a second root field carrying the tree's real, unabbreviated absolute root path, alongside the existing display-abbreviated `root`. `buildTabView`'s file-tree mapping (`src/tab/view.ts:47`) is updated to populate both fields from the same server-side `tab.files.root` value it already holds before shortening.

### Client-side relative-path computation

A new small pure utility (sibling to `file-tree-drag.ts`) computes a path relative to a base directory, given two absolute, `/`-separated paths — a minimal POSIX-style equivalent of Node's `path.relative`, since the browser bundle does not currently depend on Node's `path` module anywhere in `web/src`. It is used to combine a dragged row's tree-relative `path` with the tree's new absolute-root field into an absolute path, then relativize that against the target tab's `cwd` (already sent raw/absolute on `TabView`).

### Drop-target detection

The existing drag gesture (`useFileTreeDrag`) is extended to also hit-test, at move and release time, for a stable marker on the command bar's outer container (a new `data-` attribute added to `CommandInput`'s root element), the same way `hoveredRowPath` already hit-tests for a file-tree row via `data-path`. Three drop outcomes become possible on release: over a tree row (existing move behavior, unchanged), over the command bar marker (new: insert-path behavior), or neither (existing no-op/cancel).

### Insert-at-caret

`CommandInput` gains a second ref-exposed imperative function, following the same pattern `recallRef`/`recall` already establishes, that splices given text into the textarea at the current caret position (or over the current selection) rather than replacing the whole value — reusing `insertNewline`'s existing selection-splice/`input`-event-dispatch approach (`CommandInput.tsx:79-88`) as the model, generalized to arbitrary inserted text instead of a fixed `\n`.

### Wiring the drop to the insert

When a drag releases over the command bar marker, the file tree tab component computes the relative path (as above) and calls the new insert-at-caret function via its ref — reaching across from wherever the file tree tab is mounted (center tab strip or a docked sidebar) to whichever tab is currently active, since the command bar always renders for the active tab (`App.tsx`). This needs the target tab's `cwd` and the insert-at-caret ref threaded down to wherever `useFileTreeDrag` is invoked, alongside the existing `client`/`index` it already receives. A drop is only treated as valid when the active tab actually has a normal command bar rendered — a harness tab (Decision 4), a view tab with no command bar, or the transcript search bar replacing the command bar (`CommandArea.tsx`) are all simply not valid drop targets, the same way dropping over empty space in the tree today produces no highlight and no effect.

### Visual feedback

While a drag is over the command bar, it is highlighted the same way a valid directory-row target is today (`FileTreeTab.tsx`'s `drop-target` class) — a CSS class applied to the command bar container while it is the current hover target, removed otherwise. The existing drag-ghost label that follows the cursor (`FileTreeTab.tsx`'s `.files-drag-ghost`) needs no change — it already renders at a fixed screen position and will keep following the cursor as it moves over the command bar.

## Tests

- **`web/src/file-tree-drag.test.ts`** (or a new sibling module's own test file for the relative-path utility) — cases for the new relative-path computation: same directory, target nested under root, root nested under target, sibling directories requiring `..` segments, and the no-op case where root and target are identical.
- **`web/src/useFileTreeDrag.test.ts`** — extend with cases covering: a drag released over the command bar marker calls the insert callback with the expected relative path (not the move RPC); a drag released over a tree row still behaves exactly as before (regression coverage); a drag released over neither is a no-op; a drag over the command bar while the active tab is a harness tab is not treated as a valid target.
- **`web/src/CommandInput.test.tsx`** — cases for the new insert-at-caret function: inserting into an empty box, inserting at a mid-string caret position, inserting over an active selection (replacing it), and confirming existing `recall` (replace-all) behavior is unchanged.
- **`web/src/FileTreeTab.test.tsx`** — a case confirming the command-bar drop-target CSS class/highlight state is reachable from a drag in progress (mirroring the existing directory-row highlight test, if one exists there).
- **`src/tab/view.test.ts`** (or wherever `buildTabView` is currently tested) — confirm `FileTreeView`'s new absolute-root field carries the pre-shortened value while the existing `root` field remains shortened, unchanged from today.

## Out of scope

- Multi-row drag — the tree has no multi-select today, and this feature does not add one.
- Dropping onto anything other than the command bar of the active tab — e.g. there is no way to target a different, inactive tab's command bar directly.
- Any change to how `open`/`edit`/other commands parse their arguments (quoting, tokenizing) — this feature only affects what text gets inserted, never how the app's commands interpret it.
- Undo/redo for the inserted text — the command bar's existing native text-editing undo (browser-level, via `execCommand`/normal `input` events) is what applies, the same as typing or pasting; no new undo stack is added.
- Dropping a file tree row onto anything other than a directory row or the command bar (e.g. onto the transcript, onto another tab in the tab strip) — remains a no-op, unchanged from today.

## Open questions

None.

## Verification

- `./scripts/run.mjs check-diff`
- Manual: open a file tree tab (`files`), open or focus an agent tab whose cwd differs from the tree's root, type `open ` into its command bar, then drag a file row from the tree and release it over the command bar — confirm the correct path (relative to the *tab's* cwd, not the tree's root) is inserted at the caret, that the file is not moved on disk, and that submitting the resulting command opens the right file. Repeat with the tree docked into a sidebar while a different tab is active in the center. Also confirm dropping over a harness tab's area does nothing, and that dropping onto a directory row still moves the file as before.
