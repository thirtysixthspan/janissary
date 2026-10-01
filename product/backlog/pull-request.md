<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Start the unread dwell when an open activates a badged tab in a strip with no split, as clicking that tab already does.

Existing Issue: `repairPaneSelections` in `src/tab/split-selection.ts` returns early when either pane holds no center tabs, before it reaches its `beginDwell` call, so on a strip with no split the open and activation path in `applyOpenResult` arms no dwell at all — while the same user action by click, `next`, or the arrow keys goes through `setActiveTabOp` and does. Severity: 5/10

Existing Risk: 4/10 - Two routes to the same state disagree: a badged tab reached by `open` keeps its flag indefinitely while the same tab reached by clicking it loses the flag after three seconds, so the badge stops meaning "unread" and becomes a property of how the user navigated rather than of what they have read.

Proposal Risk: 2/10 - The early return exists to avoid pane bookkeeping that has nothing to repair, so the change is to dwell before it rather than to restructure it, and the deferral semantics are already pinned by the four suites covering the split paths.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1500: dwell on the unsplit open and activation path". In `repairPaneSelections` in `src/tab/split-selection.ts`, begin the dwell for the tab that is active after the selection is resolved *before* the early return for a strip with no split, so the open path dwells the same tab `setActiveTabOp` dwells. Keep the early return itself: it is there to skip pane assignment that has nothing to repair, and the tab that is active in an unsplit strip is `activeTab` as passed in, so no `centerTabs` filtering is needed to name it. Be careful that the split path does not then dwell twice — either move the existing `beginDwell` above the early return so one call covers both, or leave it where it is and add the unsplit case alongside. Add a case to `src/tab/manager.test.ts` beside "clears the live tab's badge after a close replaces the array mid-dwell" that badges a tab in an unsplit strip, activates it through `applyOpenResult`, and asserts the badge is still set immediately and gone after `UNREAD_DWELL_MS`. The split-path dwell cases in `src/tab/split-selection.test.ts` and `src/tab/operations.test.ts` must keep passing untouched, and `product/specs/tabs.md` already states the invariant this restores, so no spec change is needed.


* Stop the new test blocks from unsubscribing the escalation listener they are meant to be testing.

Existing Issue: The `afterEach` in `src/harness/idle-notification.test.ts` and in the new `busyStatusHandler idle escalation` block in `src/harness/busy-status.test.ts` call `messageBus.clear()`, which drops every registered listener including the module-scope `unread-cleared` subscription in `src/harness/idle-notification.ts`, so from the second case onward those files exercise no subscription at all and the cancel-by-badge-clear path passes only because the fire-time `!tab.hasUnread` backstop catches the same case. Severity: 5/10

Existing Risk: 4/10 - Deleting the subscription outright would leave every test in both files green while removing the mechanism that cancels an escalation the moment its badge comes off, which is the load-bearing half of the feature, and the tests currently named for it would keep certifying it.

Proposal Risk: 2/10 - Removing the global clear in favor of the per-test unsubscribe those files already use leaves the fire-time backstop as a second line of defense, and the new assertion makes the cancel path distinguishable rather than incidental.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1500: stop the escalation tests from clearing the bus subscription under test". Remove `messageBus.clear()` from the `afterEach` in `src/harness/idle-notification.test.ts` and from the new block's teardown in `src/harness/busy-status.test.ts`; both files already unsubscribe the listeners they register inside each case, and `MessageBus.clear` exists for suites that own every listener on the bus, which these two do not now that a module-scope subscriber is in play. Then add an assertion to each cancel case that distinguishes the subscription from the backstop: after the badge is cleared, arm the escalation a second time and advance to just short of the interval, asserting nothing has been recorded, then advance past it and assert exactly one notification. If the first escalation had survived uncancelled it would also fire within that window and produce a second notification, so the case fails if the subscription is gone. `messageBus.clear()` is legitimate in the other suites that call it — `src/tab/dwell.test.ts` imports no module with a module-scope subscriber — so leave those alone. The `src/remote/pty-session.test.ts` arming and cancel cases exercise the same path through a different entry point and must keep passing untouched.


* Correct the pull request description's count of the new unread dwell test cases.

Existing Issue: The description's "How to verify" section states that `src/tab/dwell.test.ts` contributes 11 cases, and the file contains 10. Severity: 2/10

Existing Risk: 1/10 - A reviewer spot-checking the one number the description offers as evidence of coverage finds it wrong, which invites doubt about the figures around it that are correct.

Proposal Risk: 1/10 - Correcting a count in prose cannot affect behavior.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1500: correct the description's unread dwell test case count". In the pull request body's "How to verify" section, change the dwell test file's case count from 11 to 10, and while in the same sentence confirm the two neighbouring counts still hold — `src/harness/idle-notification.test.ts` has 11 and the `busyStatusHandler idle escalation` block in `src/harness/busy-status.test.ts` has 7. Prefer phrasing the figures so a later added or removed case does not make the description stale again. Do not change any test file as part of this; the counts are correct in the code and only the description is wrong.

