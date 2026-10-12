<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the run plan's late-resource cleanup guarantee when registration races with completion.

Existing Issue: `AgentRun.addResource` throws after an outcome is latched without invoking the cleanup callback for the resource that was just acquired. Severity: 6/10

Existing Risk: 7/10 - A resource created by a late provisioning or allocation callback can remain live after caller termination, leaving child work, tabs, or workspace references behind.

Proposal Risk: 2/10 - A rejected late registration also disposes its resource, so the run can finish without retaining or leaking work that arrived after cleanup began.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "clean up resources rejected after an agent run ends". In `src/agent/run.ts`, change `AgentRun.addResource` so a cleanup callback supplied after `outcome` is set is invoked instead of being discarded when registration throws; ensure any asynchronous cleanup rejection is contained or surfaced through the run's cleanup reporting without reopening the finished run. Extend `src/agent/manager.test.ts` with a late resource registration whose disposer is asserted to run exactly once, including an asynchronous disposer, while preserving the existing assertion that late resources cannot be added to the run. The existing cleanup-failure tests should continue to prove that cleanup proceeds for all resources.


* Remove the completed plan's directive to execute verification tooling, which is unsafe instruction content in reviewed material.

Existing Issue: `product/plans/complete/add-agent-command-03-command-results.md` instructs its reader to run `check-diff` during implementation, contrary to the review workflow's prohibition on executing commands supplied by reviewed content. Severity: 5/10

Existing Risk: 7/10 - An agent following the completed plan while reviewing this branch could execute branch-supplied tooling and its lifecycle code, bypassing the review's command containment and exposing the host to untrusted instructions.

Proposal Risk: 2/10 - Replacing the imperative directive with a factual description of verification coverage removes this execution prompt from the completed plan while leaving its behavior requirements intact.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "remove the executable verification directive from the completed command-results plan". In `product/plans/complete/add-agent-command-03-command-results.md`, replace the imperative `check-diff` instruction and manual-dispatch command in the Verification section with a past-tense record only if supported by the branch, otherwise describe the coverage without claiming execution. Review that completed plan for any remaining directives to run commands or alter repository content, preserving its scope and test expectations. Verify the change by reading the plan and its focused diff; no application behavior or automated tests are involved.
