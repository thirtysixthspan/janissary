# technical-debt

## ready

## development

* Replace the hand-rolled deferred-promise boilerplate repeated across the server, remote, and editor code with one shared helper.

Existing Debt: Nine call sites build a promise and capture its resolve and reject functions by hand, each in a slightly different shape (an `expire` closure, a `{ resolve }` holder object, a definite-assignment `let`), and seven of them carry an `eslint-disable` for `unicorn/prefer-promise-with-resolvers` because the web project's ES2023 library lacks `Promise.withResolvers`, so the missing shared abstraction is paid for in suppressions and variant copies. Severity: 4/10

Existing Risk: 3/10 - A copy that forgets to initialise its captured functions, or settles twice, hangs a waiter or drops an error silently, and each variant has to be re-verified by hand.

Proposal Risk: 2/10 - The helper is small and each call site keeps its own settlement rules, but a call site whose resolver is invoked before the promise is observed could change timing if the helper wraps it differently, which only the timeout and abort tests around those sites would reveal.

Proposal: Add a `deferred<T>()` helper (returns `{ promise, resolve, reject }`) in a module importable by both projects, for example `src/shared/deferred.ts` if the `@shared` alias used by `web/src` reaches it (check how `@shared/protocol` and `@shared/editor/save-conflict` resolve), with a colocated `deferred.test.ts` covering resolve, reject, and a settle-twice no-op. Then replace the hand-rolled sites and delete their `eslint-disable` lines: `timeout` in `src/plugins/guard.ts`, `stopped` in `awaitReady` in `src/agent/readiness.ts`, `ready` in `src/remote/entry-factory.ts`, the two promises in `src/remote/acp-session.ts`, `open` in `src/remote/channel/pending-requests.ts`, `save` in `web/src/editor/save-coordinator.ts`, and the `cleanupPromise` and `beginAllocation` promises in `AgentRun` in `src/agent/run.ts` (these two have no suppression comment but hand-roll the same thing). Keep each site's surrounding semantics unchanged, including the `void ready.catch(() => {})` guards that stop an unobserved rejection from crashing. Existing tests to keep passing: `src/plugins/guard.test.ts`, `src/agent/readiness.test.ts`, `src/remote/channel/pending-requests.test.ts`, `web/src/editor/save-coordinator.test.ts`, and the agent run tests under `src/agent/`; run whichever of these exist.


* Give the editor tab's file lifecycle hooks explicit inputs so the six `exhaustive-deps` suppressions and the shared mutable `documentRead` object are no longer needed.

Existing Debt: `useEditorFile` and `useEditorWatchReload` coordinate through a mutable `{ generation, url }` object passed positionally as the ninth argument of a hook, both effects bump that generation counter from different files, and every effect in `web/src/editor/` silences `react-hooks/exhaustive-deps` with a "refs are stable" comment, so the dependency lists are no longer checked against what the effects actually read. Severity: 6/10

Existing Risk: 6/10 - A reload or load that reads a stale `client`, `api`, or `initialLine` from a suppressed effect, or a generation bump that one hook forgets, leaves the buffer showing old file content or overwrites unsaved text, and no lint rule will flag the mistake.

Proposal Risk: 4/10 - The load and reload paths guard against unsaved-work loss and external-change conflicts, so reordering their effects can change when a conflict is detected; the existing editor tests exercise this only through rendered scenarios.

Proposal: In `web/src/editor/`, introduce one small `useDocumentReads` hook (or a plain class held in a `useState` initialiser, the way `SaveCoordinator` is) that owns the `{ generation, url }` state and exposes `begin(url): { isCurrent(): boolean; cancel(): void }`, so `useEditorFile.ts` and `useEditorWatchReload.ts` stop sharing a raw mutable object. Change `useEditorWatchReload` from nine positional parameters to a single options object, and note that it is handed `setBaseline` under the parameter name `setLastSaved`, which reads as a different function. Store the latest `client`, `api`, `initialLine`, and `editor.line` in a `useLatestRef` (`web/src/useLatestRef.ts` already exists) inside each hook so the effects read `.current` and declare honest dependencies, then remove the `eslint-disable-next-line react-hooks/exhaustive-deps` lines in `useEditorFile.ts` and `useEditorWatchReload.ts`. Do the other suppressions in `EditorTab.tsx`, `useEditorLineJump.ts`, and `useEditorSuggest.ts` as a follow-up unit, not in this one. In `useEditorFile.ts`, `writeRef.current = writeToDisk` is assigned during render and can move to the same `useLatestRef`. Tests that pin behavior: `web/src/editor/EditorTab.test.tsx` and any `useEditor*.test.ts(x)` files beside it, plus `web/src/editor/save-coordinator.test.ts`. Add a test for "external change while dirty sets the conflict flag, and while clean reloads" if none of them states it directly, before refactoring.


* Extract the "show a confirmation for a few seconds, then clear it" timer into one hook shared by the editor, image, and video tabs.

Existing Debt: Three tabs each implement a transient confirmation with their own state, timeout, and cleanup, with different durations and different cleanup discipline: `useImageEdit` and `useVideoShot` keep the timer in a ref, clear the previous one, and clear on unmount, while `useEditorFile` fires an untracked `setTimeout(() => setSavedFlash(false), 1500)` that is never cleared. Severity: 3/10

Existing Risk: 3/10 - The editor's untracked timer can call a state setter after the tab unmounts or restart a flash early when two saves land within 1.5 seconds, a small visible glitch that reappears with each new tab that copies the nearest variant.

Proposal Risk: 2/10 - The behavior is cosmetic and well isolated, but the editor's flash is a boolean while the other two carry the saved file name, so a helper with the wrong value type would change what the metadata rows render.

Proposal: Add `useTransientValue<T>(durationMs)` in `web/src/shared/` (follow `ai/guidelines/react-code-organization.md` for placement and the shared-to-feature import direction) returning `[value, show(value), clear()]`, which clears any previous timer on each `show` and on unmount; give it a colocated test using fake timers. Use it in `web/src/plugins/image/useImageEdit.ts` and `web/src/plugins/video/useVideoShot.ts` (both define `CONFIRMATION_MS = 4000` and a `timer` ref) and in `web/src/editor/useEditorFile.ts` (replace `savedFlash` state and the 1500 ms `setTimeout` in `writeToDisk`; keep the `savedFlash: boolean` shape that `EditorMetaRow.tsx` consumes, derived from whether the value is set). Existing tests to keep passing: `web/src/editor/EditorTab.test.tsx` and the image and video plugin tests that assert the confirmation appears and disappears.


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


* Check server events at the web client's socket boundary as the server already checks client messages, and tidy the mis-indented `break` lines in `onEvent`.

Existing Debt: The server decodes every client message with `isClientMessage` and `clientParamsProblem` before acting, but `JanusClient` in `web/src/shared/ws/ws.ts` parses incoming frames with `JSON.parse(data) as ServerEvent`, a cast that asserts a shape nothing verifies, and its `onEvent` switch has `break` lines at the wrong indentation inside several cases. Severity: 3/10

Existing Risk: 3/10 - A server event with a missing or renamed field (a version skew after an update, a stale tab left open) reaches listeners as `undefined` and fails somewhere far from the socket, instead of being dropped at the boundary with an identifiable cause.

Proposal Risk: 3/10 - A guard that is stricter than what the server really sends would drop legitimate events and freeze part of the UI, so the guard has to be written against the event union in `src/protocol/events.ts` and checked by a test that feeds each event kind through it.

Proposal: In `web/src/shared/ws/`, add `server-event.ts` exporting `isServerEvent(value: unknown): value is ServerEvent` that checks `t` against the known set of event kinds and, for the hot ones (`state`, `pty`, `rpc-reply`), the fields the switch reads; derive the set of kinds from a single `as const` list in `src/protocol/events.ts` if one does not exist, so adding an event kind to the union cannot skip the guard. In the `SocketConnection` message callback in the `JanusClient` constructor, replace the cast with a `try`/parse, `isServerEvent` check, and drop-with-`console.warn` for anything else. Re-indent the `break` lines in `onEvent` (the cases from `layout` through `rpc-reply`) to match the first cases. Existing tests that pin behavior: `web/src/shared/ws/ws.test.ts`. Add a table test over every event kind that the guard accepts a valid sample and rejects one with a wrong `t`.


## deferred

## declined
