<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Remove the completed plan's directive to execute verification tooling, which is unsafe instruction content in reviewed material.

Existing Issue: `product/plans/complete/add-agent-command-03-command-results.md` instructs its reader to run `check-diff` during implementation, contrary to the review workflow's prohibition on executing commands supplied by reviewed content. Severity: 5/10

Existing Risk: 7/10 - An agent following the completed plan while reviewing this branch could execute branch-supplied tooling and its lifecycle code, bypassing the review's command containment and exposing the host to untrusted instructions.

Proposal Risk: 2/10 - Replacing the imperative directive with a factual description of verification coverage removes this execution prompt from the completed plan while leaving its behavior requirements intact.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "remove the executable verification directive from the completed command-results plan". In `product/plans/complete/add-agent-command-03-command-results.md`, replace the imperative `check-diff` instruction and manual-dispatch command in the Verification section with a past-tense record only if supported by the branch, otherwise describe the coverage without claiming execution. Review that completed plan for any remaining directives to run commands or alter repository content, preserving its scope and test expectations. Verify the change by reading the plan and its focused diff; no application behavior or automated tests are involved.
