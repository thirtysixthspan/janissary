<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Move the harness escalation's per-tab pending timer off a new label-keyed map and onto the harness tab's own per-tab owner, as the architecture principles require of new per-agent state.

Existing Issue: The escalation keeps its per-tab state in a new module-level `Map<string, NodeJS.Timeout>` keyed by tab label, which is the shape `ai/guidelines/architecture-principles.md` § 2 rules out for new per-agent state and its "How to use these" checklist names explicitly, and it needs a hand-added `cancelHarnessIdleEscalation` in `HarnessManager.closeTab` to be released. Severity: 3/10

Existing Risk: 3/10 - The next per-tab harness concern copies this precedent, and each one adds another release line that the tab-close walk depends on someone remembering, which is the leak pattern principle 6 describes.

Proposal Risk: 2/10 - Holding the handle with the tab's harness runtime makes close and dispose release it through the existing walk, though the remote-harness path still has to be confirmed to reach the same owner.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1500: hold the pending idle escalation with the harness tab's per-tab state rather than a label-keyed module map". Replace the `pending` map in `src/harness/idle-notification.ts` with a handle stored on the owner that already holds each harness tab's per-tab resources: either an optional field on the harness payload of the tab record (`Tab.harness` in `src/tab/types.ts`, excluded from the wire projection in `src/tab/view.ts`), or an entry on the per-PTY runtime that `HarnessRuntimes` in `src/harness/runtime-registry.ts` installs from `src/harness/tab-spawn.ts`, so that `HarnessManager.closeTab` and `HarnessManager.dispose` in `src/harness/manager.ts` release it through `this.runtimes` without a separate call. Before choosing, confirm the remote path — `applyBusyTransition` is reached from `src/remote/pty-session.ts` — resolves the same owner for a remote harness tab, and note that `removeTabAt` in `src/tab/reorder.ts` spreads each surviving tab into a new object, so a field on the tab record must be read through `managers.tab.byLabel` at cancel time rather than captured. Keep `armHarnessIdleEscalation`, `cancelHarnessIdleEscalation` and `disposeHarnessIdleEscalations` as the module's public surface so `src/harness/busy-status.ts` and the bus subscription do not change. `src/harness/idle-notification.test.ts`, the escalation block of `src/harness/busy-status.test.ts`, and the arm and cancel cases in `src/remote/pty-session.test.ts` cover the behavior that must not move.


* Correct the harness spec's placement and wording of the new idle-escalation section, which splits the busy/ready section and claims cancellations the code does not perform.

Existing Issue: In `product/specs/harness.md` the new `### The idle escalation` heading is inserted in the middle of § Busy/ready status, so the pre-existing paragraphs on a recognized permission prompt badging immediately and on harnesses without recognition signals now sit under the escalation heading, and the section says clearing cancels the escalation when the tab "is reordered or undocked and something else becomes active" — a claim the matching `src/harness/idle-notification.ts` header comment repeats as "reordered away" — although neither operation clears a hidden harness tab's badge. Severity: 3/10

Existing Risk: 3/10 - The spec is declared authoritative, so a reader or agent following it either expects a reorder to silence a pending notification or misfiles the permission-prompt rule as part of the escalation.

Proposal Risk: 1/10 - A documentation-only correction with no behavior change, whose only hazard is wording that drifts from the code again.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1500: move the harness spec's idle-escalation section after the busy/ready paragraphs and correct its cancellation list". In `product/specs/harness.md`, move the two paragraphs that currently follow § The idle escalation — the one beginning "When claude, opencode, or codex shows a recognized permission prompt" and the one beginning "A harness without its own recognition signals" — back above the `### The idle escalation` heading so § Busy/ready status is contiguous and the escalation's reference to "an unanswered permission gate" follows the paragraph that defines it. In the escalation's cancellation sentence, replace "or it is reordered or undocked and something else becomes active" with the routes that actually cancel: a completed dwell (`src/tab/dwell.ts`), the harness going busy again (`applyBusyTransition` in `src/harness/busy-status.ts`), the tab being shown in the other split pane (`repairPaneSelections` in `src/tab/split-selection.ts`), and the tab closing (`HarnessManager.closeTab` in `src/harness/manager.ts`). Make the same correction to the header comment in `src/harness/idle-notification.ts`, dropping "or reordered away". No code or test changes; confirm the cross-references from `product/specs/notifications.md` and `product/specs/tabs.md` to "harness.md § The idle escalation" still resolve.


* Correct the pull request description's claim that clicking the toast focuses the waiting harness tab, which the toast path does not do.

Existing Issue: The description says "Clicking the feed line or the toast focuses the tab" and its manual step 2 says "Clicking either focuses the tab", and the plan's product decision 8 says the toast links back to the tab, but the toast `deliverNotification` emits carries only `from`, `message` and `color`, and `ToastStack` answers a click with `revealNotifications`, so a toast click opens the feed rather than the tab. Severity: 4/10

Existing Risk: 4/10 - A reviewer or manual tester following step 2 sees the toast open the feed, records a bug against correct code or approves a promise the change does not keep, and the plan's record of what shipped is wrong for whoever extends the toast next.

Proposal Risk: 1/10 - A wording correction in the description and the plan, leaving behavior unchanged, so the only residual hazard is the two statements drifting again.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1500: correct the description and plan claim that a harness-idle toast click focuses the tab". The toast emitted by `deliverNotification` in `src/notifications/deliver.ts` has no `openTab` field (see the `toast` member of `NotificationsEvent` in `src/bus.ts`), and `web/src/toasts/ToastStack.tsx` sends `revealNotifications` on click, so the toast reaches the tab only by revealing the feed, whose line carries the `openTab` link. Rewrite the pull request description's sentence "Clicking the feed line or the toast focuses the tab" and manual verification step 2 to say the feed line's link focuses the tab and a toast click reveals the feed where that line is; and amend product decision 8 in `product/plans/complete/harness-idle-notification.md`, which says the line and the toast both link back, to the same effect. Do not add a link to toasts here — that is a wire change to every toast and belongs to its own plan. `product/specs/notifications.md` already describes only the line as a link and needs no change; confirm `documentation/user-documentation/tab-types/notifications.md` likewise only promises the feed's link.


* Deliver the plan's notification test that pins the new event as explicit, firing with no configuration.

Existing Issue: The plan's tests section requires `src/notifications/index.test.ts` to show that `harness-idle` is in `EXPLICIT_EVENTS` and that `shouldNotify` returns it true with no config present, but the diff adds only a feed-line link case, so the "works with no setup" property the plan's classification decision rests on is untested. Severity: 2/10

Existing Risk: 2/10 - A later edit that moves `harness-idle` behind a toggle would leave the feature silently inert for default configs with no test going red.

Proposal Risk: 1/10 - A few assertions in an existing suite, whose only hazard is a test pinning the wrong expectation.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1500: add the planned shouldNotify test for harness-idle". In `src/notifications/index.test.ts`, add a `describe` block beside the other explicit-event blocks asserting `EXPLICIT_EVENTS['harness-idle']` is true, that `shouldNotify` (from `src/notifications/index.ts`) returns true for `harness-idle` with an undefined config and with every ambient toggle off, that it fires when the tab is the active one, and that it never targets the notifications tab itself, matching the shape of the existing `question` and `plugin-note` blocks. No production code changes; the existing format and line-composition cases must keep passing.
