<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Preserve cleanup warnings when agent monitor creation fails.

Existing Issue: When opening the requested monitor tab throws, `src/commands/agent.ts` waits for run cleanup with `Promise.allSettled` and discards its rejection, so a workspace-release or other cleanup failure is omitted from the returned agent result. Severity: 4/10

Existing Risk: 3/10 - A failed cleanup can leave a workspace or resource behind without the caller receiving the warning needed to understand that the failed run did not fully release its resources.

Proposal Risk: 1/10 - Preserving and returning the cleanup rejection alongside the original monitor-creation failure makes incomplete release visible; the cleanup operation itself can still fail and must remain represented as a warning.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "preserve cleanup warnings when agent monitor creation fails". In `src/commands/agent.ts`, retain the result of `managers.agent.finish` in the `launch.inTab` failure path instead of discarding it through `Promise.allSettled`; carry its cleanup errors to the surrounding failure result while keeping the monitor-creation error as the failed response. Extend `src/commands/agent.test.ts` with a monitor-tab allocation failure and a rejecting workspace/resource cleanup, and assert that the result preserves the original failure and includes the cleanup warning. Keep the existing monitor-failure and cleanup-warning assertions intact.


* Keep a terminated run's final monitor status from reverting to cleanup.

Existing Issue: After a monitor-triggered termination has latched `Terminated`, `src/commands/agent.ts` unconditionally sets the run status to `Cleaning up` when execution returns, and the already-started cleanup promise does not set the terminal status again. Severity: 5/10

Existing Risk: 5/10 - A user who terminates a task can see its monitor remain at `Cleaning up` after its resources have been released, obscuring the actual outcome.

Proposal Risk: 1/10 - Preserving the latched terminal status through the result path leaves `Terminated` visible after cleanup; a status-ordering regression remains possible if another completion path overwrites it.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "preserve the terminated status in the agent monitor". In `src/commands/agent.ts`, do not replace a run's already-latched `terminated` outcome with `Cleaning up`, and ensure the monitor projection retains `Terminated` once cleanup is complete. Add coverage in `src/commands/agent.test.ts` or `src/agent/manager.test.ts` that starts a monitored run, terminates it through the monitor capability while execution is pending, waits for cleanup, and asserts the final `AgentRunView.status` is `Terminated`; retain the existing completed and failed status assertions.
