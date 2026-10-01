<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Fix the unread dwell surviving a switch to a tab that carries no badge, so a badge comes off a tab the user has left.

Existing Issue: `beginDwell` in `src/tab/dwell.ts` returns early when the selected tab has no badge, and that early return sits above the `clearPending()` call, so a dwell already armed for a previously badged tab survives the switch and fires three seconds later against the tab the user just left. Severity: 6/10

Existing Risk: 5/10 - Flicking from a badged tab to an ordinary one drops the badge on the tab behind you, which is the exact confusion the dwell was added to remove, and since that badge is what arms the thirty-second harness escalation the same switch also silently cancels a notification the user never received.

Proposal Risk: 1/10 - The behavior becomes the one the plan already specifies, with a covering test pinning it, and the early return keeps its intended effect of arming no timer for a tab with nothing to clear.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1500: clear a pending unread dwell when the newly selected tab carries no badge". In `src/tab/dwell.ts`, move the `clearPending()` call in `beginDwell` above the `if (!tab?.hasUnread) return;` guard so every call to `beginDwell` replaces whatever was pending regardless of whether the new candidate has a badge, then keep the guard so the common case still arms no timer. Add a case to `src/tab/dwell.test.ts` covering the sequence the current suite misses: a badged tab begins a dwell, a second tab with no badge is selected, the interval elapses, and the first tab still carries its badge. The existing case "replaces a pending dwell rather than queueing a second one" does not cover this because both of its tabs are badged, so it reaches `clearPending()` on both calls and passes either way; leave it as the regression guard for the replace path. The four suites that exercise the deferring sites — `src/controller.test.ts`, `src/tab/manager.test.ts`, `src/tab/operations.test.ts`, and `src/tab/split-selection.test.ts` — use fake timers scoped to a single case each and must keep passing untouched. `product/specs/tabs.md`'s dwell paragraph already states the intended invariant, so no spec change is needed.


* Deliver a live tabs-array resolver on the open and activation path, so a dwell there cannot clear a detached copy of a tab.

Existing Issue: `applyOpenResult` in `src/tab/open-result.ts` is the only production caller of `repairPaneSelections` that omits the new `resolveTabs` argument, so the dwell it begins falls back to the `() => tabs` default and captures the array by value, while `removeTabAt` and the reorder computations in `src/tab/reorder.ts` replace every surviving tab with a fresh object. Severity: 6/10

Existing Risk: 5/10 - A close or reorder landing inside the three-second window leaves the dwell writing to a detached copy: the real tab keeps a badge the user cannot clear by looking at it, and because the detached clear still announces itself on the `tabs` channel it also cancels that tab's pending harness escalation, so a harness that finished is badged forever and never announced.

Proposal Risk: 2/10 - The optional-argument pattern is already established across the other five call sites, so this is one more site following it, with the existing dwell tests covering the resolution behavior itself.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1500: pass a live tabs resolver from the open and activation path". Thread the resolver through the one remaining production caller: add an optional `resolveTabs?: () => Tab[]` parameter to `applyOpenResult` in `src/tab/open-result.ts` and pass it as the fourth argument to its `repairPaneSelections` call, then supply it from `applyOpenResult` in `src/tab/selection-operations.ts` as `() => port.tabs` in the same way that function already passes one to `repairPaneSelections`. Once every production caller passes one, consider dropping the `resolveTabs ?? (() => tabs)` fallbacks in `src/tab/dwell.ts`'s callers so a future site cannot silently reintroduce a captured array — but only if the test suites that call those functions directly still compile, since they are the only remaining callers that rely on the default. Add a case to `src/tab/dwell.test.ts` or `src/tab/operations.test.ts` that begins a dwell through the open path, replaces the manager's tabs array with fresh tab objects as a close would, lets the interval elapse, and asserts the live tab's badge comes off. The existing case "resolves the tabs array when the interval is up, not when the dwell began" pins the mechanism directly and must keep passing; it does not cover this caller, which is why the gap survived.


* Cover the four deferring badge sites the plan named but the diff left untested.

Existing Issue: The plan's Tests section requires a case in each of `src/tab/dock.test.ts`, `src/tab/reorder.test.ts`, and `src/tab/cleanup.test.ts` proving that site now defers its clear rather than performing it, plus a `src/tab/manager.test.ts` case for the new `dispose()` releasing a pending dwell, and none of the four files is touched by the diff. Severity: 4/10

Existing Risk: 4/10 - The dwell wiring in `applyDock`'s undock branch, `reorderTabOp`, `reorderTabToOp`, and `closeTabOp` has no test, so a later change that drops the resolver or moves the `beginDwell` call in any of them ships silently, and the plan's stated reason for the per-site cases — that the consolidation of eight clear sites cannot quietly drop one — is exactly what goes unchecked.

Proposal Risk: 2/10 - The cases are additions to existing suites that already build the ports and managers these paths need, and the deferral behavior itself is covered elsewhere, so this closes a coverage gap rather than changing behavior.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1500: add the deferred-clear cases for dock, reorder, close, and the tab manager dispose". Add one case per unwired site, following the fake-timers pattern the diff already introduced in `src/tab/operations.test.ts` and `src/tab/split-selection.test.ts`: in `src/tab/dock.test.ts`, assert that undocking a badged tab back to the center strip leaves its badge set immediately and clears it after `UNREAD_DWELL_MS`, while docking it into a sidebar leaves the badge in place with no dwell armed at all. In `src/tab/reorder.test.ts`, drive `reorderTabOp` and `reorderTabToOp` through the `TabOperationsPort` in `src/tab/operations.ts` on a badged tab and assert the same defer-then-clear shape. In `src/tab/cleanup.test.ts`, close a badged tab and assert the tab that becomes active holds its badge until the interval is up. In `src/tab/manager.test.ts`, begin a dwell through the manager, call the new `dispose()`, and assert the badge survives — the release path `Controller.shutdown` reaches through `MANAGER_DISPOSE_ORDER`. Import `UNREAD_DWELL_MS` from `src/tab/dwell.ts` in each and scope `vi.useFakeTimers()` to the case with a `finally` that restores real timers, so no pending fake timer survives into a later case. The existing cases in the four touched sibling suites must keep passing untouched.


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

