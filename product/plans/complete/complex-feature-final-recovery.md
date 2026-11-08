# Recover final complex-feature failures

**Complexity: 3/10**

## Goal

Make complex-feature completion repair local or CI failures and conflicts with the primary branch on its existing open pull request.

## Approach

Extend final verification with explicit target-bound calls to the existing conflict-resolution and build-repair tasks. Require current-head proof and rerun behavioral testing and the final PR update after repairs.

## Implementation steps

1. Update `ai/tasks/feature/build-a-complex-feature.md` to read both recovery tasks, inspect final mergeability and local/CI results, delegate the matching task to a fresh subagent with the recorded PR number, and verify its published result without merging. Preserve task safeguards and bound repeated recovery.
2. Add `scripts/build-a-complex-feature-final-recovery.test.mjs` covering recovery triggers, explicit PR targeting, current-head proof, repeat verification, and blocked results. Update `product/specs/pull-request-review.md` with this completion behavior.
3. Verify related workflow regression tests and diff checks, promote the plan, remove only the fixed backlog issue, and merge through the existing workflow.

## Tests

- Primary-branch conflicts invoke the conflict-resolution task on the recorded PR.
- Local gate or current-head CI failure invokes build repair in explicit PR mode.
- Absent, stale, skipped, inaccessible, or pending CI cannot satisfy final proof.
- Recovery preserves the open PR and branch, repeats behavioral testing and the final update, and rechecks the new head.
- Blocked recovery and exhausted attempts prevent completion.

## Out of scope

- Changing standalone repair tasks, application code, or CI configuration.
- Merging the feature PR from the complex-feature workflow.
