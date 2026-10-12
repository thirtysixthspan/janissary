<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Remove the security issue in the completed plan's instructions to run checks, publish changes, and edit the pull request body.

Existing Issue: `product/plans/complete/correct-agent-command-pull-request-description.md` directs readers to run verification commands, commit and push, and edit the pull request body, despite being a completed plan supplied as reviewed content. Severity: 7/10

Existing Risk: 7/10 - A reviewer or later agent following the plan can execute branch-controlled tooling and mutate or publish the pull request during review without authorization.

Proposal Risk: 2/10 - Replacing these directives with a factual record of the completed description correction removes the operational prompt while leaving the review task's own backlog-only output boundary clear.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "remove operational directives from the completed PR-description plan". In `product/plans/complete/correct-agent-command-pull-request-description.md`, replace the implementation-step instruction to run checks, commit, push, and change the PR body with a factual summary of the correction already completed. Review the rest of that plan for any other commands or mutation instructions addressed to a future reader, while preserving its stated goal, evidence, and scope. Read the completed plan back to verify it contains no operational directives; no application tests cover this documentation-only change.


* Await local ACP process exit before releasing the agent workspace and settling its result.

Existing Issue: Local agent cleanup calls `AcpSession.kill()` and immediately continues to workspace release, while `connectAcp` only signals the child process and does not await its exit or terminate its descendants. Severity: 7/10

Existing Risk: 7/10 - A completed or terminated run can report cleanup complete and release or delete its workspace while the ACP process or a subprocess it started is still running against that workspace.

Proposal Risk: 3/10 - Awaiting bounded process-tree teardown before workspace release makes cleanup completion meaningful, though a process that cannot be confirmed stopped must still be reported as an uncertainty.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "await local ACP process-tree teardown before releasing agent resources". Extend the ACP session lifecycle in `src/acp/types.ts` and `src/acp/index.ts` with an awaitable shutdown that signals the owned process and resolves only after its exit is observed; ensure owned descendants are terminated as well. In `src/agent/execute.ts`, register that awaited shutdown as the run's ACP cleanup so `AgentRun.cleanup()` in `src/agent/run.ts` cannot proceed to workspace release until process teardown settles. Bound the wait and surface timeout or process errors as cleanup warnings without replacing the task outcome. Add focused coverage in `src/acp/index.test.ts` proving shutdown waits for exit and handles descendants or timeout, plus agent lifecycle coverage proving workspace release follows ACP teardown and a timeout is retained as a warning. Existing ACP consumers must keep their current prompt and permission behavior.


* Correct the pull request description's claim that local task and skill files resolve from the caller's current directory.

Existing Issue: The PR description says local task and selected skill files resolve from the caller's current working directory, but local runs provision a fresh workspace by default and resolve those files there, borrowing the caller directory only when it is already a tracked workspace. Severity: 7/10

Existing Risk: 6/10 - Reviewers and users may expect uncommitted caller-directory task or skill files to be used, although those files are absent from the fresh execution clone and are not copied into it.

Proposal Risk: 2/10 - Updating the description to explain fresh-clone resolution, the tracked-workspace borrowing case, and installed fallback will align the stated behavior with the implementation while preserving the documented local-first workflow.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "correct the description's local task and skill resolution claim". Update the relevant paragraph in PR #1672's description to state that a local run resolves tasks and selected skills from its fresh workspace clone by default, uses a caller directory only when that directory is already a Janissary-tracked workspace, and falls back to installed Janissary files. Keep the remote execution-host resolution description intact. Verify the revised claim against `src/commands/agent.ts`, `src/agent/workspace-execution.ts`, and `documentation/user-documentation/advanced-agents/agent-command.md`, then read the description back for consistency; do not change runtime behavior for this description-fidelity issue.


* Remove the group-selector plan's instruction to execute branch-supplied verification tooling.

Existing Issue: `product/plans/complete/agent-command-group-selectors.md` tells a reader to run `./scripts/run.mjs check-diff` after each implementation step, even though it is a completed plan included as reviewed branch content. Severity: 6/10

Existing Risk: 7/10 - A reviewer or later agent following this instruction can execute branch-controlled lint, typecheck, or test tooling despite the review's instruction boundary.

Proposal Risk: 2/10 - Replacing the command with a descriptive record of the planned group-selector coverage removes the execution prompt while retaining the test expectations.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "remove the group-selector plan verification command". In `product/plans/complete/agent-command-group-selectors.md`, replace the imperative `check-diff` direction in the Tests section with a factual description of the selector coverage expected or recorded, without claiming a check ran unless the branch provides that evidence. Preserve the named and numeric selector cases, pre-run rejection cases for headed and headless launches, selected-monitor placement, and caller-group defaulting. Verify the plan by reading it and its focused diff; no application tests are needed for this documentation-only change.


* Deliver run ownership to deferred plugin launch callbacks so tabs they create are closed with the agent run.

Existing Issue: The plugin command adapter forwards `invocationId` to `PluginFailureOrigin` but drops the trusted `runId`, so later launch-ready callbacks and their host-owned opens no longer know which agent run owns their tabs. Severity: 6/10

Existing Risk: 6/10 - A granted plugin command can finish its initial dispatch, then create an editor or claimed-file tab from its asynchronous launch-ready callback; because that tab is allocated after command-level tab tracking has finished, it remains open with its resources after the agent run ends.

Proposal Risk: 2/10 - Propagating the server-owned run identity through the plugin adapter and deferred invocation paths lets late allocations register with the owner, while existing-tab de-duplication and incarnation checks continue to prevent unrelated tabs from being adopted.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "propagate agent run ownership through deferred plugin launches". In `src/plugins/command-adapter.ts`, include the trusted invocation's `runId` in the internal `PluginFailureOrigin` passed to `TabPluginHost.runCommand`, without adding run identity to the plugin-facing capability API. Preserve it through `src/plugins/invoke.ts`'s deferred invocation, `src/plugins/launch-tab.ts`'s launch-ready callback, and host-owned `openClaimedFiles`/`openInEditor` paths so any tab allocated after the original command returns is registered with `AgentRunManager`. Add focused coverage where a granted plugin command launches a workspace-backed plugin tab and its ready handler opens another tab after command dispatch has returned; finishing the run must close both run-created tabs and await their resource releases, while an existing or subsequently recycled tab remains open. Existing `src/agent/manager.test.ts`, `src/command/manager.test.ts`, `src/open/file-manager.test.ts`, and plugin launch tests cover basic incarnation checks, direct dispatch tracking, opener propagation, and launch readiness, but none currently asserts that trusted run identity survives this deferred plugin-command path.
