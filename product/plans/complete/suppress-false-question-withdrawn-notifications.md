# Suppress false question-withdrawn notifications from the local executor

**Complexity: 2/10** — ~12 added lines in 1 production file, 5 requirements and 4 test scenarios (p=4.31)

## Goal

The local executor adds an abort listener that calls `notify` unconditionally and never removes it, so aborting the request signal after the user answered or after the tab was closed still emits a `Question from <tab> withdrawn` notification for a question that is no longer pending. This fix gates the notification on the question still being pending and removes the listener when the question settles, so the withdrawal line is recorded only for a genuine withdrawal and the notification feed stops showing alerts for interactions that completed normally.

## Requirements

1. From the backlog entry, "Suppress false question-withdrawn notifications from the local executor once a question has already settled": aborting the request signal after `questions.answer(...)` resolves the question records no `question-withdrawn` notification.
2. From the proposal, "The listener is removed once the question settles and the notify call is gated on the question still being pending, so only a genuine withdrawal before an answer notifies": the abort listener is detached on every settlement path, so a late abort cannot reach `notify`.
3. From the proposal, "an abort while the question is pending both cancels it through `Questions.register` and notifies exactly once": an abort before any answer still resolves the question as `Question cancelled.`, shows the next queued question, and records exactly one `question-withdrawn` notification.
4. From the proposal, "a user cancellation in the panel notifies not at all": answering with `null` still resolves as `Question cancelled.` and records no notification.
5. The `question-withdrawn` message, tab naming, and explicit-event classification stay the same for the notifications that are still recorded.

## Design decisions

- A named `onAbort` handler replaces the inline callback, and a `settled` flag gates its `notify` call, so a handler invocation after settlement returns early instead of reporting a withdrawal for a question that no longer exists (Requirement 1).
- A `try/finally` around the awaited `managers.questions.register(...)` sets `settled` and calls `signal.removeEventListener('abort', onAbort)` on every settlement path — answer, panel cancellation, abort, or an error — so no listener survives the question (Requirement 2). The no-tab early return happens before the listener is added, so it needs no cleanup.
- The listener keeps `{ once: true }`, preserving the existing at-most-once dispatch so an abort while pending still records exactly one notification (Requirement 3). See Assumption 1.
- Cancellation remains owned by `Questions.register` through the same signal; the executor changes only its own notification callback and adds no listener or manager to any other MCP module (Requirement 3). See Assumption 3.
- No new module is introduced: `src/mcp/executor.ts` is 21 lines and stays well under the 200-line limit. Only `src/mcp/executor.test.ts` and the `question-withdrawn` bullet of `product/specs/notifications.md` change alongside it.
- The notifications spec already says a question is withdrawn "before it is answered"; the edit makes that boundary explicit so the documented behavior matches the code without changing the message or its classification (Requirement 5).

## Preserved behavior

1. An abort while the question is pending cancels it through `Questions.register`, shows the next queued question, and records exactly one `question-withdrawn` notification. The change must not drop that notification, duplicate it, or leave the queued question hidden. Pinned by `createLocalExecutor withdraws an aborted question, shows the next queued question, and records one notification` in `src/mcp/executor.test.ts`.
2. A user cancellation in the panel returns `Question cancelled.` and records no notification. The change must not emit `question-withdrawn` on that path. Pinned by `createLocalExecutor returns Question cancelled. when the user cancels in the panel` in `src/mcp/executor.test.ts`.
3. A question for an unknown tab returns the exact no-tab error without registering or notifying. The change must not add a listener or notification on that early return. Pinned by `createLocalExecutor returns an exact no-tab error without registering or notifying` in `src/mcp/executor.test.ts`.

## Assumptions

1. The abort listener currently notifies unconditionally and is never removed: `src/mcp/executor.ts:17` `signal.addEventListener('abort', () => notify(managers, 'question-withdrawn', label), { once: true })`.
2. Registration is the await whose settlement the fix gates on: `src/mcp/executor.ts:18` `const answer = await managers.questions.register({ tab: label, kind, question, options }, signal)`.
3. `Questions.register` owns signal cancellation and detaches its own listener when the entry finishes: `src/questions.ts:26` `if (signal?.aborted) return Promise.resolve(QUESTION_CANCELLED);` and `src/questions.ts:32` `entry.cleanup = () => signal.removeEventListener('abort', cancel);`.
4. The existing suite already pins the exactly-once withdrawal notification: `src/mcp/executor.test.ts:109` `expect(deliverNotification).toHaveBeenCalledTimes(1);`.
5. The spec states the withdrawal precedes an answer: `product/specs/notifications.md:165` "a question asked by an agent in a background tab is withdrawn before it is answered".

## Existing functionality

1. Notification delivery for `question-withdrawn` through the shared notifier: `src/mcp/executor.ts:4` `import { notify } from '../notifications/index.js';`.
2. Question registration and signal-based cancellation: `src/questions.ts:25` `register(request: QuestionRequest, signal?: AbortSignal): Promise<string>`.
3. The mocked delivery assertion used by the executor tests: `src/mcp/executor.test.ts:9` `vi.mock('../notifications/deliver.js', () => ({ deliverNotification: vi.fn() }));`.

## Implementation steps

Step 1. In `src/mcp/executor.ts`, replace the inline abort callback at line 17 with a `settled` flag and a named `onAbort` handler that returns early when `settled` is true and otherwise calls `notify(managers, 'question-withdrawn', label)`. Register that handler with the same `{ once: true }` options. Wrap the awaited `managers.questions.register(...)` and its result construction in a `try/finally` whose `finally` sets `settled = true` and calls `signal.removeEventListener('abort', onAbort)`. Leave the no-tab early return, the `mcpUsed` write, and the dirty-state emission untouched. Build command: `$janissary/scripts/run.mjs check-diff`.

Step 2. In `src/mcp/executor.test.ts`, add one case that starts a pending question with an `AbortController`, calls `questions.answer(...)` on it, awaits the executor result, then calls `controller.abort()` and asserts `deliverNotification` was not called. Mirror the fixture and assertion style of the neighbouring cases. Leave the existing answer, approve, cancel-in-panel, alias, dirty-state, no-tab, and abort-while-pending cases unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.

Step 3. In `product/specs/notifications.md`, extend the `question-withdrawn` bullet with one concise sentence stating that a question already answered or cancelled produces no withdrawal line even if the request signal is aborted afterwards. Keep the message text, explicit-event classification, and default alert unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. No user-interface surface is added or changed. The notifications feed line and its wording stay identical for the withdrawals that still occur; the change only removes a line that was recorded for a question that had already settled. Key bindings, focus, and panel behavior are untouched.

## Tests

- `src/mcp/executor.test.ts`: a pending question answered with `questions.answer(...)` and followed by `controller.abort()` records no notification (Requirement 1 and Requirement 2).
- `src/mcp/executor.test.ts`: the existing `withdraws an aborted question, shows the next queued question, and records one notification` case keeps asserting one `question-withdrawn` line with the `Question from build withdrawn` message (Requirement 3 and Preserved behavior 1).
- `src/mcp/executor.test.ts`: the existing `returns Question cancelled. when the user cancels in the panel` case keeps asserting no notification (Requirement 4 and Preserved behavior 2).

## Out of scope

- Adding a new listener, manager, or module anywhere under `src/mcp/`; the fix stays inside the local executor's own callback.
- Changing `Questions` cancellation behavior or the signal contract it exposes.
- Changing the `question-withdrawn` message, its explicit-event classification, or its notification configuration.
- Editing `help/` or either documentation tree; no command, flag, or key binding changes.
- Adding a production caller for `createLocalExecutor` or updating any downstream consumer.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then run the executor test file alone and confirm the new answer-then-abort case passes while both existing withdrawal cases still pass: a failure looks like `deliverNotification` being called after the answer, the abort-while-pending case recording zero or two notifications, or the cancel-in-panel case recording one. Read the final `src/mcp/executor.ts` to confirm the named handler checks `settled` and that the `finally` detaches the listener before the executor returns on every path.
