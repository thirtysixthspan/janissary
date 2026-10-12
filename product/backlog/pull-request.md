<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Remove the completed deferred-allocation plan's executable verification directive.

Existing Issue: `product/plans/complete/revalidate-deferred-plugin-allocations.md` still directs readers to execute `check-diff` after each implementation step, despite recording completed work. Severity: 5/10

Existing Risk: 5/10 - A future agent following this completed plan may run project-controlled tooling outside its assigned task, which can execute repository scripts and blur the boundary between reviewed content and authorized actions.

Proposal Risk: 2/10 - Replacing the imperative command with a factual statement of the plan's recorded test coverage removes the execution prompt while leaving the implementation history clear.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "remove the completed deferred-allocation plan verification directive". In `product/plans/complete/revalidate-deferred-plugin-allocations.md`, replace the `check-diff` instruction in the Tests section with a descriptive summary of the late-callback refusal and admitted-allocation cleanup coverage already named there. Re-read the full plan and `product/plans/complete/remove-operational-directives-from-reviewed-plans.md` to ensure the completed plan contains no command that directs readers to run tooling and the cleanup record no longer implies this plan's command was removed. No application tests are needed for this wording-only change; verify it by reading the complete plan and focused diff.
