# Remove executable verification direction from the completed workspace-lease plan

**Complexity: 2/10** — this is a focused wording change to one completed plan, plus its recorded fix plan and pull-request backlog entry. It does not alter source, tests, or behavior.

## Goal

Keep the completed workspace-lease plan descriptive without directing readers to execute branch-supplied verification tooling.

## Approach

Remove the `check-diff` execution instruction from the completed plan's Tests section. Retain the factual test coverage and review the rest of the plan for other operational directions to execute commands. Do not change implementation details, tests, the behavior spec, or any other project files beyond this plan, this fix plan, and the selected backlog entry.

## Implementation steps

1. Remove the imperative verification command from `product/plans/complete/retry-failed-workspace-lease-release.md`, preserving the descriptive test coverage.
2. Re-read the plan and inspect the focused diff to confirm the command direction and any other operational command directions are absent.
3. Remove the resolved entry from `product/backlog/pull-request.md` and promote this plan to `product/plans/complete/`.

## Tests

- Read back the completed plan and inspect its focused diff. No build, lint, or test execution is needed for this documentation-only change.

## Spec updates

- None. The lease behavior and its existing behavior spec remain unchanged.

## Out of scope

- Changes to source code, tests, lease behavior, or `product/specs/workspaced-agent.md`.
- Changes to any other plan or documentation file.
