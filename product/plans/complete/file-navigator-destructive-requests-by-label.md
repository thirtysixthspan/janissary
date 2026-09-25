# Address the file navigator's destructive requests by label

**Complexity: 6/10** — no new architecture and no new behavior on the happy path, but the change runs across the whole request path on both sides: the wire params, the decoders, the dispatcher, the controller adapter and wrappers, four client hooks, the drag hook, a new `label` prop on the navigator component and both places that render it, plus a wide set of tests that assert the exact params sent. Every edit is mechanical. The risk is a missed call site, and the typechecker catches most of those.

The protocol names a tab by label for focus, plugin intents, editor requests, and opening a navigator, but by position in the tab list for every file-navigator request. The server resolves that position against its current list when the request arrives, and it removes tabs on its own (a harness PTY exit closes its tab). If a tab ahead of a navigator closes or moves between the client's last snapshot and the request, a delete, move, paste, or rename computed against one navigator's tree runs against whichever navigator now holds that position. That can delete or move the wrong files under a different root.

## Goal

The six destructive methods (`deleteFileNavigatorItem`, `deleteFileNavigatorItems`, `moveFileNavigatorItem`, `moveFileNavigatorItems`, `pasteFileNavigatorItems`, and `renameFileNavigatorItem`) carry the navigator's `label` instead of `index`. A label that no longer names an open tab mutates nothing and reports nothing, just as an out-of-range index does today. The non-destructive methods, undo/redo, and `closeTab` stay on `index`.

## Approach

1. **Wire (`src/protocol/file-navigator.ts`)**: the six methods' params change from `index: number` to `label: string`.
2. **Decoders (`src/client-params/file-navigator.ts`)**: the six decoders check `isString(p.label)` in place of `isInteger(p.index)`.
3. **Dispatch (`src/message/file-navigator.ts`)** and **adapter (`src/controller/file-navigator-adapter.ts`)**: pass `message.params.label` through, with the adapter's six signatures taking `label: string`.
4. **Controller wrappers (`src/controller/file-navigator.ts`)**: the six functions take `label` and replace `managers.tab.tabs[index]?.label` with a guard, `isOpenTab(managers, label)`, that is true only when an open tab carries that label. On a miss they return exactly what the index miss returned (`{ total: 0, failedPaths: [] }` or `undefined`), so a stale request is silent rather than reported as a failed operation against a closed navigator. The `FileNavigatorManager` methods already take a label and do not change.
5. **Client**:
   - `FileNavigatorTabProperties` gains `label: string`, passed as `tab.label` from `web/src/ViewTabBody.tsx` and `current.tab.label` from `web/src/Sidebar.tsx`.
   - `useFileNavigatorDelete(client, label)`, `useFileNavigatorRename(rows, client, label, …)`, and `useFileNavigatorPaste(client, label, …)` switch their `index` parameter to `label`.
   - `useFileNavigatorMoveOperations(client, index, label)` sends `label` for the two move methods and keeps `index` for undo/redo. `useFileNavigatorDrag(rows, client, index, label, options)` passes both through.

## Implementation steps

1. Server: protocol, decoders, dispatcher, adapter, and controller wrappers. Update `src/controller/file-navigator.test.ts`, `src/message/file-navigator.test.ts`, `src/message/handler.test.ts`, `src/client-params/file-navigator.test.ts`, `src/client-params/index.test.ts`, and `src/controller.test.ts` to the new params. Run `check-diff`.
2. Client: the prop, the two render sites, and the five hooks. Update `FileNavigatorTab.test.tsx`, `useFileNavigatorDrag.test.ts`, `useFileNavigatorMoveOperations.test.ts`, `useFileNavigatorPaste.test.ts`, and `ViewTabBody.test.tsx` and any `Sidebar` test that renders a navigator. Run `check-diff`.
3. Run the full client suite once (`npx vitest run --project client`), since the navigator's tests are spread across files `check-diff` may not select.

## Tests

- `src/controller/file-navigator.test.ts`: the existing delegation and "no label" cases move onto labels. A new case asserts that each of the six destructive requests, given a label no open tab carries, calls no `FileNavigatorManager` method and posts no notification. Another asserts that a request carrying a navigator's label reaches that navigator even after a tab ahead of it has been removed from the list.
- `src/client-params/file-navigator.test.ts`: the six decoders accept a `label` and refuse an `index`-only payload.
- `src/message/file-navigator.test.ts` and `src/message/handler.test.ts`: dispatch forwards the label.
- Client hook and component tests assert the label in the params they already check.

## Spec

`product/specs/file-navigator-tab.md`: a delete, move, paste, or rename is addressed to the navigator it was made in. If that navigator has closed by the time the request arrives, nothing happens, even if another navigator now sits where it used to be in the tab list.

## Out of scope

- `undoFileNavigatorItem`/`redoFileNavigatorItem`, the non-destructive navigator methods, and `closeTab` stay on `index`.
- The client's `reportFileNavigatorSelection` records, which are keyed by index.
