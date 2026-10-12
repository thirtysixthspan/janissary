# Remove the completed-plan verification directive

**Complexity: 2/10** — A documentation-only correction to one completed plan, with no application behavior or test code changes.

## Goal

Keep the completed task-parameter plan descriptive instead of instructing readers to execute repository tooling.

## Approach

Replace the imperative verification command with a description of expected parser-test coverage. The branch history records the implementation and related spec changes but does not record verification results that support a past-tense test claim. Review the named plan for other direct tool-execution instructions and preserve its unrelated content.

## Implementation steps

1. Replace the verification command in `product/plans/complete/preserve-agent-task-parameter-tail.md` with a descriptive statement of the parser tests' expected coverage.
2. Review the completed plan for other direct tool-execution instructions and confirm its goal, implementation scope, and out-of-scope statements remain intact.
3. Remove only the matching entry from `product/backlog/pull-request.md`.

## Tests

- Manually inspect the named plan to confirm it contains no direct tool-execution instructions and its test coverage remains descriptive.
- Confirm the unrelated plan content and the other pull-request backlog entry are preserved.
- No automated tests apply to this documentation-only change.

## Spec

No behavior spec update is needed because application behavior does not change.

## Out of scope

- Changing application implementation, tests, or user-facing behavior.
- Editing any other completed plans or backlog entries.
- Changing the pull request description.
