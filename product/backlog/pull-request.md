<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

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


* Keep unrelated tabs out of agent-run ownership when deferred allocations overlap.

Existing Issue: `withRunAllocationAsync` in `src/plugins/run-allocation.ts` and `invokePlugin` in `src/plugins/invoke.ts` infer ownership by comparing all tab labels before and after asynchronous work, so tabs created by unrelated concurrent user actions can be recorded as agent-owned. Severity: 7/10

Existing Risk: 7/10 - When the run finishes, its cleanup can close an unrelated tab opened during the awaited plugin callback or claimed-file allocation, potentially discarding that tab's active work.

Proposal Risk: 2/10 - Recording ownership at the actual run-scoped allocation boundary prevents unrelated concurrent tabs from entering cleanup while preserving awaited release of tabs the run created.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "scope deferred tab ownership to the allocating agent run". Replace global before/after tab-label snapshots in `src/plugins/run-allocation.ts` and `src/plugins/invoke.ts` with ownership registration tied to the specific run-scoped allocation at the point a tab is created, preserving tab incarnation checks so a closed and recycled label is never adopted. Review the run-owned plugin launch, `openClaimedFiles`, `openInEditor`, and deferred plugin callback paths to ensure every admitted allocation registers its own tab before its completion signal is released, and unrelated calls remain unowned. Extend `src/plugins/launch-tab.test.ts` with a deferred callback or claimed-file allocation paused while an unrelated tab is created; finishing the run must close its own allocated tab, await its release, and leave the unrelated tab open. Keep the existing late-callback refusal, admitted-allocation wait, recycled-tab, and existing-tab preservation cases passing; no test currently covers this concurrent unrelated-tab race.
