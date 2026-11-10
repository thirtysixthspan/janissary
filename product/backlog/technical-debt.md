# technical-debt

## ready

* Break `startServer` in the server entry module into named setup, connection-handling, and teardown steps so the repeated shutdown sequence is written once.

Existing Debt: The one function in `src/index.ts` that builds the controller, HTTP server, and WebSocket server inlines three separate failure and shutdown paths that each repeat `resumeWatch.stop()`, `resumeSubscription.unsubscribe()`, and `controller.shutdown()` (the launch-shell failure, the listen failure, and `close`), with its own `closed` flag and an `exitTimer` reassigned from inside a connection handler. Severity: 5/10

Existing Risk: 5/10 - A new resource acquired during start-up (a watcher, a manager) has to be released in three hand-maintained places, and a missed one leaks a timer or subscription that keeps the process alive or double-fires after a failed start.

Proposal Risk: 4/10 - Start-up ordering and shutdown ordering carry the process's safety properties (the token check on upgrade, releasing the port on a failed listen), and `src/index.test.ts` covers the happy path far better than the partial-failure paths this change would touch.

Proposal: In `src/index.ts`, introduce a local `stopBackground()` closure (or a small `ServerResources` object) that performs `resumeWatch.stop()` and `resumeSubscription.unsubscribe()` once, and call it from the three paths; move the `wss.on('connection', ...)` body into `src/connection/` (check what that directory already holds before adding a file) as a function that takes the controller, client set, and a `cancelExit`/`armExit` pair, so `startServer` shrinks toward the 200-line limit instead of growing past it. Do not change the order of the upgrade guard (`originAllowed`, then `tokenMatches`). Before refactoring, add `src/index.test.ts` cases for "launch shell fails: resources released and error rethrown" and "listen fails: controller shut down and http closed", since only the happy path is visibly covered. Keep `isClientMessage`, `clientParamsProblem`, and `handle` calls exactly as they are.


* Route the web plugins' fire-and-forget host intents through one helper that records a failure, instead of discarding it with an empty catch.

Existing Debt: Plugin components call the host's `intent()` and throw away the result with `void capabilities.intent(...).catch(() => {})` at roughly eight call sites (`web/src/plugins/page/PageTab.tsx`, `web/src/plugins/launcher/LauncherTab.tsx`, `web/src/plugins/shell/useShellSubmit.ts`, `web/src/plugins/pdf/usePdfDocument.ts`, and others), so there is no single place where an intent failure is observed. Severity: 4/10

Existing Risk: 4/10 - A remembered shell line, a focus request, or a load-failed report that fails (server restarted, intent renamed, payload rejected) vanishes with no trace anywhere, so a broken intent looks like a UI that quietly does nothing.

Proposal Risk: 2/10 - The calls are already fire-and-forget, so the only behavior change is that failures leave one diagnostic line; the risk is noisy logging if a reconnect makes many calls fail at once.

Proposal: Add `fireIntent(capabilities, name, payload)` next to the plugin capability types in `web/src/plugins/` (see `web/src/plugins/api.ts`, whose `intent<Result>(name, payload)` returns a promise) that calls the intent and reports a rejection once through the project's existing client-side error path; look for it first in `web/src/shared/` before adding anything new, and fall back to a single `console.warn` with the intent name if there is none. Replace the `void ....catch(() => {})` sites that call `capabilities.intent(` or an `intent.current(` ref, leaving sites that need the result alone. Keep the helper free of React so it can be tested without a render, with a colocated test that a rejecting intent is reported and does not throw. Existing tests that call these components with a stub `capabilities` must keep passing; run the plugin tests for `page`, `launcher`, `shell`, and `pdf`.


## development

## deferred

## declined
