# technical-debt

## ready

* Continue tab resource cleanup after an individual release fails and report the combined failures.

Existing Debt: The tab-close release walk stops at the first thrown manager or lifecycle callback, unlike controller shutdown, which attempts every disposer and aggregates failures. Severity: 5/10

Existing Risk: 6/10 - A tab can disappear from the interface after one release throws while its later PTYs, watchers, remote references, or served-file registrations remain live and unreachable.

Proposal Risk: 2/10 - A failing resource may still require shutdown or restart to recover, but its failure no longer prevents independent resources and file references from being released.

Proposal: Make `closeTabResources()` in `src/tab/cleanup.ts` collect failures while continuing the ordered `MANAGER_TAB_RELEASE` walk, busy-state removal, transcript removal notification, and plugin/editor file-reference release. Include failures from workspace cancellation and deferred workspace release, and await all scheduled releases before rejecting with one `AggregateError`; attach rejection handling to deferred work immediately so an earlier failure cannot strand an unobserved promise. Preserve the current synchronous start of manager releases and the deferred workspace deletion rather than putting an await before ordinary tab removal. Use the failure-containment behavior in `ControllerCore.shutdown()` in `src/controller.ts` as the local precedent, and keep `src/tab/close.ts` returning the resource-release promise while applying removal and focus synchronously. `src/tab/cleanup.test.ts` currently covers the release list, workspace deferral, remote/local distinctions, and file-reference removal only with successful fakes; add cases where an early manager, a transcript listener, and deferred workspace release fail, verifying that later releases still occur, unrelated file references survive, and every failure is observable through the returned promise. Preserve the visible close and focus behavior covered by `src/controller.test.ts`.


* Coordinate initial editor reads and watched reloads through one document-read generation.

Existing Debt: Initial file loading and watched reloads have separate cancellation mechanisms, so the watcher's sequence guard cannot invalidate an older initial read that writes the same buffer and saved baseline. Severity: 6/10

Existing Risk: 7/10 - If a watched read finishes before the initial read, the delayed initial response can replace newer content or subsequent user edits and mark that stale content as the clean save baseline.

Proposal Risk: 2/10 - An external change can still require the existing overwrite confirmation, but an obsolete read cannot replace a newer document or clear its dirty state.

Proposal: Give `useEditorFile()` in `web/src/editor/useEditorFile.ts` ownership of a shared document-read generation and pass a narrow read-coordination surface to `useEditorWatchReload()` in `web/src/editor/useEditorWatchReload.ts`. Starting either initial loading or an mtime-driven reload must invalidate earlier reads, and applying a result must require the same live document identity and current generation; a watched load that supersedes initialization must also preserve the requested initial line. Keep the watcher's dirty-buffer check at completion and ensure an initial response cannot overwrite a buffer populated and edited while it was pending. Invalidate pending reads on unmount and document-reference replacement, retaining the current empty-buffer behavior for new files and the provisioning wait for synced files. `web/src/editor/useEditorWatchReload.test.ts` already verifies out-of-order watched reads and edits during a reload, and `web/src/editor/useEditorFile.test.ts` verifies initial loading, save conflicts, queued saves, and baseline updates after a completed watched reload. Add integration cases in the latter test file with a deferred initial read, a newer mtime read completing first, and user input before the initial response returns; assert that content, dirty state, and the next save's expected hash all retain the newer baseline, since the existing suites never overlap initialization with a watched read.


## development

## deferred

## declined
