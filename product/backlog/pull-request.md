<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Complete the plan's documentation of system-schedule persistence and aggregate-row deletion.

Existing Issue: The startup guide says scheduled commands disappear on every launch while system schedules persist, and the aggregate-list guidance describes only open-tab schedules and says row deletion behaves like name-based cancellation even though system rows are durable and deleted by key. Severity: 5/10

Existing Risk: 5/10 - Users may expect project schedules to vanish on restart or may believe deleting one duplicate-name row removes every matching system schedule.

Proposal Risk: 2/10 - The restart and row-action behavior will be described accurately, though users may still overlook the guidance.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1729 "document persistent system schedules and keyed aggregate deletion". Update `documentation/user-documentation/getting-started/startup.md` to distinguish tab-owned schedules that disappear at restart from project-owned system schedules that persist. Update the aggregate-list section of `documentation/user-documentation/automation/scheduling.md` and `product/specs/scheduling.md` to state that the list includes system schedules even without a visible system shell, focusing a system row reveals or recovers that shell, and deleting a system row removes only its key while `schedule system cancel <name>` removes all same-named entries. Preserve the documented tab-owned deletion behavior. No tests are needed for this documentation-only correction.


* Avoid announcing an empty system runscript batch as a completed firing.

Existing Issue: `appendSystemBatch` posts the system-schedule firing notice even when the runscript contains no executable lines and nothing is enqueued. Severity: 3/10

Existing Risk: 4/10 - A user can receive a notice saying a runscript was enqueued when that valid empty script performed no work, which makes the firing feed misleading.

Proposal Risk: 1/10 - Empty scheduled scripts will advance without a false enqueue notice, while nonempty batches retain the existing notice.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1729 "suppress the firing notice for empty system runscript batches". In `src/schedule/system/firing.ts`, avoid calling `notifySystemScheduleRun` when `lines` is empty while retaining the successful schedule advancement and no-row enqueue behavior. Add coverage in `src/schedule/system/manager.test.ts` that an empty one-shot advances or is removed without a firing notice and that a nonempty runscript still queues its lines and posts the notice; `src/notifications/system-schedule.integration.test.ts` documents that the notice means the runscript was enqueued.
