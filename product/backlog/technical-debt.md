# technical-debt

## ready

## development

* Prevent stale selection-action replies from populating a newer context menu in `web/src/useSelectionAction.ts`: every `query` clears the current entry but accepts whichever asynchronous reply arrives last, so rapidly opening menus on different selections can expose and run an action resolved for the previous path set. Add a request generation or cancellation guard and clear it when the menu closes so only the current selection's reply can install an entry. Severity: **medium**.

* Split the app-shell orchestration in `web/src/App.tsx` into cohesive feature controllers: the component exceeds the project's 200-line limit while owning nearly every picker, layout, quit guard, tab handle, search path, window-key snapshot, server-state subscription, and the correspondingly oversized `AppMain` prop handoff, so adding a client feature expands one high-churn integration point and its tests. Extract related state and callbacks behind small hooks or controller objects and pass grouped feature interfaces into `AppMain`. Severity: **medium**.

## deferred

* Give RPC failures and connection loss an explicit result path in `web/src/ws.ts`: `JanusClient.request` ignores the `error` carried by `rpc-reply`, resolves `undefined as T` when the socket is not open, and leaves every pending promise unsettled if the socket closes, while callers such as `web/src/useQuickOpen.ts`, `web/src/file-navigator/useFileNavigatorSearch.ts`, and `web/src/file-navigator/useFileNavigatorMoveOperations.ts` immediately dereference the declared result. Reject or return a typed result on server errors and disconnection, settle pending calls on close/dispose, and make callers handle that shared failure contract. Severity: **high**. — deferred: complexity 8/10, requires a shared RPC failure contract and coordinated lifecycle/error handling across ten client call sites.

* Protect user edits made after a copy-paste before undo deletes its destination in `src/file-navigator/moves.ts`: `undoCopyPaste` records only absolute source and destination paths and unconditionally removes each destination, so editing or replacing a copied file before pressing undo silently deletes the newer content. Record enough identity or content metadata with each copy history entry to detect divergence and surface a conflict instead of removing a changed destination. Severity: **high**. — deferred: complexity 8/10, requires recursive destination identity tracking plus new undo conflict semantics across server history and client conflict handling.

## declined
