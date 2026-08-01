# Manager Teardown Contract

**Complexity:** 6/10

## Goal

Replace `Controller.shutdown()`'s hand-maintained teardown checklist with a lifecycle contract that automatically invokes every registered manager's optional `dispose()` method. Shutdown must release the resources already covered by the checklist, close harness screen readers, recorders, transcript tailers, and subscriptions, and kill editor suggestion ACP sessions that are currently omitted.

## Approach

Define the manager registry as a mapped type whose values all carry an optional `dispose()` lifecycle method. `Controller.shutdown()` will walk the registry in reverse construction order, invoking that method when present, then clear the shared message bus. Reverse order releases consumers before the managers they depend on and keeps workspace removal after process teardown.

Existing feature-specific cleanup methods such as `closeAll()`, `stop()`, and `removeAll()` remain available for non-shutdown callers and tests. Each resource-owning manager will expose `dispose()` as the uniform whole-manager entry point, delegating to its existing cleanup method where appropriate.

`HarnessManager.dispose()` will directly dispose and clear every per-PTY observer map and unsubscribe the manager's own PTY-exit listener. `EditorAcpManager.dispose()` will kill every open editor-persona session and clear its associated metadata and context. `CaptureManager` owns no resource today, so it will not gain a no-op method; the optional registry contract gives it a teardown path automatically if it acquires one later.

## Implementation Steps

### 1. Add the registry lifecycle contract

- Update `src/managers.ts` to define the optional manager lifecycle shape and map it over every concrete manager type.
- Update `src/controller.ts` so `shutdown()` iterates registered managers in reverse order, calls each available `dispose()`, and clears `messageBus` after manager teardown.

### 2. Normalize existing whole-manager cleanup

- Add `dispose()` adapters to `Questions`, `WorkspaceManager`, `BrowserManager`, `AcpManager`, `PseudoterminalManager`, `ScheduleManager`, `ShellManager`, `DatabaseManager`, and `MonitorManager`.
- Keep the existing granular or feature-specific cleanup methods intact for their current non-shutdown call sites.
- Reuse the existing `dispose()` implementations on `FileNavigatorManager` and `EditorWatchManager` unchanged.

### 3. Close resources missing from the old checklist

- Update `HarnessManager` to retain its PTY-exit subscription and add an idempotent `dispose()` that unsubscribes it, disposes all screen readers, recorders, and transcript tailers, and clears those maps plus the auto-approver map.
- Add `EditorAcpManager.dispose()` to kill all persistent editor-persona ACP sessions and clear session metadata and transcript context.

### 4. Record shutdown behavior

- Update `product/specs/application-commands.md` so application exit covers all live manager-owned processes, timers, watchers, questions, workspaces, and harness observers.
- Update `product/specs/harness-recording.md` so recording and transcript streams close on application shutdown as well as PTY exit.
- Update `documentation/user-documentation/advanced-agents/harness.md` to state that quitting closes the recording and transcript cleanly.
- Leave `help.md` unchanged because its one-line `quit` description remains accurate and does not describe teardown details.

## Tests

- `src/controller.test.ts`: install a `dispose()` function on a manager that was absent from the old checklist and verify `shutdown()` invokes it automatically.
- `src/harness/manager.test.ts`: verify manager disposal releases every per-PTY observer, stops later screen activity, clears lookups, and is idempotent.
- `src/editor/acp-manager.test.ts`: verify disposal kills every editor-persona ACP session and clears connection and transcript state.
- Run `./scripts/run.mjs check-diff` after each implementation step and after tests and documentation changes.

## Out of Scope

- Consolidating per-tab teardown behind a tab/session actor; this item addresses whole-application manager teardown only.
- Renaming or removing feature-specific cleanup APIs used outside application shutdown.
- Giving stateless managers no-op `dispose()` methods.
- Changing startup, quit confirmation, or process-exit timing.
