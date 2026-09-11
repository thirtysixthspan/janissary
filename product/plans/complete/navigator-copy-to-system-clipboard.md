# File navigator copy also fills the system clipboard

**Complexity: 3/10** — one new shared module, one new pure helper, and a two-line behavior change in the file navigator. No server work, no protocol change, no new state.

## Goal

Copying a file or files in the file navigator — with `Cmd+C`/`Ctrl+C` or the row context menu's **Copy** — should make those paths pastable as *text* into an editor tab's buffer, through either the editor's `Cmd+V` or the default context menu's **Paste**.

Today the navigator's Copy writes only to the app-wide *file* clipboard (`web/src/file-navigator/file-navigator-clipboard.ts`), a module-level store holding a mode and a list of absolute paths. Nothing reaches the system clipboard, and the editor pastes only from the system clipboard — it takes the text off the hidden textarea's `paste` event. So the two never meet: a user copies two files in the tree, switches to an editor, presses `Cmd+V`, and gets whatever unrelated text the OS clipboard happened to be holding.

The fix is to make Copy write both places. The file clipboard keeps its existing meaning — it is what the navigator's own Paste, the row marks, and the undo stack read — and the system clipboard gains the text form of the same selection.

## Approach

**What text.** The navigator already has a settled answer for "what does a path look like when it lands in an editor": dropping rows onto an editor inserts them tree-relative, one per line, and a remote tree inserts `<host>:<absolute-remote-path>` instead. Copy produces exactly that string, so the same selection reads the same whether it arrives by drag or by clipboard. That form currently exists as an inline expression inside `useFileNavigatorDrag`'s `drop()`; it becomes a named helper beside `joinCommandPaths`, which is the command-bar/harness counterpart, and both callers use it.

**Where the write lives.** `copyText` — the feature-detected `navigator.clipboard.writeText` wrapper that swallows a withheld or denied clipboard — already exists in `web/src/context-menu/clipboard-commands.ts`. The file navigator is its second consumer, and a feature may not import another feature, so it is promoted to `web/src/shared/system-clipboard.ts` and moved, not copied. `pasteInto` stays behind: it is the default menu's own business and has no second caller.

**One entry point for Copy.** Both copy routes — the `Cmd+C` chord in `FileNavigatorTab.tsx` and the context menu's `copy` in `file-navigator-menu-actions.ts` — call one new pure function that performs both writes, so the two can never drift. Cut is deliberately left alone: a cut is a pending move, not text, and putting its paths on the system clipboard would invite a paste that silently does nothing about the pending move.

An empty selection stays a no-op on both clipboards, matching the spec's existing "`Ctrl+C` with nothing selected leaves the clipboard untouched".

## Implementation steps

1. Create `web/src/shared/system-clipboard.ts` holding `copyText` and its private `writeClipboardText`, moved verbatim from `web/src/context-menu/clipboard-commands.ts`. Remove both from `clipboard-commands.ts` and point `DefaultContextMenu.tsx` at the new module.
2. Move the `copyText` cases out of `web/src/context-menu/clipboard-commands.test.ts` into a new `web/src/shared/system-clipboard.test.ts`, unchanged.
3. Add `joinEditorPaths(absoluteRoot, sourcePaths, remoteHost?)` to `web/src/file-navigator/file-navigator-relative-path.ts`, returning tree-relative paths joined by newlines, or `<host>:<absolute-remote-path>` lines for a remote tree.
4. Replace the inline editor-drop expression in `useFileNavigatorDrag.ts`'s `drop()` with a call to `joinEditorPaths`.
5. Add `web/src/file-navigator/file-navigator-copy.ts` exporting `copySelectionToClipboards(absoluteRoot, relPaths, remoteHost?)`: returns immediately on an empty list, otherwise writes the absolute paths to the file clipboard with `setClipboard('copy', …)` and the `joinEditorPaths` text to the system clipboard with `copyText`.
6. Call it from `FileNavigatorTab.tsx`'s `copySelection` chord handler (over `selection.operationPaths`) and from `file-navigator-menu-actions.ts`'s `menuActions.copy` (over the right-clicked row alone), replacing their direct `setClipboard('copy', …)` calls. `cutSelection` keeps `clipboardPaths()` and `setClipboard('cut', …)` untouched.

## Tests

- `web/src/shared/system-clipboard.test.ts` — the relocated `copyText` cases: writes the text, ignores an empty string, does not throw when the clipboard API is absent.
- `web/src/file-navigator/file-navigator-relative-path.test.ts` — `joinEditorPaths`: one path, several paths newline-joined, a remote tree producing `<host>:<absolute-remote-path>` lines, and an empty list producing an empty string.
- `web/src/file-navigator/file-navigator-copy.test.ts` — `copySelectionToClipboards`: arms the file clipboard with the absolute paths in `copy` mode *and* writes the newline-joined tree-relative text to the system clipboard; the remote form for a remote tree; an empty selection touching neither clipboard; an existing armed clipboard left alone by that empty call.
- `web/src/file-navigator/FileNavigatorTab.test.tsx` — pressing `Cmd+C` over a selection writes that text to the system clipboard as well as marking the rows.

## Out of scope

- `Cmd+X` / Cut writing to the system clipboard.
- Reading the system clipboard in the navigator's own `Cmd+V`, which continues to paste files from the app-wide file clipboard.
- Making the system-clipboard text destination-aware (spaces for a command bar or harness, newlines for an editor). The destination is unknown at copy time; the editor form is chosen because the editor is what the issue names.
- `Escape` clearing the system clipboard when it disarms the file clipboard.
- The second issue in the backlog, remote harness copy.
