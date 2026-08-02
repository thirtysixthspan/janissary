# technical-debt

## ready

## development


## deferred

* Finish the type ownership migration by replacing the compatibility re-export hub in `src/types.ts` with direct imports from modules such as `src/tab/types.ts`, `src/profile/types.ts`, and `src/acp/types.ts`, because dozens of callers still depend on a barrel that hides the defining domain and violates the project's direct-import rule. Severity: **medium**. — deferred: complexity 9/10, requires coordinated direct-import changes across dozens of callers and multiple domain boundaries.

* Split the 279-line RPC facade in `src/controller.ts` into feature-specific controller adapters for tabs, monitors, editors, and file navigation so the controller stops accumulating forwarding methods across unrelated domains and remains a small orchestration boundary. Severity: **medium**. — deferred: complexity 8/10, the improve-modularity playbook blocks `src/controller.ts` explicitly as a high-risk controller extraction.

* Validate client-supplied file-navigator paths at the manager boundary and reuse `containedPath` in `src/file-navigator/filesystem.ts` and `src/file-navigator/navigation.ts`: unlike the bulk operations in `src/file-navigator/batch-paths.ts`, scalar move/rename/delete and toggle/reroot currently pass raw `../` values to `path.join`/`path.resolve`, allowing operations and watchers to escape the current navigator root. Severity: **high**. — deferred: improve-security.md requires a human to make input-validation changes; its scans found no dependency patch that can be applied automatically.

* Split `src/tab/manager.ts` and retire its parallel per-label maps: the file is 451 lines and opens with `/* eslint-disable max-lines */`, suppressing the project's own 200-line guideline rather than following the guideline's stated remedy of extracting a cohesive module. It also still holds `cwd`, `busy`, `context`, and `queue` as separate `Map`/`Set` keyed by label — the exact "parallel maps keyed by label" pattern architecture principle 2 says to replace with state owned by the agent's own session object, now simply relocated from `Controller` to `TabManager`. Extract the split-pane/focus-selection logic (`repairSelections`, `focusedPane`, `recentLabel`, `moveTabToOtherPane`, `placeProfileTabs`) into its own module and move the per-label maps onto the tab object, then delete the suppression. Severity: **high**. — deferred: complexity 9/10, requires a cross-cutting runtime-state migration in addition to the module extraction.

## declined
