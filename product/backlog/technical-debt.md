# technical-debt

## ready

## development

* Require confirmed save completion before the shared close guard closes an editor tab.

Existing Debt: The shared dirty-handle contract treats a resolved save promise as permission to close, but text and image save implementations also resolve when no successful write occurred. Severity: 7/10

Existing Risk: 8/10 - Choosing Save in the close dialog after a text write error or an external-change conflict can close the tab and discard the buffer before the user can recover or confirm an overwrite.

Proposal Risk: 3/10 - A failed or deferred save keeps the close dialog and buffer alive, although the separate server plugin-failure policy can still remove image tabs after a plugin failure.

Proposal: Define the existing `Promise<void>` save contract in `web/src/tab-handles.ts` and `web/src/plugins/api.ts` to resolve only after a confirmed save and to reject when saving fails or requires a separate decision. In `web/src/editor/useEditorFile.ts`, preserve the visible error and conflict state but stop resolving successfully on a server error, unavailable buffer, or pending overwrite confirmation; propagate that outcome through the imperative handle in `web/src/editor/EditorTab.tsx`. Apply the same contract to the registered handle in `web/src/plugins/image/useImageEdit.ts`, whose catch currently swallows intent failures and whose missing canvas path returns without saving. Have `web/src/CloseSaveGuard.tsx` catch unsuccessful saves and retain the tab, and have direct button and shortcut callers in `web/src/editor/EditorTab.tsx` and `web/src/plugins/image/ImageTab.tsx` consume rejections without unhandled promises. Keep overwrite confirmation explicit and let the user retry closing after it succeeds. `web/src/editor/useEditorFile.test.ts` covers error display and `web/src/CloseSaveGuard.test.tsx` covers successful saves separately, but neither pins their failing-save composition; add cases for a write error, a conflict requiring confirmation, and an unsuccessful image handle, asserting that no close RPC is sent while preserving the successful-close cases.


* Track the saved image operation history independently of its undo cursor.

Existing Debt: The image editor records its saved state as a cursor number even though editing after undo replaces the history at that same position. Severity: 6/10

Existing Risk: 8/10 - Saving a rotation, undoing it, and applying a flip returns to the saved cursor with different pixels, disabling Save and allowing the unsaved image changes to be closed without a prompt.

Proposal Risk: 2/10 - Comparing the saved operation history preserves dirty tracking across branches, although equivalent pixel results reached through different operations may conservatively remain dirty.

Proposal: Replace `savedCursor` in `web/src/plugins/image/useImageEdit.ts` with a snapshot of the active operation sequence captured for the actual save request, and compare the current active sequence against that snapshot using a pure helper in `web/src/plugins/image/edit-model.ts`. Preserve the ability to undo or redo back to the saved sequence and become clean; a replacement operation at the same cursor must remain dirty. When an asynchronous save completes, record the sequence sent with that request rather than the latest model, so edits made while it was pending remain unsaved. `web/src/plugins/image/edit-model.test.ts` already pins truncation of redo history, and `web/src/plugins/image/ImageEditor.test.tsx` covers successful saves, button enablement, and dirty-handle registration, but neither combines a saved checkpoint with a history branch. Add the save-rotate, undo, flip sequence plus an edit-during-save case, asserting both Save availability and the dirty handle used by the host close guard.


* Keep close-dialog targets tied to tab identity while the tab list changes.

Existing Debt: The close confirmation stores a mutable array index, uses it to select a handle from the latest tab list, and reuses that position for closing after an awaited save. Severity: 6/10

Existing Risk: 7/10 - A tab insertion, removal, or reorder while confirmation is open or saving is pending can save, discard, close, or focus a different tab from the one the user selected.

Proposal Risk: 3/10 - Resolving the captured tab identity against the latest snapshot prevents dialog-lifetime target drift, but the index-based wire command still leaves a smaller race between sending a close and server execution.

Proposal: Change `web/src/SaveChangesDialog/useSaveConfirm.ts` to retain the selected tab label instead of `indexRef`, and capture that label when `web/src/CloseSaveGuard.tsx` first checks the dirty handle. Resolve the corresponding handle by label for Save and Cancel, and compute its current index immediately before sending the close command for Save or Discard, including a fresh lookup after the awaited save. If the original tab no longer exists, dismiss without closing another tab. Keep this increment confined to dialog targeting; `src/protocol/core-rpc.ts` still defines an index-based `closeTab`, and `src/tab/close.ts` resolves it against the server's current array, so a future wire-identity change remains separate work. Extend `web/src/CloseSaveGuard.test.tsx`, whose existing cases keep the tab list fixed, with rerenders that insert, remove, or reorder tabs before confirmation and while a deferred save is pending; assert that only the original label is acted on and disappearance sends no close.


* Settle outstanding WebSocket requests when their connection ends.

Existing Debt: The WebSocket client owns pending request callbacks but has no connection-close settlement path, and disposal clears those callbacks without completing their promises. Severity: 6/10

Existing Risk: 6/10 - A socket disconnect after sending a save or plugin intent leaves its promise pending indefinitely, so waiting dialogs and busy indicators cannot finish even though no reply can arrive.

Proposal Risk: 2/10 - Connection termination produces a definite failure for waiting callers, although a lost reply still cannot establish whether the server completed the operation before disconnecting.

Proposal: Add one idempotent pending-request drain in `web/src/ws.ts` and use it from the socket close handler and `JanusClient.dispose()` instead of silently clearing the map. Preserve existing caller conventions in this increment: generic `request()` resolves with its existing unavailable-result value and `saveFile()` resolves with a nonempty connection error, using the callback's existing error parameter; do not replay mutating requests automatically because a missing reply does not prove the operation failed. Handle a synchronous socket-send failure through the same request cleanup so its callback is not retained. `web/src/plugins/api.ts` already turns an undefined intent result into a rejection, and `web/src/editor/useEditorFile.ts` already displays a returned save error. `web/src/ws.test.ts` covers requests started on an already-closed socket, normal replies, and listener cleanup on disposal, but never terminates a connection with requests outstanding; extend its fake socket to dispatch close and assert settlement of multiple pending requests, harmless late replies, and idempotent close/dispose cleanup.

## deferred

## declined

* Protect user edits made after a copy-paste before undo deletes its destination in `src/file-navigator/moves.ts`: `undoCopyPaste` records only absolute source and destination paths and unconditionally removes each destination, so editing or replacing a copied file before pressing undo silently deletes the newer content. Record enough identity or content metadata with each copy history entry to detect divergence and surface a conflict instead of removing a changed destination. Severity: **high**. — deferred: complexity 8/10, requires recursive destination identity tracking plus new undo conflict semantics across server history and client conflict handling.

* Stop the sandbox-confinement tests from passing vacuously off darwin in `src/sandbox/index.test.ts`: seventeen cases open with a bare `if (!sandboxAvailable()) return;`, and `sandboxAvailable()` requires `process.platform === 'darwin'` plus `/usr/bin/sandbox-exec`, so on the `ubuntu-latest` runners every job in `.github/workflows/ci.yml` uses, all of them return before their first assertion and are reported as *passing* rather than skipped. Every assertion about the Seatbelt profile the security model rests on — the `-D` param bindings, the secret-deny paths, the credential scrub, the `TMPDIR` override, the offline variant — therefore only ever runs on a developer's Mac, and CI would stay green if the confined path were deleted outright. Convert them to `describe.skipIf(!sandboxAvailable())` (or `it.skipIf`) so a run that cannot exercise confinement reports skips instead of green passes. Severity: **high**. declined: this application is currently limited to running on mac os x.
