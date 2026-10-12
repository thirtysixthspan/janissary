# Remove verification directives from completed agent-command plans

**Complexity: 2/10** — This is a documentation-only repair across five related completed plans, with no application behavior or test code changes.

## Goal

Keep completed agent-command plans from instructing a reader to execute repository verification commands while reviewing branch content.

## Approach

Replace imperative verification instructions in the five affected completed plans with a past-tense record of checks already performed. Preserve test coverage descriptions as statements of expected behavior and retain existing historical verification records. Review each plan for any remaining direct operational instruction that prompts a reviewer to run tools.

## Implementation steps

1. Update the verification sections of the five named completed plans, preserving all unrelated text.
2. Review the five plans to confirm their verification sections contain no executable directions and their test cases remain descriptive.
3. Remove the resolved entry from the pull-request backlog.

## Tests

- Manually inspect all five plans for imperative verification commands and remaining direct tool-execution instructions.
- Confirm test coverage descriptions remain as expected-behavior statements.
- No automated tests apply to this documentation-only change.

## Spec

No behavior spec update is needed because application behavior does not change.

## Out of scope

- Changing implementation, tests, or user-facing behavior.
- Editing any other completed plans or backlog entries.
- Changing existing verification results or adding new verification claims.
