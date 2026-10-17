<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request description's account of the implementation to include the persisted system-schedule owner and boot-recovery lifecycle.

Existing Issue: The description identifies commit `43846aa7`'s profile and shell-placement behavior as the implementation in the current diff, but commit `56b712a3` instead adds the persisted owner, boot recovery, and system-shell queue integration without describing those changes. Severity: 4/10

Existing Risk: 4/10 - Reviewers relying on the PR summary may miss the new persistence and startup lifecycle behavior when assessing the current implementation.

Proposal Risk: 1/10 - A current summary would accurately direct reviewers to the new behavior, though it would not itself validate the implementation.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1729 "align the PR description with the persisted system-schedule implementation". Update the description's What and verification sections to name the project-owned `SystemScheduleManager`, synchronous store commits, missed-run recovery before scheduler start, and contiguous queue batch delivery, and replace the claim that commit `43846aa7` describes the current implementation with a clear distinction between that earlier change and commit `56b712a3`. Preserve the PR's broader plan-publication context and state plainly which implementation behavior this commit adds; do not imply that the unimplemented grammar, UI, or browser verification has shipped.


* Deliver the plan's focused failure, race, and startup-order tests for persisted system-schedule firing.

Existing Issue: The added owner and boot tests cover successful mutation and firing, save failure on add, exact-cutoff recovery, and interval backlog skipping, but omit the plan's specified recovery-save failure, unsupported-store behavior, preparation/cancellation/disposal races, shell and script failure retries, multiple due-entry independence, and startup gating assertions. Severity: 6/10

Existing Risk: 6/10 - Regressions in save-before-enqueue ordering, cancellation during asynchronous preparation, shutdown disposal, or recovery-before-tick can lose or unexpectedly run scheduled commands without a focused test exposing the failure.

Proposal Risk: 2/10 - Tests around these state transitions would catch regressions in the highest-risk lifecycle paths before they can silently alter persisted schedules or queue commands.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1729 "cover system-schedule recovery, firing failures, and lifecycle races". Extend `src/schedule/system/manager.test.ts` and `src/schedule/system/boot-recovery.test.ts` to cover boot-save failure retaining due entries without firing, invalid and unsupported store loads, unreadable and missing scripts, shell ensure failure and retry, independent processing of multiple due keys, and cancellation or disposal during deferred script reads and shell preparation. Extend `src/index.test.ts` to prove the scheduler does not start or fire before shell preparation and recovery complete, and to verify store or system-shell failure does not block remote reattachment and listening. Assert queue contents and persisted snapshots alongside notices so each test pins the plan's save-before-append and no-replay guarantees; no build, lint, or test command was run during this review.
