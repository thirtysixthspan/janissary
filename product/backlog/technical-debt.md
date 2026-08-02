# technical-debt

## ready


## development

* Validate client-supplied file-navigator paths at the manager boundary and reuse `containedPath` in `src/file-navigator/filesystem.ts` and `src/file-navigator/navigation.ts`: unlike the bulk operations in `src/file-navigator/batch-paths.ts`, scalar move/rename/delete and toggle/reroot currently pass raw `../` values to `path.join`/`path.resolve`, allowing operations and watchers to escape the current navigator root. Severity: **high**.
* Replace `src/harness/manager.ts`'s four independent PTY-keyed maps (`screenReaders`, `recorders`, `tailers`, and `autoApprovers`) with one per-PTY runtime record that owns disposal, because the exit handler and `dispose()` currently maintain separate cleanup checklists that can leak a newly added harness resource. Severity: **high**.
* Extract a shared bulk-operation pipeline for normalization, conflict preflight, policy handling, and failure aggregation from `src/file-navigator/batch.ts` and `src/file-navigator/paste.ts`, which independently implement the same stages with only relative-versus-absolute sources and copy-versus-move behavior differing. Severity: **medium**.
* Share the conflict preflight, partial-success stack bookkeeping, and rebuild handling between `applyStackMove` and `applyStackPaste` in `src/file-navigator/moves.ts`, where undo/redo for moves and pastes currently duplicate the same replay contract and can drift in conflict behavior. Severity: **medium**.
* Finish the type ownership migration by replacing the compatibility re-export hub in `src/types.ts` with direct imports from modules such as `src/tab/types.ts`, `src/profile/types.ts`, and `src/acp/types.ts`, because dozens of callers still depend on a barrel that hides the defining domain and violates the project's direct-import rule. Severity: **medium**.
* Split the 279-line RPC facade in `src/controller.ts` into feature-specific controller adapters for tabs, monitors, editors, and file navigation so the controller stops accumulating forwarding methods across unrelated domains and remains a small orchestration boundary. Severity: **medium**.

## deferred

* Split `src/tab/manager.ts` and retire its parallel per-label maps: the file is 451 lines and opens with `/* eslint-disable max-lines */`, suppressing the project's own 200-line guideline rather than following the guideline's stated remedy of extracting a cohesive module. It also still holds `cwd`, `busy`, `context`, and `queue` as separate `Map`/`Set` keyed by label — the exact "parallel maps keyed by label" pattern architecture principle 2 says to replace with state owned by the agent's own session object, now simply relocated from `Controller` to `TabManager`. Extract the split-pane/focus-selection logic (`repairSelections`, `focusedPane`, `recentLabel`, `moveTabToOtherPane`, `placeProfileTabs`) into its own module and move the per-label maps onto the tab object, then delete the suppression. Severity: **high**. — deferred: complexity 9/10, requires a cross-cutting runtime-state migration in addition to the module extraction.

## declined
