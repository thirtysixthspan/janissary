# Remove operational directives from reviewed plans

**Complexity: 2/10** — This documentation-only correction changes the source ready plan and the completed plans introduced by PR #1672; application behavior and tests remain unchanged.

## Goal

Make reviewed plan files descriptive records of intended scope or completed outcomes, without directing a reviewer to run commands, mutate repository or pull-request content, commit, or push.

## Approach

Review `product/plans/ready/add-a-new-agent-command.md` and all completed plans added by PR #1672. In the ready plan, retain feature decisions and test coverage as planned scope while expressing verification without executable directions. In completed plans, retain implementation scope and test coverage as descriptive or past-tense records, and retain only verification outcomes supported by the branch. Remove completed-plan directions to alter the pull request, commit, or publish changes. Do not change behavior requirements.

## Implementation summary

1. Operational verification language in the ready agent-command plan was replaced with descriptive planned coverage.
2. Imperative implementation and publication directions in the PR's completed plans were replaced with factual summaries; embedded verification commands were removed.
3. The resolved work item was removed from `product/backlog/pull-request.md`, and this repair is recorded in the completed plans folder.

## Tests

- The initial manual inspection covered the source ready plan and each completed plan introduced by PR #1672, but missed remaining verification commands in three completed plans. That follow-up reinspection covered those three plans and replaced their executable directions with descriptions of the documented coverage. A later inspection also found executable `check-diff` directions in `await-local-acp-process-tree-teardown.md` and `report-unqueryable-acp-process-groups.md`; those directions were replaced with summaries of the coverage recorded in each plan.
- Diff review confirmed changes are limited to operational wording and the selected backlog entry, preserving feature behavior, planned scope, and test coverage.
- The earlier diff-scoped verification workflow completed successfully for the prior cleanup. No application checks were needed for this documentation-only correction, and no application behavior or test code changed.

## Spec

No behavior spec update is needed because application behavior does not change.

## Out of scope

- Changing feature requirements, implementation, tests, or user-facing behavior.
- Editing plans not named by the selected work item or introduced by PR #1672.
- Changing the PR description or title.
