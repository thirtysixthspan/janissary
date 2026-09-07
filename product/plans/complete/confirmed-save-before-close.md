# Require confirmed save completion before the shared close guard closes a tab

**Complexity: 5/10** — a shared client contract gains a failure channel, two implementations stop resolving on unsuccessful writes, and the four call sites that consume the contract learn to handle a rejection. No new architecture, no server change, no wire change.

## Goal

Make `save()` on the shared dirty-tab handle mean "the work is on disk". Today it resolves whenever the attempt finishes, successful or not, so choosing **Save** in the close dialog after a write error or an unresolved external-change conflict closes the tab and discards the buffer. After this change an unsuccessful or deferred save keeps the tab — and its unsaved buffer — alive.

## Approach

The contract is `DirtyTabHandle` in `web/src/tab-handles.ts`, republished to plugins as `TabDirtyHandle` in `web/src/plugins/api.ts`. Both keep their `Promise<void>` shape; what changes is the documented meaning — resolve only after a confirmed save, reject when the save failed or needs a separate decision from the user.

The two implementations then honour it. `useEditorFile` keeps every piece of visible state it sets today (the error message, the overwrite-conflict dialog) and additionally rejects on a server error, on a buffer that has not loaded, and when a pending external change means the save turned into an overwrite prompt instead. `useImageEdit` rejects when there is no canvas to flatten, when the intent throws, and when the intent's result is malformed — it already reports the last of those to the host and keeps doing so.

Four callers consume the new rejection. `CloseSaveGuard` is the one that matters: on an unsuccessful save it dismisses its own dialog, sends no `closeTab`, and returns focus to the tab, so the error message or the overwrite prompt underneath is visible and reachable. Dismissing rather than staying open is deliberate — the save dialog is modal and traps input, so leaving it up would render the overwrite prompt it just raised unreachable. The remaining three are fire-and-forget save triggers (the editor's save button and Ctrl+S, and the image tab's Save button and Cmd+S) whose failures are already rendered in their own surfaces; they swallow the rejection so it does not surface as an unhandled promise rejection.

## Implementation steps

1. Document the resolve/reject contract on `DirtyTabHandle` in `web/src/tab-handles.ts` and on `TabDirtyHandle` in `web/src/plugins/api.ts`.
2. In `web/src/editor/useEditorFile.ts`, make `writeToDisk` throw the server error after setting `saveError`, and make `save` reject when there is no loaded buffer and when a pending external change routes it to the overwrite prompt. Keep `overwrite` fire-and-forget — it is a dialog callback, not a handle call — and have it swallow the rejection its own error display already covers.
3. In `web/src/editor/EditorTab.tsx`, have `requestSave` swallow the rejection so the button, Ctrl+S, and the suggest-panel trigger do not raise unhandled rejections; leave the imperative handle propagating it.
4. In `web/src/plugins/image/useImageEdit.ts`, make `save` throw when `compose()` yields no canvas, rethrow an intent failure after the existing `finally` clears the busy flag, and throw after reporting a malformed result.
5. In `web/src/plugins/image/ImageTab.tsx`, have the Save button and the Cmd+S handler swallow the rejection.
6. In `web/src/CloseSaveGuard.tsx`, wrap the handle's `save()` in a try/catch: on failure close the dialog, skip the `closeTab` send, and focus the tab; on success behave exactly as today.

## Tests

`web/src/editor/useEditorFile.test.ts`:

- A save that the server answers with an error rejects, while still setting `saveError` and leaving `savedFlash` false.
- A save with no loaded buffer rejects and writes nothing.

`web/src/CloseSaveGuard.test.tsx`:

- **Save** over a handle whose `save()` rejects sends no `closeTab`, dismisses the dialog, and focuses the tab.
- **Save** over a handle that resolves still sends `closeTab` (existing cases must keep passing).
- The same rejecting-handle case for a plugin tab, in the plugin-tab describe block.

`web/src/plugins/image/ImageEditor.test.tsx`:

- The registered host handle's `save()` rejects when the intent rejects, and the tab stays dirty.
- The registered host handle's `save()` rejects on a malformed result, alongside the existing `reportFailure` assertion.
- Clicking Save with a rejecting intent leaves no unhandled rejection and keeps the tab dirty.

## Spec updates

`product/specs/editor-tab.md` — under "Closing with unsaved changes", state that **Save** closes the tab only once the file is actually written, and that a failed save or one that raises the overwrite prompt leaves the tab open with its changes intact. Note in "Live reload of external changes" that reaching the overwrite prompt through the close dialog does not close the tab; the user confirms the overwrite and closes again.

`product/specs/image-tab.md` — under "Unsaved edits", state that **Save** in the close dialog keeps the tab when the write does not succeed.

## Docs

`help.md` does not describe the close dialog, so it needs no change. Two user-documentation pages do describe it and were updated in place: `documentation/user-documentation/tab-types/editor.md` ("Press `y` to save and close") and `documentation/user-documentation/tab-types/image-viewer.md`, both of which now say the tab closes only once the file is written.

## Out of scope

- The server's plugin-failure policy, which can still close image tabs after a reported plugin failure.
- Retrying a failed save automatically, or any change to the dialog's wording or buttons.
- The index-based `closeTab` wire command and the separate tab-identity work tracked elsewhere in the backlog.
- The quit guard, which reads `isDirty()` only and never calls `save()`.
