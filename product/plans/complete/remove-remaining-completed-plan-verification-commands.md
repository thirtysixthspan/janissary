# Remove remaining completed-plan verification commands

**Complexity: 2/10** — This documentation-only correction replaces executable verification directions with factual summaries of documented test scope.

## Goal

Keep the three selected completed plans descriptive, preserving their implementation scope and test cases without prompting readers to execute branch verification tooling.

## Approach

Replace the imperative check commands in the remote ACP teardown, monitor execution-location, and selected installed-skill plans with descriptions of the coverage already recorded in each plan. Revisit the earlier inspection summary so it acknowledges the missed directions and records the follow-up inspection accurately.

## Implementation summary

1. Replaced diff-scoped check directions and commands in the three selected completed plans with factual descriptions of their documented coverage.
2. Updated the prior fix plan's inspection summary to state that its initial review missed these directions and that the follow-up reviewed the affected plans.
3. Removed the resolved entry from `product/backlog/pull-request.md`, leaving the other entries in place.

## Tests

- Manual inspection covered the three selected plans and the earlier fix plan, confirming the replacement wording describes the existing test scope without claiming that checks ran.
- Diff review confirmed only the selected plans, the required inspection-summary correction, this fix plan, and the resolved backlog entry changed. No application behavior tests were run for this documentation-only correction.

## Specs / docs

No behavior spec or user documentation update is needed because application behavior does not change.

## Out of scope

- Changing application behavior, test cases, or verification results.
- Editing completed plans outside the selected set or removing any other pull-request backlog entries.
