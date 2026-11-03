<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's requirement that ACP cancellation waits for both the notification write and provider-turn drain before releasing the old turn.

Existing Issue: `AcpPromptControl.cancel` races the cancellation-send promise against provider drain, then clears `notificationPending` whichever finishes first, so provider drain alone can release the old turn while the notification write is still pending or will fail. Severity: 8/10

Existing Risk: 8/10 - A late cancellation notification can reach the reused session after a successor prompt starts and cancel that prompt, while a failed notification can be reported as a successful cancellation.

Proposal Risk: 2/10 - Releasing the turn only after both independent boundaries complete prevents a late native cancel from crossing into a successor while preserving the close path's ability to release waiters.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "wait for both ACP cancellation boundaries before releasing a turn". In `src/acp/prompt-control.ts`, change `AcpPromptControl.cancel` so success requires both the cancellation notification promise and that turn's drain signal to complete; do not let provider drain stand in for notification completion or notification completion stand in for provider drain. Preserve `release()`'s ability to settle cancellation waiters when the session closes or transport is lost, and preserve rejection propagation so adapters follow their existing fatal cancellation path. Extend `src/acp/prompt-control.test.ts` with a provider-first case that leaves the notification pending, verifies the terminal callback and next admission remain blocked, then resolves the notification and verifies release; also reject the notification after provider drain and verify no successful terminal callback is published. The existing local adapter cancellation tests in `src/acp/index.test.ts` and remote adapter drain/reuse tests in `src/remote/acp-session.test.ts` must continue proving that the next prompt is admitted only after the original turn is safe to release.
