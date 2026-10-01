# Make closing the last non-docked tab exit the way `quit` does

**Complexity: 3/10** — a reorder inside `closeTabOp` (`src/tab/close.ts`), the removal of a now-dead parameter from `closeTabResources` (`src/tab/cleanup.ts`), and test updates. No new architecture.

`closeTabOp` runs `closeTabResources` before it checks `closeQuitsApp`, so the last-tab close forgets the tab's persisted state, deletes its agent-state file, and removes its transcript — the "closed for good" teardown — and only then exits. `quit` exits without any of that, so every open tab comes back on `--relaunch`. The spec says the last-tab close "behaves exactly like `quit`"; for persistence it does not.

`closeTabResources` also takes a `nonDockedCount` and calls `managers.database.closeAll()` when it is `<= 1`. That was meant for the quitting close, but it also fires when a *docked* tab is closed while one center tab remains (`closeQuitsApp` is false for a docked tab, yet the non-docked count is 1), closing every SQLite connection though the app keeps running. Shutdown already closes them: `DatabaseManager.dispose` calls `closeAll`, and `Controller.shutdown` disposes every manager in `MANAGER_DISPOSE_ORDER`.

## Goal

Closing the last non-docked tab — by command, ×, Cmd+W, or process exit — emits `app:exit` before releasing anything, exactly as `quit` does, so the tab's saved state and transcript survive to the next `--relaunch` and its resources are released by shutdown. Closing any other tab, docked or not, keeps the full per-tab release and never closes every SQLite connection.

## Approach

1. `src/tab/close.ts`: check `closeQuitsApp(tabs, index)` first; when true, emit `app:exit` and return. Otherwise call `closeTabResources(tab, managers, openFiles)` and continue as today. Drop the `nonDockedCount` computation.
2. `src/tab/cleanup.ts`: remove the `nonDockedCount` parameter and the `database.closeAll()` line; reword the header comment (database connections are global and close at shutdown).
3. `src/managers.ts`: reword the `MANAGER_TAB_RELEASE` comment that calls `database`'s last-tab `closeAll()` an end-of-walk decision.

## Implementation steps

1. Make the three source changes above.
2. Update `src/tab/cleanup.test.ts`: drop the fourth argument from every call, and replace "closes every database connection only when this was the last tab" with a test that the walk never closes every database connection.
3. Update `src/controller.test.ts` "closes all SQLite connections when the last tab is closed": closing the last tab requests exit, and the shutdown that exit runs closes the connections.
4. Add `src/tab/close.test.ts` (below).
5. Run `./scripts/run.mjs check-diff` after each step.
6. Update `product/specs/state-directory.md`.

## Tests

New `src/tab/close.test.ts`, driving `closeTabOp` with stubbed managers (the shape `cleanup.test.ts` uses) and real agent-state/transcript files in a temp project directory:

- Closing the last non-docked tab emits `app:exit`, releases no per-tab manager resource, and leaves that tab's agent-state and transcript files on disk.
- Closing a non-last tab releases it, removes its files, and does not emit `app:exit`.
- Closing a docked tab while one center tab remains does not exit and does not close every database connection.

Existing: `src/controller.test.ts` ("closing the last tab quits the app", "…even with a docked file navigator", "shutdown closes all SQLite connections (quit)") and `src/tab/placement.test.ts` must keep passing.

## Out of scope

- The client-side quit confirmation for typed closes (a separate backlog entry).
- How shutdown itself orders its disposals.
