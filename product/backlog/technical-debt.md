# technical-debt

## ready


* Re-arm editor file watchers when an atomic save replaces the watched file.

Existing Debt: The editor's save path replaces a file through rename but updates only its watcher's timestamp baseline, leaving watcher ownership tied to the pre-save file. Severity: 6/10

Existing Risk: 7/10 - External edits after an ordinary save can stop reaching the editor, leaving stale content on screen and bypassing the overwrite-conflict prompt on a subsequent save.

Proposal Risk: 3/10 - Rebinding after saves restores observation of the current file, but filesystem event loss and independent external replacements remain limitations of single-file watching.

Proposal: `src/atomic-write.ts` writes a temporary file and renames it over the destination, while `finishSave` in `src/editor/save.ts` calls `EditorWatchManager.markSaved` for existing files and that method in `src/editor/watch-manager.ts` changes only `baselineMtimeMs`. The watch manager's own `refresh` comment already documents losing observation after file replacement and its implementation explicitly re-arms the watcher. Give the successful-save path an operation that closes the old watcher, watches the current path, and establishes the saved baseline without emitting a false external-change event; preserve first-save registration for new files and the distinct external-change detection behavior of `refresh`. Extend `src/editor/watch-manager.test.ts` and `src/editor/save.test.ts` to cover the actual atomic-save call path and verify watcher replacement, old-handle disposal, self-event suppression, and detection of the next external edit. Existing watch tests mock `fs.watch` and use in-place `writeFileSync`, so add focused real-filesystem coverage on the supported platform for save followed by external modification; the current tests do not establish that lifecycle behavior. Preserve client reload and dirty-buffer conflict behavior covered by `web/src/editor/useEditorWatchReload.test.ts` and `web/src/editor/useEditorFile.test.ts`.


* Give each save-before-close attempt a stable target and cancellable completion.

Existing Debt: The save confirmation tracks one mutable target label without an operation identity or pending-save guard, so awaited callbacks retain authority after their dialog is cancelled or replaced. Severity: 7/10

Existing Risk: 8/10 - Cancelling a slow save and opening another tab's close prompt lets the first save's completion close the second dirty tab without saving it.

Proposal Risk: 2/10 - Attempt-scoped completion prevents a cancelled or superseded save from closing a tab, although cancellation cannot undo a write already sent to the server.

Proposal: In `web/src/CloseSaveGuard.tsx`, `onSave` captures a handle before awaiting but calls `closeTarget` afterward, and `closeTarget` reads the current `labelRef` from `web/src/SaveChangesDialog/useSaveConfirm.ts`; `web/src/SaveChangesDialog/SaveChangesDialog.tsx` continues accepting Save, Discard, and Cancel during that await. Capture both label and an attempt generation before starting the save, invalidate the generation on cancellation, discard, replacement, and unmount, and allow only the current attempt to dismiss, focus, or close its captured target. Prevent repeated Save submissions while one attempt is pending through both button and keyboard paths, while preserving cancellation and resolving the captured label's current index immediately before sending `closeTab`. Extend `web/src/CloseSaveGuard.test.tsx` with deferred saves covering cancel then completion, cancel then a different tab's prompt, stale rejection, and repeated Save; retain its existing insertion/removal and failure-focus cases. Extend `web/src/SaveChangesDialog/SaveChangesDialog.test.tsx` for pending-state keyboard and button behavior. The existing tests exercise individual actions and changing tab positions but do not cover cancellation or replacement while a save is unresolved.


* Pass named state snapshots through the websocket client subscription boundary.

Existing Debt: The client converts the shared state event into sixteen positional arguments and redeclares their types and optionality, making every snapshot field change require synchronized edits across a second contract. Severity: 6/10

Existing Risk: 5/10 - Swapping adjacent string fields or omitting a newly added field can silently feed the wrong UI state while the positional callback still satisfies its types.

Proposal Risk: 2/10 - Named fields remove positional ambiguity and preserve shared optionality, though the individual React setters still need explicit wiring for new state.

Proposal: Change `StateListener` in `web/src/ws.ts` to accept the shared `StateEvent` from `src/protocol/events.ts`, available through `src/protocol.ts`, and have the `state` arm of `JanusClient.onEvent` forward a named snapshot. Preserve its deliberate null normalization for `route`, `harnessLaunch`, and `scheduleLaunch`. Destructure the named event in `web/src/useServerState.ts`, remove the duplicated optional `activeTabNameMaxLength` contract and its fallback for a field required by the shared event, and preserve route-choice initialization and project-title updates. Update listener fixtures and assertions in `web/src/ws.test.ts`, `web/src/useServerState.test.ts`, and `web/src/App.test.tsx`; add a complete snapshot with distinct values for adjacent string and numeric fields to pin the fan-out. Keep this increment confined to the subscription boundary rather than restructuring the app's state storage.

## development

## deferred

## declined

* Protect user edits made after a copy-paste before undo deletes its destination in `src/file-navigator/moves.ts`: `undoCopyPaste` records only absolute source and destination paths and unconditionally removes each destination, so editing or replacing a copied file before pressing undo silently deletes the newer content. Record enough identity or content metadata with each copy history entry to detect divergence and surface a conflict instead of removing a changed destination. Severity: **high**. — deferred: complexity 8/10, requires recursive destination identity tracking plus new undo conflict semantics across server history and client conflict handling.

* Stop the sandbox-confinement tests from passing vacuously off darwin in `src/sandbox/index.test.ts`: seventeen cases open with a bare `if (!sandboxAvailable()) return;`, and `sandboxAvailable()` requires `process.platform === 'darwin'` plus `/usr/bin/sandbox-exec`, so on the `ubuntu-latest` runners every job in `.github/workflows/ci.yml` uses, all of them return before their first assertion and are reported as *passing* rather than skipped. Every assertion about the Seatbelt profile the security model rests on — the `-D` param bindings, the secret-deny paths, the credential scrub, the `TMPDIR` override, the offline variant — therefore only ever runs on a developer's Mac, and CI would stay green if the confined path were deleted outright. Convert them to `describe.skipIf(!sandboxAvailable())` (or `it.skipIf`) so a run that cannot exercise confinement reports skips instead of green passes. Severity: **high**. declined: this application is currently limited to running on mac os x.
