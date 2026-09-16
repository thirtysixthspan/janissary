# Commit-to-origin icon in the editor metadata row

Issue: add commit to origin icon to the editor tab metadata bar that will save the current file
locally and commit the current file to origin on the current branch.

Complexity: 5/10

## Goal

The editor tab's metadata row gains a commit-of-origin icon (next to the sync icon / save button).
Clicking it saves the current buffer to disk first, then commits just that one file and pushes to
origin on the current branch — the exact cycle `commitRoot` (`src/git/commit.ts`) runs for the file
navigator, without its prompt: the commit message is the navigator's generated single-file default
(`sync: <filename>`, in use since the file-navigator row menu), reported through the notifications
feed the same way.

## Approach

- `EditorView` gains `commit?: FileNavigatorCommitStatus` (the same three states the navigator's
  button carries; the type already lives beside it in `src/tab/types.ts`).
- Server: `src/editor/commit.ts` exports `commitEditorFile(managers, url, message)`:
  resolves the tab via `editorTabByUrl`; ignored when already `committing`; for remote files
  (remote-file-cache's `remoteFileFor`) posts a "cannot commit remote files" notification instead;
  else arms `commit: 'committing'` (+ `state:dirty`), then fire-and-forget runs `commitRoot(dirname,
  message, [path])`, reporting like the navigator (`Nothing to commit` → back to rest, success →
  `Committed to origin: <summary>` + `'committed'`, failure → `Could not commit: <git error>` +
  `'error'`), and clears the status back to rest after a 3s hold (a later run re-arms).
- Protocol: RPC `commitEditorFile { url, message }` in `src/protocol/editor.ts`, decoder,
  `'ack'` contract, dispatcher case, `EditorControllerAdapter.commitEditorFile`.
- Web: `JanusClient.commitEditorFile(url, message)`; new `web/src/editor/EditorCommitButton.tsx`
  with the spin/green/red vocabulary of `FileNavigatorCommitButton`; rendered in `EditorMetaRow`'s
  actions group; `EditorTab` wires the click to save-then-commit and passes the status through.
- CSS: `.editor-commit-button` mirrors the `.files-commit` rules already in `theme.css`.

## Tests

- `src/editor/commit.test.ts`: status transitions and notification text via a `vi.mock`ed
  `../git/commit.js` and a stubbed notify; unknown url no-op; re-entrant call during `committing`
  ignored; remote file reports a notification and never stages.
- `src/message-handler.test.ts`: dispatch arm.
- `web/src/editor/EditorCommitButton.test.tsx`: tooltip/state classes, click callback.
- `web/src/editor/EditorTab.test.tsx`: clicking saves first, then sends `commitEditorFile` with the
  generated `sync: <name>` message.

## Out of scope

- A commit-message prompt on the editor icon (the navigator flow keeps its field).
- Remote-tree commits from the editor (rejected with a notification).

## Spec / docs

`product/specs/editor-tab.md`: new subsection under the metadata-row area describing the icon and
the save-then-commit behavior. `documentation/user-documentation/tab-types/editor.md`: mention the
button if it documents save/commit actions.
