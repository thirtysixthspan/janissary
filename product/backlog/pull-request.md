<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

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


* Make the pull request's changed-files section reflect the full implementation rather than only the initial resolution slice.

Existing Issue: The PR description labels a short list of parser, resolver, packaging, and first-plan files as “Files changed,” while the aggregate diff contains 202 files spanning run ownership, ACP, remote execution, plugins, client UI, documentation, specs, and later plans. Severity: 4/10

Existing Risk: 4/10 - Reviewers using the description to orient themselves can miss major parts of the implementation and overlook whether those integrations were actually reviewed.

Proposal Risk: 2/10 - Marking the section as representative or replacing it with an aggregate-accurate summary makes its scope clear without changing the implementation.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "clarify the PR description's changed-files section". Update the “Files changed” section of PR #1672 to either identify its bullets as representative files from the first resolution slice or summarize the aggregate implementation across `src/agent/`, `src/acp/`, `src/remote/`, `src/plugins/agent-monitor/`, `web/src/plugins/agent-monitor/`, `product/specs/`, `product/plans/`, and the user documentation. Keep the listed examples accurate against the aggregate diff and preserve the description's existing behavior and verification summaries.


* Remove the remaining completed-plan directions that ask reviewers to execute branch verification tooling.

Existing Issue: Three completed plans still direct readers to run verification tooling: `product/plans/complete/await-remote-acp-process-teardown.md`, `product/plans/complete/agent-monitor-execution-location.md`, and `product/plans/complete/confine-selected-installed-skill-support-files.md`. Severity: 6/10

Existing Risk: 7/10 - A reviewer or later agent can follow these instructions and execute branch-controlled checks despite the review boundary; their presence also contradicts the completed plan that says the branch's completed plans were inspected and cleared of operational verification directives.

Proposal Risk: 2/10 - Replacing the remaining execution directions with descriptive coverage records removes the prompt to run branch tooling while retaining the cases each plan says it covers.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "remove remaining completed-plan verification commands". In `product/plans/complete/await-remote-acp-process-teardown.md`, `product/plans/complete/agent-monitor-execution-location.md`, and `product/plans/complete/confine-selected-installed-skill-support-files.md`, replace directions to run `check-diff` or diff-scoped checks with descriptive summaries of the planned or recorded coverage, without claiming unrecorded verification. Preserve each plan's implementation scope and test cases, and re-read those plans alongside `product/plans/complete/remove-operational-directives-from-reviewed-plans.md` to ensure its inspection summary matches the reviewed set. No application tests are needed for this documentation-only correction.


* Remove executable verification directions from the newly added ACP teardown plans.

Existing Issue: The completed local ACP teardown and process-group plans instruct readers to run `./scripts/run.mjs check-diff`, leaving branch-supplied tooling commands in reviewed content. Severity: 6/10

Existing Risk: 7/10 - A reviewer or later agent following either completed plan can execute branch-controlled lint, typecheck, and test tooling despite the review's explicit command boundary.

Proposal Risk: 2/10 - Replacing these commands with factual coverage descriptions removes the execution prompt while preserving the teardown and EPERM test expectations.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "remove ACP teardown plan verification commands". In `product/plans/complete/await-local-acp-process-tree-teardown.md` and `product/plans/complete/report-unqueryable-acp-process-groups.md`, replace the imperative `check-diff` directions with descriptive summaries of the coverage already recorded in each plan, without claiming verification that the branch does not establish. Preserve the assertions for awaited local process-tree shutdown, timeout escalation, EPERM probe behavior, ESRCH absence, and ACP spec updates. Re-read both plans and `product/plans/complete/remove-operational-directives-from-reviewed-plans.md` to keep their inspection scope accurate; no application checks are needed for this documentation-only correction.
