<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Keep a terminated run's final monitor status from reverting to cleanup.

Existing Issue: After a monitor-triggered termination has latched `Terminated`, `src/commands/agent.ts` unconditionally sets the run status to `Cleaning up` when execution returns, and the already-started cleanup promise does not set the terminal status again. Severity: 5/10

Existing Risk: 5/10 - A user who terminates a task can see its monitor remain at `Cleaning up` after its resources have been released, obscuring the actual outcome.

Proposal Risk: 1/10 - Preserving the latched terminal status through the result path leaves `Terminated` visible after cleanup; a status-ordering regression remains possible if another completion path overwrites it.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "preserve the terminated status in the agent monitor". In `src/commands/agent.ts`, do not replace a run's already-latched `terminated` outcome with `Cleaning up`, and ensure the monitor projection retains `Terminated` once cleanup is complete. Add coverage in `src/commands/agent.test.ts` or `src/agent/manager.test.ts` that starts a monitored run, terminates it through the monitor capability while execution is pending, waits for cleanup, and asserts the final `AgentRunView.status` is `Terminated`; retain the existing completed and failed status assertions.
