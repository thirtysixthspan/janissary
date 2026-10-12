# Remove the group-selector plan verification command

**Complexity: 2/10** — This documentation-only repair changes one completed plan and its pull-request backlog; application behavior and tests remain unchanged.

## Goal

Keep the completed group-selector plan descriptive, without directing readers to execute branch-supplied verification tooling.

## Approach

Replace the imperative `check-diff` direction with a factual coverage description. Preserve the named and numeric selector cases, headed and headless pre-run rejection cases, selected-monitor placement, and caller-group defaulting. Do not claim that checks ran unless the branch records that result.

## Implementation steps

1. Update `product/plans/complete/agent-command-group-selectors.md` so its Tests section records the expected selector coverage without instructing execution.
2. Remove only the matching entry from `product/backlog/pull-request.md`, preserving all other entries.

## Tests

- Read the completed plan and review its focused diff to confirm the coverage expectations and constraints remain factual and intact.
- No application tests apply because this documentation-only change does not alter behavior or test code.

## Spec

No behavior spec update is needed because application behavior does not change.

## Out of scope

- Changing application implementation, test code, or user-facing behavior.
- Editing other completed plans or resolving other pull-request findings.
- Changing the pull-request description or title.
