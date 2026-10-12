# Remove executable verification commands from completed PR plans

**Complexity: 2/10** — This documentation-only correction replaces executable verification directions in four completed plans with factual descriptions of their recorded coverage and review.

## Goal

Keep the four completed plans descriptive records without directing readers to execute repository tooling or adding unsupported verification claims.

## Approach

Preserve the recorded test cases and evidence while replacing `check-diff` directions with descriptions of the stated coverage or review scope. The documentation-only change does not alter application behavior or test cases.

## Implementation summary

1. Replaced executable verification directions in the four selected completed plans with factual descriptions of documented test coverage or review scope.
2. Removed the selected entry from `product/backlog/pull-request.md`.

## Tests

Readback and focused diff review covered all four plans, confirming the described coverage and review scope remain intact and no executable verification directions or unsupported claims were introduced. No application tests were needed for this documentation-only correction.

## Specs / docs

No behavior spec or user documentation update is needed because application behavior does not change.

## Out of scope

- Changing application behavior, test cases, or recorded verification results.
- Editing other completed plans, other backlog entries, or the pull request description.
