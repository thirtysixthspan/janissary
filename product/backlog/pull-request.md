<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

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


* Remove operational directions from the completed changed-files description plan.

Existing Issue: `product/plans/complete/correct-agent-command-changed-files-description.md` tells readers to run branch verification, commit and push changes, and edit the open pull request description, including a direct `check-diff` command. Severity: 7/10

Existing Risk: 7/10 - A future reviewer or agent following this branch-supplied plan can execute repository-controlled tooling and mutate or publish changes to the pull request outside the review task's authorized output.

Proposal Risk: 2/10 - Replacing those operational directions with a factual account of the completed description correction removes the execution prompt while preserving the documented scope and outcome.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "remove operational directions from the completed changed-files description plan". In `product/plans/complete/correct-agent-command-changed-files-description.md`, replace the implementation step directing checks, commit, push, and PR-body editing with a factual summary of the changed-files section correction, and replace the Tests-section `check-diff` instruction with a description of the planned coverage or a statement that no application tests applied. Preserve the claim that the examples represent the first resolution slice and the stated aggregate PR scope. Re-read the full plan to ensure it records completed work rather than directing future commands or publication actions; do not edit the PR description as part of this work item.


* Complete the remote-server spec's coverage of remote agent host selection and protocol version 31.

Existing Issue: `product/specs/remote-server.md` documents remote agent protocol changes through version 30 and describes agent execution only on an established remote workspace, while this pull request adds task-resolution frames and allows local callers to provision distinct remote hosts under protocol version 31. Severity: 5/10

Existing Risk: 5/10 - Contributors relying on the remote protocol spec can miss the version-31 wire contract or incorrectly assume remote agents require an already-established workspace when changing remote execution behavior.

Proposal Risk: 2/10 - Recording the new version rationale and the host-override request/response behavior in the remote-server spec leaves little ambiguity about the remote protocol and supported execution paths.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "document remote agent host overrides and protocol version 31". In `product/specs/remote-server.md`, add the version-31 history entry explaining the `agent-resolve` and `agent-resolve-result` frames and why older peers must refuse the protocol, then update the remote autonomous-agent section to cover local callers, matching established workspaces, run-only connections to distinct hosts, execution-host task and skill resolution, and the absence of local fallback. Keep its caller-context command policy and shared-channel lease behavior aligned with `product/specs/agent-command.md`, and state any relevant bounded resolution wait. Verify the complete remote-agent section and protocol history agree with `src/remote/protocol.ts`, `src/remote/protocol-frames.ts`, and the two specs; this is a documentation-only change, so no application tests are needed.
