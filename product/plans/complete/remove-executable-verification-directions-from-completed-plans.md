# Remove executable verification directions from completed plans

**Complexity: 2/10** — This documentation-only correction changes two test-description sections and records the change in the pull-request backlog.

## Goal

Remove instructions that prompt readers to execute branch-supplied tools from the completed local-execution and monitoring plans, while preserving their planned test coverage and avoiding unsupported claims about verification.

## Approach

Replace imperative verification directions with descriptive statements of planned coverage and build expectations. Review both complete plans for additional direct tool-execution directions, leaving their implementation scope and test cases intact.

## Implementation steps

1. Update `product/plans/complete/agent-canonical-local-execution.md` and `product/plans/complete/agent-monitoring-plugin.md` to describe expected test coverage and build output without directing readers to run tools or implying checks were performed.
2. Read both full plans and the focused diff, then remove only this resolved entry from `product/backlog/pull-request.md`.

## Tests

Readback and focused diff review verify that both plans contain no imperative tool-execution directions in their verification material and make no unsupported claims that tests or builds were run. No application behavior or automated tests are involved.

## Out of scope

Do not change application code, test files, specs, other plans, other backlog entries, or pull-request description text.
