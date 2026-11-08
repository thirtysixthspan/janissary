# Test and repair complex features before the final update

**Complexity: 3/10**

## Goal

Run behavioral testing and drain its findings until a test pass adds no backlog items, then update the same open pull request again.

## Approach

Keep the existing focused and full-review cycles. After the initial pull-request update and full review, delegate behavioral testing and sequential repairs on the recorded branch. Retest after every repair batch, including description corrections, and finish with another update. Preserve the testing task's browser, base-instruction, and publication safeguards and report blocked runs accurately.

## Implementation steps

1. Update `ai/tasks/feature/build-a-complex-feature.md` to define test/repair/final-update ordering, fresh delegates, termination, child safeguards, and reporting.
2. Add `scripts/build-a-complex-feature-testing.test.mjs` for ordering, full backlog draining, retesting, blocked handling, and final update. Update `product/specs/pull-request-review.md` with the behavioral test cycle.
3. Run related workflow tests and diff checks, promote this plan, remove only the resolved issue, and merge using the existing workflow.

## Tests

- Initial update and full review precede behavioral testing; the final update follows a clean test pass.
- Each test uses the recorded PR; all findings are repaired sequentially before another test.
- Repairs always trigger retesting, including description-only changes; completion requires no new entries and an empty backlog.
- Browser and other child blockers stop completion without weakening safeguards.
- Existing single-plan, focused-review, and canonical-plan tests pass.

## Out of scope

- Build/CI and merge-conflict recovery requested by the remaining backlog issue.
- Changing standalone testing or repair tasks, runtime behavior, or public help.
