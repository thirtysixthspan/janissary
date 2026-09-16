# New file opens with editable untitled.md name in the metadata row

Issue: when creating a new file from the file navigator, the editor tab should open with a default
file name of untitled.md, shown in the tab label and in the metadata row. The name in the tab
metadata label should be highlighted, have keyboard focus, and allow the file name to be changed,
just as it is changed in the tab label. Enter accepts the new name, returns focus to the top of the
editor buffer. Escape keeps the default name and returns focus to the top of the buffer.

Complexity: 5/10

## Goal

A new file created from the file navigator already opens an editor tab named `untitled.md`
(server picks the name; `editor.name` shows in the tab label and the metadata row today), but the
user has to double-click the tab label to rename it. This plan auto-starts that rename session in
the metadata row — name pre-selected with keyboard focus, edited the same way the tab label is
edited, with Enter/Escape both returning focus to the top of the buffer — and makes the metadata
row's name double-click-editable like the conversations plugin's title row.

## Approach

The tab label rename RPC (`renameTab`) is keyed by tab array index, which an editor tab's persistent
body does not know. Instead add a url-keyed server path that reuses the existing editor-tab rename
logic, following the same dispatch shape as `saveFile`:

- Server: `src/editor/rename.ts` exports `renameEditorFile(managers, url, name)` — resolves the tab
  via `managers.tab.editorTabByUrl(url)`, delegates to `renameEditorTab` (`src/tab/rename-editor.ts`)
  with `TAB_RENAME_MAX_LENGTH`, `managers.tab.replaceFile`, `managers.editorWatch.watch`, then
  persists `managers.tab.buildAgentState(tab)` and emits `state:dirty`. No-op for a missing tab.
- Protocol: `{ method: 'renameEditorFile'; params: { url: string; name: string } }` in
  `src/protocol/editor.ts`; decoder entry in `src/client-params/editor.ts`; `'ack'` entry in
  `src/client-message.ts`; dispatch arm + interface + adapter wiring in `src/message-handler.ts`,
  `src/controller/editor-adapter.ts` (mirrors `saveFile` fanout).
- Web client: `JanusClient.renameEditorFile(url, name)` fire-and-forget in `web/src/ws.ts`.
- UI: new `web/src/editor/EditorMetaName.tsx` — the metadata row's name span, with the inline-edit
  pattern of `ConversationTitle.tsx` (`InlineEditInput`, `cancelledRef` blur guard, trim-on-commit,
  cap `TAB_RENAME_MAX_LENGTH`, auto-suffix happens server-side on first save). Double-click starts
  an edit; when the tab is a `newFile` editor, the edit auto-starts once on mount with the draft
  pre-filled from `editor.name` (autoFocus + select does the highlight). Rename commits via
  `onRename`; Escape and Enter both let `EditorTab` move focus to the textarea (caret at the
  buffer top for a fresh buffer). Per-session `done` ref stops the auto-edit from restarting on
  later `state` broadcasts while the tab is still `newFile`.
- `EditorMetaRow` renders `<EditorMetaName>` in place of the static name span; `EditorTab` wires
  the rename callback: `client.renameEditorFile(editor.url, nextName)` and
  `textareaRef.current?.focus()` (top of buffer; empty buffer starts the caret at 0,0).

## Tests

- `src/editor/rename.test.ts` (mirrors `save.test.ts` setup + `tab/manager.test.ts` rename coverage):
  retargets path/name/url in `tab.editor` for a new-file tab without touching disk; renames an
  existing file on disk; no-op for an unknown url; caps the name to `TAB_RENAME_MAX_LENGTH`.
- `src/message-handler.test.ts`: dispatch arm routes `renameEditorFile` to the controller.
- `web/src/editor/EditorMetaName.test.tsx`: renders the name span; double-click opens the edit
  input; auto-edit only on a newFile view; Enter commits `onRename`; Escape cancels without
  renaming; trimmed/unchanged commit does not rename.
- `web/src/editor/EditorTab.test.tsx`: new-file tab shows the focused rename input; Enter sends
  `renameEditorFile(url, name)` and returns focus to the textarea; Escape returns focus without an
  RPC.

## Out of scope

- Files created outside the navigator or the tab-label double-click rename (unchanged).
- First-save auto-suffix behavior (already implemented server-side).
- Other issues in the backlog (metadata-bar `$workspace` symbol, commit-to-origin, commit tooltip).

## Spec updates

`product/specs/editor-tab.md` ("New files" section): describe the auto-started, pre-highlighted
rename in the metadata row and the Enter/Escape focus behavior. `product/specs/file-navigator-tab.md`
("Creating a new file"): name the default highlighted `untitled.md` rename session in the metadata
row after creation. Update `help.md` only if it documents the current rename behavior.
