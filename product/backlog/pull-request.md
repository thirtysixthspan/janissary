<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Avoid announcing an empty system runscript batch as a completed firing.

Existing Issue: `appendSystemBatch` posts the system-schedule firing notice even when the runscript contains no executable lines and nothing is enqueued. Severity: 3/10

Existing Risk: 4/10 - A user can receive a notice saying a runscript was enqueued when that valid empty script performed no work, which makes the firing feed misleading.

Proposal Risk: 1/10 - Empty scheduled scripts will advance without a false enqueue notice, while nonempty batches retain the existing notice.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1729 "suppress the firing notice for empty system runscript batches". In `src/schedule/system/firing.ts`, avoid calling `notifySystemScheduleRun` when `lines` is empty while retaining the successful schedule advancement and no-row enqueue behavior. Add coverage in `src/schedule/system/manager.test.ts` that an empty one-shot advances or is removed without a firing notice and that a nonempty runscript still queues its lines and posts the notice; `src/notifications/system-schedule.integration.test.ts` documents that the notice means the runscript was enqueued.
