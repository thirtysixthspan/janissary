<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Remove executable verification directions from the newly added ACP teardown plans.

Existing Issue: The completed local ACP teardown and process-group plans instruct readers to run `./scripts/run.mjs check-diff`, leaving branch-supplied tooling commands in reviewed content. Severity: 6/10

Existing Risk: 7/10 - A reviewer or later agent following either completed plan can execute branch-controlled lint, typecheck, and test tooling despite the review's explicit command boundary.

Proposal Risk: 2/10 - Replacing these commands with factual coverage descriptions removes the execution prompt while preserving the teardown and EPERM test expectations.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "remove ACP teardown plan verification commands". In `product/plans/complete/await-local-acp-process-tree-teardown.md` and `product/plans/complete/report-unqueryable-acp-process-groups.md`, replace the imperative `check-diff` directions with descriptive summaries of the coverage already recorded in each plan, without claiming verification that the branch does not establish. Preserve the assertions for awaited local process-tree shutdown, timeout escalation, EPERM probe behavior, ESRCH absence, and ACP spec updates. Re-read both plans and `product/plans/complete/remove-operational-directives-from-reviewed-plans.md` to keep their inspection scope accurate; no application checks are needed for this documentation-only correction.


* Deliver the planned remote host override for local agent callers.

Existing Issue: The ready feature plan says `on <host>` overrides a remote shell's execution host and project, but the implementation requires the selected host to already match an attached remote workspace, so a local caller cannot use the selector and a remote caller cannot switch hosts. Severity: 7/10

Existing Risk: 6/10 - Users cannot target a distinct remote execution host as the finalized launch design promises, and the redundant selector gives a narrower capability than the command grammar suggests.

Proposal Risk: 3/10 - Resolving the override through the existing remote connection and workspace mechanisms, with explicit refusal when connection or project resolution fails, makes host selection usable without silently falling back to local execution.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "deliver the planned remote host override for agent runs". Implement the `on <host>` behavior stated in `product/plans/ready/add-a-new-agent-command.md` so it can select an execution host distinct from the local caller or its current remote host, and resolve a pathless target using the established SSH login-directory project lookup. Trace the selected target through parsing and validation in `src/agent/command-parser.ts` and `src/commands/agent.ts`, remote session/channel setup in `src/remote/manager.ts` and `src/remote/channel/index.ts`, and task/skill snapshot resolution on the execution host. Keep granted Janissary commands bound to the original caller context and preserve no-local-fallback behavior. Update `product/specs/agent-command.md`, the remote execution plan's stated scope, and the user guide to match the supported selector semantics. Extend `src/commands/agent.test.ts` and focused remote manager/channel tests for local-to-remote selection, switching from one established remote host to another, pathless project resolution, and unavailable-target failure; preserve the existing established-workspace sharing and cleanup cases.


* Revalidate run ownership before deferred plugin launches can allocate tabs.

Existing Issue: The plugin command adapter preserves the trusted run ID through deferred launch-ready callbacks, but those callbacks and their host allocation capabilities can still create tabs after the run has ended, when `AgentRunManager.trackCreatedTab` can no longer attach the tabs to cleanup. Severity: 7/10

Existing Risk: 7/10 - A workspace-backed plugin callback that resumes after task completion can leave a tab and its resources alive beyond the agent run that created the launch, violating the run's cleanup boundary.

Proposal Risk: 3/10 - Rejecting run-scoped allocations once their owner is ending prevents post-cleanup resources from escaping, though allocation and run termination still need a serialized or revalidated boundary to avoid races.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "revalidate deferred plugin allocations against agent run ownership". In `src/plugins/launch-tab.ts`, `runReady` and its deferred launch path, and `src/plugins/context.ts` host allocation capabilities, check that `origin.runId` still identifies a live run before invoking a ready callback or accepting a run-owned tab/editor allocation. In `src/plugins/invoke.ts` and `src/agent/manager.ts`, make late ownership registration fail closed and ensure any allocation that races with run termination is disposed with its resource-release completion accounted for before cleanup settles. Keep run IDs internal to the host and preserve ordinary plugin launches without run ownership. Extend `src/plugins/launch-tab.test.ts` and the relevant plugin host tests with a deferred workspace-ready callback that resumes after run termination and a callback paused across termination; assert no run-created tab or resource survives and the run result does not settle before raced cleanup completes. Update `product/specs/agent-command.md` to state the resulting late-allocation behavior.


* Remove the security risk of a completed plan directing reviewers to run branch-controlled verification commands.

Existing Issue: `product/plans/complete/propagate-agent-run-ownership-through-deferred-plugin-launches.md` directs readers to run diff-scoped lint, typecheck, and server tests from the reviewed branch. Severity: 6/10

Existing Risk: 7/10 - A reviewer or later agent following the completed plan can execute branch-controlled tooling despite the review boundary, allowing untrusted pull-request content to choose the commands that run.

Proposal Risk: 2/10 - Replacing the imperative with a factual description of the coverage recorded in the plan removes the execution prompt while preserving its test expectations.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "remove the completed plan's verification command". In `product/plans/complete/propagate-agent-run-ownership-through-deferred-plugin-launches.md`, replace the imperative in the Tests section with a descriptive summary of the adapter and deferred-launch coverage already listed there. Preserve the trusted run-identity, awaited cleanup, and pre-existing/recycled-tab assertions, and do not claim checks ran unless the plan records that result.
