# Badge pending-question tabs while the ACP query is open

**Complexity: 4/10** — ~18 added lines across 4 production files, 5 requirements and 6 scenarios (p=4.93)

## Goal

A pending question is the agent asking the human for attention, but the question badge currently goes through the shared unread helper, which refuses to badge a tab whenever an ACP prompt is set — exactly the state of an agent that has just asked and is waiting for the answer. The tab strip therefore never shows the badge the spec promises. This fix gives questions their own unread path that still respects the ordinary visibility rules while skipping only the awaiting-ACP suppression.

## Requirements

1. "make pending questions badge their tab even while the agent's ACP query is open": registering a pending question on a non-focused tab raises `hasUnread` even when that tab has a prompt set on one of its ACP roles.
2. "Add a question-specific badge path that applies the dock, active-tab, and secondary-pane checks but not the awaiting-ACP check": the question path badges only a tab that is not docked, not active, and not the other split pane's visible selection.
3. "leave every other markUnread caller on the current rule so shell output and streaming ACP content keep their documented behavior": the ordinary `markUnread` path continues to refuse a badge on a tab whose ACP role has a prompt set.
4. "Align the unread sentence in product/specs/agent-questions.md with the resulting behavior": the question spec states that the unread badge appears even while the asking agent's ACP query is still awaiting an answer.
5. "record the exception beside the awaiting-ACP suppression in product/specs/tabs.md": the unread-badge spec names the pending question as the one exception to the awaiting-ACP suppression.

## Design decisions

- The question path is a new helper in `src/tab/transcript/events.ts` alongside `markUnreadTab`, not a flag or option threaded through the shared helper, so an ordinary caller cannot pick up the exception by accident.
- The dock, active-tab, and secondary-pane checks are extracted into one shared visibility predicate used by both paths, so the two paths cannot drift on the rules they do share (Assumption 2).
- The new helper is exposed through the same selection port and `TabManager` method pattern as `markUnread`, keeping the controller's call site symmetric with the existing one (Assumption 4).
- The exception applies only at question-registration time; the ACP prompt's lifetime and the badge's dwell-based clearing are untouched (Assumption 3).

## Preserved behavior

1. An ordinary unread raise still suppresses the badge while an ACP query is outstanding; it must not badge a tab for streaming ACP output or tool steps until the response arrives. Pinned by `does not badge a tab whose ACP query has not resolved, and badges it once the query settles` in `src/tab/transcript/events.test.ts`.
2. A question on the active tab still raises no unread badge; it must not set `hasUnread` on the tab the user is looking at. Pinned by `does not mark the active tab unread when a question becomes pending for it` in `src/controller/create-managers.test.ts`.
3. A question on a background tab still records `Question from <tab>` in the notifications feed; the badge change must not remove the notification. Pinned by `marks a background tab unread when a question becomes pending and still notifies` in `src/controller/create-managers.test.ts`.

## Assumptions

1. `src/controller/create-managers.ts:62` `managers.tab.markUnread(label);` is the only question-badge call site.
2. `src/tab/transcript/events.ts:90` `const awaitingAcp = Object.values(tab.runtime?.acpRoles ?? {}).some((state) => state?.prompt !== undefined);` is the sole suppression signal, combined at `src/tab/transcript/events.ts:91` with `!tab.dock && !awaitingAcp && label !== activeLabel && label !== secondaryLabel`.
3. `src/acp/manager.ts:140` `acpRoleRuntime(runtime, attempt.role).prompt = request;` holds the prompt for the whole tool loop, and `src/acp/response.ts:91` `delete state.prompt;` clears it only when the query settles.
4. `src/tab/manager.ts:154` `markUnread(label: string): boolean { return selectionOperations.markUnread(this, label); }` is the port-method pattern the new method follows.

## Existing functionality

1. `src/tab/transcript/events.ts:98` `markUnreadTab` raises `hasUnread` and reports whether the tab was eligible.
2. `src/tab/selection-operations.ts:18` `markUnread` is the port wrapper that supplies the active and secondary labels to the raise helper.
3. `src/tab/root-tab-test-fixture.ts:18` `seedTestTab` seeds a background tab in controller tests.
4. `src/acp/prompt-state.ts:14` `AcpPendingPrompt` is the shape a test can set on an ACP role to put a tab in the awaiting-query state.

## Implementation steps

1. In `src/tab/transcript/events.ts`, extract the dock/active/secondary checks out of `isUnreadEligible` into a shared visibility predicate, leave `isUnreadEligible` returning that predicate AND the existing `!awaitingAcp` condition, and add `markUnreadQuestionTab` that raises `hasUnread` on an eligible tab without consulting `awaitingAcp`. Build command: `$janissary/scripts/run.mjs check-diff`.
2. In `src/tab/selection-operations.ts`, add a `markUnreadQuestion` port function that calls `markUnreadQuestionTab` with the port's tabs, active label, and secondary label. Build command: `$janissary/scripts/run.mjs check-diff`.
3. In `src/tab/manager.ts`, add a `markUnreadQuestion(label)` method delegating to the new port function, beside the existing `markUnread` method. Build command: `$janissary/scripts/run.mjs check-diff`.
4. In `src/controller/create-managers.ts`, change the question-pending callback to call `managers.tab.markUnreadQuestion(label)` in place of `managers.tab.markUnread(label)`, leaving the dirty emit, the active-tab guard, and the notification untouched. Build command: `$janissary/scripts/run.mjs check-diff`.
5. Add the regression test described in Tests to `src/controller/create-managers.test.ts` without editing the existing background-tab and active-tab question tests. Build command: `$janissary/scripts/run.mjs check-diff`.
6. Update the Notifications paragraph of `product/specs/agent-questions.md` and the Marking paragraph of `product/specs/tabs.md` as described in Requirements 4 and 5. Build command: `$janissary/scripts/run.mjs check-diff`.
7. Promote the plan, remove the resolved backlog entry, and publish one conventional commit to the PR branch. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None new. The change only makes the existing tab-strip unread flag appear in one more state; no component, style, focus behavior, key binding, or question-panel behavior changes.

## Tests

1. Requirement 1 and 2: in `src/controller/create-managers.test.ts`, add a controller test that seeds a background tab, sets a pending prompt on that tab's `ask` ACP role, activates another tab, registers a question on the background tab through `managers.questions`, and asserts the background tab now has `hasUnread` set.
2. Requirement 3: the existing unread tests in `src/tab/transcript/events.test.ts` and the existing question tests in `src/controller/create-managers.test.ts` keep passing unchanged.

## Out of scope

- Changing the ordinary `markUnread` suppression for shell output, streaming ACP content, or any other non-question caller.
- Changing when ACP prompts are set or settled, the busy dot, the notification feed, or the dwell that clears a badge.
- User and developer documentation edits.
- Help page changes; no command, flag, or key binding is introduced or changed.

## Verification

1. `$janissary/scripts/run.mjs check-diff` passes.
2. Manual: run the app, open an agent tab and a second tab, start an ACP turn in the agent tab that stops to ask a question while its turn is still running, then focus the second tab. The asking tab's strip must show the unread flag while its busy dot still blinks. A failure looks like no flag appearing until the answer is submitted and the ACP prompt clears. As a control, ordinary streaming ACP output in a background tab must still show no badge until its query settles.
