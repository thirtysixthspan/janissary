# Remove the late-resource plan verification directive

**Complexity: 1/10** — This is a factual wording change in one completed plan.

## Goal

Keep the completed late-resource plan's test coverage record while removing its instruction to execute repository tooling.

## Approach

Replace the imperative `check-diff` line with a factual summary of the late-resource behavior covered by the plan. Review the full plan for further direct tool-execution instructions and preserve its lifecycle requirements and scope.

## Implementation steps

1. Replace the executable verification directive in `product/plans/complete/clean-up-late-agent-resources.md` with the factual test-coverage summary.
2. Read the full plan and focused diff to confirm the execution directive is gone and its scope and late-disposer requirements remain intact.
3. Remove the resolved entry from `product/backlog/pull-request.md`, preserving every other entry.

## Tests

No application behavior changes. Verify the completed plan and focused diff by reading them; no automated tests are involved.

## Out of scope

- Changes to application code, tests, or product behavior.
- Changes to other completed plans or backlog entries.
- Any correction to the pull request description.
