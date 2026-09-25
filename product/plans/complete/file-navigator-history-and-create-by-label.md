# Address file-navigator undo, redo and create by label

Backlog: technical debt — "Finish moving the file navigator's filesystem-changing requests from tab position to tab label, covering undo, redo, the overwrite retry and create file or folder."

Complexity rating: 4/10

## Goal

The earlier migration made delete, move, paste and rename name their navigator by label, so a tab closing ahead of the navigator cannot redirect them onto another tree. Undo, redo (including the overwrite and skip-conflicts retries) and the two create requests were left addressing it by tab index, which the server resolves through `managers.tab.tabs[index]`. If a tab ahead of the navigator closes on its own between the client's snapshot and the request, undo replays another tree's history — for a copy-paste, deleting that tree's pasted files.

## Approach

Follow the pattern the earlier migration used, for `undoFileNavigatorItem`, `redoFileNavigatorItem`, `fileNavigatorCreateFile` and `fileNavigatorCreateDirectory`:

- Wire params change from `index: number` to `label: string` in `src/protocol/file-navigator.ts`, with the protocol comment extended to name them.
- Decoders in `src/client-params/file-navigator.ts` check `isString(p.label)`.
- The dispatcher in `src/message/file-navigator.ts` and the adapter in `src/controller/file-navigator-adapter.ts` pass the label.
- `src/controller/file-navigator.ts` guards with the existing `isOpenTab`, returning the same empty result on a miss. The loose local `HistoryReplayResult` type is deleted and the replay is typed as `MaybePromise<UndoRedoResult>`.
- On the client, `useFileNavigatorMoveOperations` sends the `label` it already receives for `history` and `retry`, and drops its `index` parameter (and its "undo/redo still address it by `index`" comment). `useFileNavigatorDrag`, whose only use of `index` was passing it to that hook, drops the parameter too. `createFileNavigatorActions` takes the navigator's `label` and sends it for both create requests.

## Implementation steps

1. Server: protocol, decoders, dispatcher, adapter, controller functions.
2. Client: move-operations hook, drag hook signature, `FileNavigatorTab` call sites, menu actions.
3. Move the request fixtures in the existing tests from index to label.

## Tests

- `src/controller/file-navigator.test.ts`: undo, redo, create file and create folder for a label no open tab carries mutate nothing and report nothing; after a tab ahead of the navigator closes, undo and both creates still reach the named navigator.
- `web/src/file-navigator/useFileNavigatorMoveOperations.test.ts`: undo sends the label; a history batch conflict retried with skip-conflicts sends the label.
- Existing fixtures in `src/client-params/file-navigator.test.ts`, `src/client-params/index.test.ts`, `src/message/handler.test.ts`, `src/controller.test.ts`, `web/src/file-navigator/FileNavigatorTab.test.tsx`, `web/src/file-navigator/FileNavigatorOverlays.test.tsx` and `web/src/file-navigator/useFileNavigatorDrag.test.ts` move to labels; decoder tables also reject the old index-only shape.

## Out of scope

- Read-only requests still addressed by index (toggle, collapse, search, reveal, openers, open, selection actions), which can at worst show the wrong tree rather than change files.

## Specs and docs

- `product/specs/file-navigator-tab.md`: the addressing paragraph names every filesystem-changing request, including undo, redo, the conflict retry and create file or folder.
- `help.md` and `documentation/user-documentation/`: do not describe request addressing; no edit.
