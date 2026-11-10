# technical-debt

## ready

* Fold the duplicated undo-the-send paths and repeated timer clears in the conversation responder into single helpers, and cover the responder directly.

Existing Debt: `ConversationResponder.cancel` and `rollbackStartup` in `src/conversations/responder.ts` each hand-write the same block that removes the pending turn, restores the title and `updatedAt`, and drops the in-flight entry, and the `if (pending.timer) clearTimeout(pending.timer)` line is repeated five times, with the class only exercised indirectly through the manager. Severity: 4/10

Existing Risk: 5/10 - A fix to how a cancelled send restores the conversation's title or timestamp lands in one copy and not the other, leaving a failed start with a stale name or a turn that never existed in the history the user sees.

Proposal Risk: 3/10 - Both paths mutate the same conversation object that is then persisted, so a helper that restores slightly different fields would corrupt a saved conversation; the new direct tests are what make a mistake visible.

Proposal: Before refactoring, add `src/conversations/responder.test.ts` that drives `ConversationResponder` with a stub `ConversationSessions` and `ConversationStore` and asserts, for `send` then `cancel`, and for `send` where `sessions.session` throws: the turn is removed, the title is restored only when it still equals the generated one, `updatedAt` is restored, and `changed` fires. Then add two private methods, `clearTimer(pending)` and `undoSend(pending)` (turn removal, title restore, `updatedAt` restore, in-flight delete), and call them from `cancel`, `rollbackStartup`, `complete`, `fail`, and `dispose`. Keep the differences: `cancel` closes the session before the early return, `rollbackStartup` also reports the error, and `fail` keeps the turn with its error. The constructor takes six positional collaborators; leave that alone in this change. `src/conversations/manager.test.ts` and `src/conversations/sessions.test.ts` must keep passing unchanged.


* Express undo and redo replay once, in terms of a direction-aware view of a history step, instead of re-deriving the flipped sides at every use.

Existing Debt: Whether a history step's `from` and `to` are swapped depends on `direction === 'undo'`, and that flip is spelled out sixteen times across `src/file-navigator/manager/mutations.ts`, `src/file-navigator/manager/history.ts`, and `src/file-navigator/moves.ts`, including three nested ternaries in `replayMutation` that recompute the same pairs for the pre-flight refusal check and for the post-replay `pathsMoved` call. Severity: 5/10

Existing Risk: 5/10 - A flipped condition in any one of the sixteen copies sends a live-transcript refusal check or a `pathsMoved` notification to the wrong side of a move, so undoing a rename or cut-paste would update the wrong paths in other tabs, and the symmetric redo case is easy to leave untested.

Proposal Risk: 3/10 - Undo and redo of cut-paste across hosts and conflict policies is subtle and the move/paste group shapes differ, so the helper has to preserve both shapes, and any step type without a test is where a regression would hide.

Proposal: In `src/file-navigator/moves.ts` (it already owns `HistoryStep`, `isPasteGroup`, `applyStackMove`, and `applyStackPaste`), add a pure function `stepMoves(step, direction): { from: string; to: string }[]` that returns the pairs in replay order for either a move group (`entries`) or a paste group (`pairs`, and only for `mode === 'cut'`), with a colocated test for all four combinations of undo/redo and move/paste. Use it in `replayMutation` in `mutations.ts` to produce both the pre-flight `movingFrom` list (the `from` sides) and the `pathsMoved` argument, removing the nested ternaries and the second branch for non-paste steps; add a `stacksFor(state, direction)` helper returning `{ fromStack, toStack }` and use it in both `mutations.ts` and `history.ts`. Leave `applyStackMove` and `applyStackPaste` internals alone. Tests that pin behavior: `src/file-navigator/manager/paths-moved.test.ts`, `src/file-navigator/moves.test.ts`, and the file-navigator manager tests that exercise undo and redo; `replayMutation` has no test of its own, so add one for cut-paste undo notifying `pathsMoved` with the reversed pairs.


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
