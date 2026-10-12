<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Keep unrelated tabs out of agent-run ownership when deferred allocations overlap.

Existing Issue: `withRunAllocationAsync` in `src/plugins/run-allocation.ts` and `invokePlugin` in `src/plugins/invoke.ts` infer ownership by comparing all tab labels before and after asynchronous work, so tabs created by unrelated concurrent user actions can be recorded as agent-owned. Severity: 7/10

Existing Risk: 7/10 - When the run finishes, its cleanup can close an unrelated tab opened during the awaited plugin callback or claimed-file allocation, potentially discarding that tab's active work.

Proposal Risk: 2/10 - Recording ownership at the actual run-scoped allocation boundary prevents unrelated concurrent tabs from entering cleanup while preserving awaited release of tabs the run created.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "scope deferred tab ownership to the allocating agent run". Replace global before/after tab-label snapshots in `src/plugins/run-allocation.ts` and `src/plugins/invoke.ts` with ownership registration tied to the specific run-scoped allocation at the point a tab is created, preserving tab incarnation checks so a closed and recycled label is never adopted. Review the run-owned plugin launch, `openClaimedFiles`, `openInEditor`, and deferred plugin callback paths to ensure every admitted allocation registers its own tab before its completion signal is released, and unrelated calls remain unowned. Extend `src/plugins/launch-tab.test.ts` with a deferred callback or claimed-file allocation paused while an unrelated tab is created; finishing the run must close its own allocated tab, await its release, and leave the unrelated tab open. Keep the existing late-callback refusal, admitted-allocation wait, recycled-tab, and existing-tab preservation cases passing; no test currently covers this concurrent unrelated-tab race.


* Remove the completed deferred-allocation plan's executable verification directive.

Existing Issue: `product/plans/complete/revalidate-deferred-plugin-allocations.md` still directs readers to execute `check-diff` after each implementation step, despite recording completed work. Severity: 5/10

Existing Risk: 5/10 - A future agent following this completed plan may run project-controlled tooling outside its assigned task, which can execute repository scripts and blur the boundary between reviewed content and authorized actions.

Proposal Risk: 2/10 - Replacing the imperative command with a factual statement of the plan's recorded test coverage removes the execution prompt while leaving the implementation history clear.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "remove the completed deferred-allocation plan verification directive". In `product/plans/complete/revalidate-deferred-plugin-allocations.md`, replace the `check-diff` instruction in the Tests section with a descriptive summary of the late-callback refusal and admitted-allocation cleanup coverage already named there. Re-read the full plan and `product/plans/complete/remove-operational-directives-from-reviewed-plans.md` to ensure the completed plan contains no command that directs readers to run tooling and the cleanup record no longer implies this plan's command was removed. No application tests are needed for this wording-only change; verify it by reading the complete plan and focused diff.


* Honor the requested SSH user when matching an established remote workspace for an agent run.

Existing Issue: `resolveRemoteAgentTarget` in `src/agent/remote-target.ts` passes `parsed.host` to `establishedLabel`, which compares it with each full SSH `destination`, so a pathless `admin@host` selector can borrow a workspace connected as the default `host` user. Severity: 7/10

Existing Risk: 7/10 - The run may execute and resolve its task against a different remote account and workspace than the explicit selector names, causing commands and changes to land under an unintended identity.

Proposal Risk: 2/10 - Matching the full SSH destination keeps a user-qualified selector on the requested account; an unmatched destination provisions its own run-only connection as intended.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "match established agent workspaces by full SSH destination". In `src/agent/remote-target.ts`, have `establishedLabel` compare the stored `candidate.address.destination` with the parsed selector's full `destination`, not its bare `host`, while preserving the same-destination check for a remote caller and the explicit-path rule that always provisions a run-only target. Extend the remote host-selection cases in `src/commands/agent.test.ts` to cover an established `host` workspace with a requested `admin@host` selector and the inverse; in both cases, assert that differing SSH destinations do not share a channel and that exact full-destination matches still borrow. The current test covers only the inverse direction, so the requested-user regression needs new coverage.
