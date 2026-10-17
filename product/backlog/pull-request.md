<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's live firing coverage for distinct schedule keys that share a display name.

Existing Issue: The added duplicate-name coverage exercises boot recovery only, while live firing's independent-entry test uses different names and therefore does not pin delivery for same-named schedules with distinct keys. Severity: 5/10

Existing Risk: 5/10 - A future firing change that identifies or advances entries by display name could silently skip one schedule or assign its queue batch the other schedule's provenance.

Proposal Risk: 2/10 - A focused test with duplicate names and distinct keys would make this identity boundary explicit while retaining the existing one-key-per-batch behavior.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1729 "cover live firing of same-named system schedules". In `src/schedule/system/manager.test.ts`, add two due entries with the same display `id` and different immutable `key` values, provide distinct runscripts, and assert one tick enqueues both scripts in their expected order with each batch carrying its own schedule key; also assert both persisted recurring/one-shot outcomes are committed independently. Keep the existing boot duplicate-name test in `src/schedule/system/boot-recovery.test.ts` and the independent-failure coverage intact. This pins the plan's explicitly required live duplicate-name behavior without running build, lint, or test tooling during review.
