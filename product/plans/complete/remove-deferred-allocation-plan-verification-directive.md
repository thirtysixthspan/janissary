# Remove deferred-allocation plan verification directive

**Complexity: 2/10** — This documentation-only repair replaces an executable verification instruction with a factual record of existing test coverage.

## Goal

Keep the completed deferred-allocation plan descriptive while preserving its record of implementation scope and test coverage.

## Approach

Replace the `check-diff` direction in `product/plans/complete/revalidate-deferred-plugin-allocations.md` with a summary of the two existing launch-tab tests covering refusal of allocation after run termination and waiting for an admitted allocation's cleanup. Clarify the follow-up record in `product/plans/complete/remove-operational-directives-from-reviewed-plans.md` so it does not imply that this remaining directive had already been removed.

## Implementation steps

1. Replace the command in the completed plan's Tests section with a descriptive record grounded in the existing test cases.
2. Update the cleanup plan's test record to identify this as a separately corrected residual directive.
3. Remove the selected entry from `product/backlog/pull-request.md` and promote this plan to the complete folder.

## Tests

- The existing tests in `src/plugins/launch-tab.test.ts` cover a ready callback resuming after run termination and an admitted claimed-file allocation whose cleanup is awaited.
- Read both complete plans and review the focused diff to verify the test record remains descriptive, no executable verification direction remains in the repaired plan, and no unsupported history or coverage claim was added.
- No application tests are needed because this change does not alter application behavior or test code.

## Out of scope

- Changing implementation, test code, behavior requirements, or other plans.
- Changing the pull request title or description.
