# Remove the completed-plan verification directive

**Complexity: 2/10** — A documentation-only correction to one completed plan, with no application behavior or test code changes.

## Goal

Keep the completed task-parameter plan descriptive instead of instructing readers to execute repository tooling.

## Approach

Replace the imperative verification command with a description of expected parser-test coverage. The branch history records the implementation and related spec changes but does not record verification results that support a past-tense test claim. Review the named plan for other direct tool-execution instructions and preserve its unrelated content.

## Implementation steps

1. `product/plans/complete/preserve-agent-task-parameter-tail.md` describes the parser tests' expected coverage without a verification command.
2. The completed plan retains its goal, implementation scope, and out-of-scope statements without other direct tool-execution instructions.
3. Only the matching entry was removed from `product/backlog/pull-request.md`.

## Tests

- The named plan was reviewed for direct tool-execution instructions, and its test coverage remains descriptive.
- Unrelated plan content and the other pull-request backlog entry were preserved.
- No automated tests apply to this documentation-only change.

## Spec

No behavior spec update is needed because application behavior does not change.

## Out of scope

- Changing application implementation, tests, or user-facing behavior.
- Editing any other completed plans or backlog entries.
- Changing the pull request description.
