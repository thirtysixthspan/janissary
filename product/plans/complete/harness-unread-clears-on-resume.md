# Clear a harness tab's unread badge when the harness resumes work

**Complexity: 3/10**. One new tab-manager method and one shared helper that both busy-transition consumers call. The logic is small. The care is in keeping the local and remote paths identical and in not touching the tracker's own decisions.

## Root cause

Busy tracking only ever raises a harness tab's unread badge. `busyStatusHandler` in `src/harness/busy-status.ts` calls `markUnread` when a transition reports `unread: true`: on a permission gate nothing is going to answer (no `-y`, or the auto-approver has stood down), and on a committed working→idle transition. When the harness then goes back to work, the transition is `{ busy: true, unread: false }` and the handler only calls `addBusy`. Nothing clears the badge. So a gate that was badged and then answered (the auto-approver's keystroke landing after it reported itself stuck, or any other answer that did not involve focusing the tab) leaves the badge on a tab whose harness is busy again. The remote path, `onBusyTransition` in `src/remote/pty-session.ts`, applies transitions the same way and has the same gap.

## Correct behavior

The bug report says the badge should not be shown while the tab is busy: a permission prompt waiting on the user badges the tab, but if auto-approval lets the harness continue, the badge should go away. `product/specs/harness.md` already frames the harness badge as "the harness has either finished its current run or is otherwise waiting". A harness that has resumed working is neither, so when a hidden harness tab's busy tracking reports working again, its unread badge is cleared. If the harness later stops again, the next idle commit or unanswered gate badges it afresh.

## Reproduction

New cases in `src/harness/busy-status.test.ts` (`busyStatusHandler state push`), written before the fix and failing against it:

- "clears a gate's unread badge once the harness resumes work after the prompt is answered": a claude gate with no approver badges the tab (`hasUnread` true, as expected), then a busy-title capture arrives. Observed: `hasUnread` stays `true`.
- "clears an auto-approved gate's unread badge once the harness resumes work": a real `HarnessAutoApprover` answers the gate; an identical repeat capture makes it stand down, badging the tab; then a busy-title capture arrives. Observed: `hasUnread` stays `true`.

## Approach

1. Add `clearUnread(label)` to `TabManager`, delegating to a new `clearUnread` in `src/tab/selection-operations.ts` beside `markUnread`, so the flag is written through the manager rather than poked from the harness code.
2. Add `applyBusyTransition(managers, label, transition)` to `src/harness/busy-status.ts`. A busy transition calls `addBusy` and `clearUnread`; a ready transition calls `deleteBusy` and, when `unread` is set, `markUnread`. `busyStatusHandler` and the remote `onBusyTransition` both call it, so the two paths cannot drift.

The tracker (`BusyTracker`) and the wire frame are unchanged. The tracker already reports a busy transition each time the harness resumes after a not-busy report, which is exactly when the badge should drop.

Rejected: suppressing the badge inside the tracker until the harness has stayed idle for longer. That delays the badge for every genuine wait and still leaves a stale one if the harness resumes later. Also rejected: clearing only a badge the busy handler itself raised. A focused tab clears the flag anyway, and a harness tab's badge has no other meaningful source, so tracking provenance would add state for no observable difference.

## Implementation steps

1. `src/tab/selection-operations.ts` and `src/tab/manager.ts`: `clearUnread`.
2. `src/harness/busy-status.ts`: `applyBusyTransition`, used by `busyStatusHandler`.
3. `src/remote/pty-session.ts`: `onBusyTransition` uses `applyBusyTransition`.
4. Tests: the two replication cases above; the stateful fake gains a real `clearUnread`; the fakes in `src/remote/pty-session.test.ts` and `src/harness/manager.test.ts` gain `clearUnread`; a remote case asserting a busy frame clears the badge; a `selection-operations` case for `clearUnread`.

## Regression test

`src/harness/busy-status.test.ts` › `busyStatusHandler state push` › "clears a gate's unread badge once the harness resumes work after the prompt is answered" and "clears an auto-approved gate's unread badge once the harness resumes work". `src/remote/pty-session.test.ts` guards the remote path.

## Verification

Run `./scripts/run.mjs check-diff`. Live: build the fix and start a scratch instance under `./temp/fix-a-bug/` with a stub `claude` first on the child's `PATH`. The stub shows a claude-shaped permission gate, and after it receives Enter it writes a screen-neutral byte so the next capture repeats the gate (the auto-approver stands down and the tab is badged), then switches its title to a working spinner. The driver launches `harness claude -y --no-workspace --no-browser`, switches back to the first agent tab so the harness tab is hidden, and samples the harness tab's `.tab-badge` and `.dot` over time. Expected: the badge appears while the gate stands, then disappears once the dot is busy again.

Outcome: verified. Against the fixed build the harness tab was never active and went busy (13 samples), idle after the gate was approved (2), idle with the badge once auto-approve stood down (10), busy with no badge while the stub worked again (40), then idle with the badge once it finished (24). No sample was busy with the badge. The same driver against a build of the unfixed source saw the same sequence except that all 39 resumed-work samples were busy with the badge still showing.

## Spec and docs

- `product/specs/harness.md`: say the badge clears when the harness goes back to work.
- `product/specs/tabs.md`: the unread-badge section says the badge stays until the tab is focused; add the harness exception.
- `documentation/user-documentation/advanced-agents/harness.md` already describes when a harness tab is flagged, so it gains a paragraph on the flag clearing when the harness resumes. `help.md` does not describe the badge.

## Out of scope

- The auto-approver's stuck detection itself.
- Unread behavior for shell, ACP, and other non-harness tabs.
