# Keep completed repair plans from overriding workflow cutoffs

**Complexity: 8/10** — the changes are documentation-only, but they correct security-sensitive instructions and require a review of every completed plan added by PR #1799 to ensure historical facts remain intact.

## Goal

Ensure completed plans do not tell future repair agents to bypass the complexity cutoff in `ai/tasks/feature/work-pull-request-issue.md`, and make the pull-request review spec consistent with the repair task.

## Approach

Preserve the recorded severity and the fact that a one-time selection exception applied to the completed harness repair. State explicitly in both affected completed plans that future work proceeds only under the repair task's normal selection rules. Review every `product/plans/complete/` plan added by PR #1799 for instructions to bypass explicit workflow or stop rules, correcting any equivalent directive without erasing factual records.

The existing `product/specs/pull-request-review.md` says a finding is not skipped for complexity, which conflicts with the standalone repair task's stop rule for a selected entry rated 7 or higher. Clarify that normal repair selection follows the task's cutoff and that any different handling belongs only to a workflow that explicitly defines its own scope-specific override. Preserve the separate feature-build workflow and its existing test.

## Implementation steps

1. Revise `product/plans/complete/complete-harness-help-signatures.md` to retain the recorded severity and one-time exception as historical facts, state that the exception applies only to the completed item, and require future work to follow the normal selection rules.
2. Revise `product/plans/complete/task-picker-harness-help.md` to remove the directive that overrides the repair task's cutoff and state that future work proceeds only under its normal selection rules.
3. Review all completed plans added by PR #1799. Correct any equivalent instruction to bypass explicit workflow or stop rules while preserving factual records.
4. Update `product/specs/pull-request-review.md` to describe the standalone repair task's complexity cutoff accurately and preserve the separately defined feature-build exception.
5. Verify the two plans contain no forward-looking instruction to override the repair cutoff, the other added plans contain no equivalent bypass directive, and the spec matches both workflow rules. Run the focused existing feature-build playbook test and `$janissary/scripts/run.mjs check-diff`.
6. Promote this plan to `product/plans/complete/` and remove only the resolved entry from `product/backlog/pull-request.md`.

## Tests and verification

- No new automated test is needed: this repair changes workflow documentation, not application behavior. Directly inspect the edited plans and spec and audit the completed plans added by PR #1799 for equivalent directives.
- Run the existing `scripts/build-a-feature-playbook.test.mjs` test to confirm the separate feature-build exception remains intact.
- Run `$janissary/scripts/run.mjs check-diff` after each change and `git diff --check` before publication.

## Out of scope

- Changing application behavior, other workflow task files, or the separate feature-build override.
- Editing unrelated plans or backlog entries.
- Updating the pull request description, merging, or closing PR #1799.
