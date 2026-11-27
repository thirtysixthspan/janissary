# feat: mark a tab unread for every question raised on it

**Complexity: 2/10** — ~4 added lines, 1 file, 3 requirements (p=3.61)

## Goal

Make a question raised on a tab that is not focused set that tab's unread flag, on top of the notification it already records. Today the `Questions` change callback only records `Question from <tab>`; the unread badge is what the user actually notices, so every question source — MCP tool, ACP agent or command line — should raise it. This is independent of the MCP server and lands first.

Source: `./product/plans/complete/janissary-mcp-server.md`. Depends on no earlier subplan.

## Requirements

1. A question on a tab that is not focused sets that tab's unread flag — feature text: "throw the unread flag on the tab if it is not focused."
2. The unread flag is set for every question raised on an unfocused tab, whether it comes from the MCP tool, an ACP agent, or the command line — user answer: "All questions".
3. The `Question from <tab>` notification is still recorded alongside the unread flag — user answer: "The notification stays".

## Design decisions

- The unread marking belongs in the single `Questions` change callback, so it covers every registration path automatically rather than being added at each caller. `TabManager.markUnread` already refuses the active tab, the other pane's visible tab and docked tabs, so no new eligibility rule is introduced. User answer: "All questions".
- The existing `Question from <tab>` notification is kept, not replaced: the flag and the feed line are two surfaces for one event.

## Preserved behavior

1. A question on the already-active tab records no `Question from <tab>` notification. Negative assertion: the new unread marking must not add a notification or an unread flag for the focused tab. Test: `src/controller/create-managers.test.ts` "does not notify when the question is pending for the already-active tab".
2. A docked tab never gets the unread flag. Negative assertion: question unread marking must not set `hasUnread` on a docked tab. Test: `src/tab/manager.test.ts` "append does not mark a docked, non-active tab unread".

## Assumptions

1. Unread marking already refuses the active tab, the other pane's visible tab, and docked tabs — `src/tab/transcript/events.ts:102` `if (!tab || !isUnreadEligible(tab, label, activeLabel, secondaryLabel)) return false;`.
2. A question is registered against a tab label and resolves to the answer or `Question cancelled.` — `src/questions.ts:25` `register(request: QuestionRequest, signal?: AbortSignal): Promise<string>`.
3. The pending-question change hook dirties state and records the `Question from <tab>` notification — `src/controller/create-managers.ts:59` `managers.questions = new Questions(`.

## Existing functionality

1. Unread marking for a tab label — `src/tab/manager.ts:154` `markUnread(label: string): boolean`.
2. The pending-question change hook that dirties state and records the notification — `src/controller/create-managers.ts:59` `managers.questions = new Questions(`.
3. Per-tab question queue with cancellation — `src/questions.ts:25` `register(`.

## Implementation steps

1. In the `Questions` change callback at `src/controller/create-managers.ts:59`, when `pending` is set and the tab is not the current tab, call `managers.tab.markUnread(label)` beside the existing `notify(managers, 'question', label, undefined, { openTab: label })`. Do not add a second eligibility check: `markUnread` already handles focus and docking. Update `product/specs/agent-questions.md` § Notifications to say the tab is also marked unread. Build and check with `$janissary/scripts/run.mjs check-diff`.

## UI design

1. The unread flag is the existing tab-strip unread badge (`product/specs/tabs.md` § Unread badge); no new control or color is introduced.

## Tests

- `src/controller/create-managers.test.ts`: a question pending on a background tab marks it unread and still notifies; a focused tab is neither marked nor notified (requirements 1, 2, 3). Keep the two preserved-behavior tests named above passing unchanged.

## Out of scope

- Changing how the notification is formatted or toggled.
- Changing the unread eligibility rules for transcript output.
- Any MCP-specific behavior; this change applies to all question sources.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then start the app, open `question ask "Ship it?"` on a second tab from the command line of the current tab, and confirm the second tab gets the unread badge while the notifications feed shows `Question from <tab>`; switching to that tab clears the badge. A failure is a badge that never appears or a notification that disappeared.
