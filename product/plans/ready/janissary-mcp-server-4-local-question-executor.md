# feat: add the local MCP question executor

**Complexity: 4/10** — ~85 added lines, 1 edited file, 8 requirements (p=5.17)

## Goal

Implement the function that actually answers an MCP `question` call in the local process: resolve the caller's `tab` to an open tab, mark the tab as using MCP, await the existing `Questions.register`, and return the answer as text — while turning a caller abort into a withdrawal with its notification and the next queued question. Building the executor as its own module keeps it testable without a listener and lets the manager land in the next subplan.

Source: `./product/plans/complete/janissary-mcp-server.md`. Depends on `janissary-mcp-server-1-mcp-core.md` and `janissary-mcp-server-3-config-and-notifications.md`.

## Requirements

1. The question opens the question panel on the tab its `tab` argument names — feature text: "the question dialog should show up on the calling harness tab - tab must be provided by the caller."
2. Any authenticated caller can name any open tab; a token is not bound to a tab — user answer: "The caller passes any `tab` label, and the server shows the question there if that tab exists. No per-tab binding."
3. The tool returns the user's answer as its text result — feature text: "allow harnesses to questions the user via the janissary question functionality".
4. A user Cancel in the panel returns `Question cancelled.` as the tool's text result — established behavior: `product/specs/agent-questions.md` § Cancellation "return `Question cancelled.` to the waiting agent".
5. A `tab` that names no open tab returns an MCP tool error result with the exact text `No tab named "<tab>".` and opens no panel — user answer: "MCP tool error + message", "Specific sentences". This exact text is declared by `janissary-mcp-server-1-mcp-core.md` as part of requirement 7, which is shared across both subplans.
6. An MCP cancellation or a closed connection from the caller aborts its registered question and withdraws the panel — user answer: "Withdraw + notify": "An MCP cancellation or a closed connection aborts the registered question, the panel disappears".
7. Withdrawing a question shows the next queued question for that tab, if any — user answer: "the next queued question (if any) appears."
8. Withdrawing a question records the notification `Question from <tab> withdrawn` — user answer: "also record a notification `Question from <tab> withdrawn`". This requirement is shared with `janissary-mcp-server-3-config-and-notifications.md`, which defines the kind and its text.

## Design decisions

- The executor uses the existing `Questions.register` rather than a parallel question path, so queueing, the `Question cancelled.` answer and tab-close cancellation behave exactly as they do today. The tool callback awaits that promise and returns its string.
- Tab resolution uses the same label-or-alias lookup every other tab-addressing command uses, so a typed alias works here too; a miss returns the exact `No tab named "<tab>".` error and registers nothing.
- `mcpUsed` is set on the matched tab and a dirty state is emitted before awaiting, so the metadata flag turns green as soon as the harness starts using the server, not when it answers.
- A caller abort removes the entry through `Questions.register`'s `AbortSignal`. The executor listens on the same signal and records `Question from <tab> withdrawn` on abort only; a normal answer or a user Cancel does not abort that signal, so neither records the withdrawal.

## Preserved behavior

1. A second question on a tab stays queued until the first resolves. Negative assertion: an MCP question must not replace or show alongside a tab's active question. Test: `src/questions.test.ts` "holds a second question until the first resolves".
2. Closing a tab resolves its active and queued questions to `Question cancelled.`. Negative assertion: an MCP caller's question must not stay pending after its tab closes. Test: `src/questions.test.ts` "resolves active and queued questions when their tab closes".

## Assumptions

1. A question is registered against a tab label and resolves to the answer or `Question cancelled.` — `src/questions.ts:25` `register(request: QuestionRequest, signal?: AbortSignal): Promise<string>`.
2. Registration takes an `AbortSignal` and cancels the entry on abort — `src/questions.ts:30` `const cancel = () => this.cancelEntry(entry);` with `signal.addEventListener('abort', cancel, { once: true })`.
3. Label-or-alias tab lookup is the shared way to address a tab by typed name — `src/tab/lookup.ts:25` `export function byLabelOrAlias(`.
4. The notification kind and its rendered text already exist — `src/notifications/index.ts:8` `export type NotificationEventType =` and `src/notifications/format.ts:43` `notificationText(`.
5. `browserRunning` is the precedent for a per-harness-view flag that a metadata flag reads — `src/tab/types.ts:88` `browserRunning?: boolean;`.

## Existing functionality

1. Per-tab question queue with cancellation — `src/questions.ts:25` `register(`.
2. Label-or-alias tab lookup — `src/tab/lookup.ts:25` `export function byLabelOrAlias(`.
3. The executor contract that this module implements — `src/mcp/tools.ts` (added by `janissary-mcp-server-1-mcp-core.md`), the executor type resolving to `{ text, isError }`.
4. State-dirty broadcast through the message bus — `src/bus.ts` `messageBus.emit('state', { type: 'dirty' })`.
5. The `question-withdrawn` notification kind and text — `src/notifications/index.ts` and `src/notifications/format.ts` (added by `janissary-mcp-server-3-config-and-notifications.md`).

## Implementation steps

1. Add an optional `mcpUsed?: boolean` field to `HarnessView` in `src/tab/types.ts` beside `browserRunning` (`src/tab/types.ts:88`), with a comment that it is set once the harness first calls the MCP server and lights the metadata flag green for the tab's life. It is optional, so no existing tab constructor breaks. Build and check with `$janissary/scripts/run.mjs check-diff`.
2. Create `src/mcp/executor.ts` exporting the local executor that implements the contract from `src/mcp/tools.ts`. It resolves `tab` with `byLabelOrAlias` (`src/tab/lookup.ts:25`), returning the `No tab named "<tab>".` error with `isError: true` when nothing matches. On a match it sets `mcpUsed` on the harness view, emits a dirty state, then awaits `managers.questions.register({ tab: tab.label, kind, question, options }, signal)` and returns the answer as `{ text, isError: false }`. Use `QUESTION_CANCELLED` from `src/questions.ts` as the Cancel result rather than restating the string. Build and check with `$janissary/scripts/run.mjs check-diff`.
3. In the same module, register a one-shot listener on the incoming `AbortSignal` that records `notify(managers, 'question-withdrawn', label)`, formatted `Question from <tab> withdrawn`, while the question is still registered. Keep this as the only path that records that notification. A re-sent remote call must be able to reuse the same in-flight promise; expose the executor as a pure function of `Managers` so the relay in a later subplan can call it without a listener. Build and check with `$janissary/scripts/run.mjs check-diff`.

Nothing starts a listener here; the manager in `janissary-mcp-server-5-local-server-manager.md` injects this executor into the handler. Every touched file stays under the 200-line `max-lines` limit. Relative imports in `src/` carry the `.js` extension per NodeNext.

## UI design

1. The question panel is the existing non-modal `web/src/shared/questions/QuestionPanel.tsx`, rendered for the current tab by `web/src/MountedViewLayers.tsx`; this subplan only drives it through `Questions.register`.
2. The panel's opening focus rule is unchanged: Cancel for `approve`, the text field for `ask` (`web/src/shared/questions/QuestionPanel.tsx:21`).
3. Withdrawal removes the panel and, through `Questions.finish`, shows the next queued question on that tab.

## Tests

- `src/mcp/executor.test.ts` with a fake `Managers`: a valid `ask` and `approve` register on the resolved tab and return the answer; a user Cancel returns `Question cancelled.`; an unknown tab returns the exact `No tab named "x".` error with no registration; an aborted signal withdraws the question, lets the next queued question appear, and records exactly one `Question from <tab> withdrawn` notification (requirements 1–8). Keep `src/questions.test.ts` "holds a second question until the first resolves" and "resolves active and queued questions when their tab closes" passing (preserved behaviors 1, 2).

## Out of scope

- Binding a token to a tab.
- Any HTTP listener, port, or state-file persistence.
- Changing the `question` command parser or its usage text.
- Rendering a new question surface in the web UI.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then, in a unit-level end-to-end check against a real `Questions` instance and fake managers, call the executor with `kind: 'approve'`, answer through `questions.answer`, and confirm the returned text is exactly the chosen option; abort a second call and confirm the panel is withdrawn, the queued question is now active, and one `Question from <tab> withdrawn` line is recorded. A failure is a second registered question after abort or a missing withdrawal line.
