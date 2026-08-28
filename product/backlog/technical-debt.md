# technical-debt

## ready

## development

## deferred

* Colocate schedule creation with the schedules feature by moving `web/src/ScheduleDialog.tsx` and `web/src/schedule-command.ts` (plus their tests) into `web/src/plugins/schedules/`: the dialog and its command-building rules implement the same scheduling capability as `web/src/plugins/schedules/SchedulesTab.tsx` but are separated into the flat app root, violating §1 (organize by feature, not by file type), so changes to schedule forms and schedule display require surveying two unrelated-looking areas. Update the direct import in `web/src/AppMain.tsx`; the dialog has one production consumer, while the bundled schedules tab remains loaded through `web/src/plugins/registry.tsx`. Severity: **medium**. — deferred: complexity 8/10, the plugin boundary forbids the schedule dialog's host protocol, `JanusClient`, and launch-dialog imports, so colocation requires redesigning the host/plugin contract rather than moving files.

* Give RPC failures and connection loss an explicit result path in `web/src/ws.ts`: `JanusClient.request` ignores the `error` carried by `rpc-reply`, resolves `undefined as T` when the socket is not open, and leaves every pending promise unsettled if the socket closes, while callers such as `web/src/useQuickOpen.ts`, `web/src/file-navigator/useFileNavigatorSearch.ts`, and `web/src/file-navigator/useFileNavigatorMoveOperations.ts` immediately dereference the declared result. Reject or return a typed result on server errors and disconnection, settle pending calls on close/dispose, and make callers handle that shared failure contract. Severity: **high**. — deferred: complexity 8/10, requires a shared RPC failure contract and coordinated lifecycle/error handling across ten client call sites. decision: a lot of work and perf issue - defer until needed.


## declined

* Protect user edits made after a copy-paste before undo deletes its destination in `src/file-navigator/moves.ts`: `undoCopyPaste` records only absolute source and destination paths and unconditionally removes each destination, so editing or replacing a copied file before pressing undo silently deletes the newer content. Record enough identity or content metadata with each copy history entry to detect divergence and surface a conflict instead of removing a changed destination. Severity: **high**. — deferred: complexity 8/10, requires recursive destination identity tracking plus new undo conflict semantics across server history and client conflict handling.

