# Remove operational directives from the completed PR-description plan

**Complexity: 2/10** — A documentation-only correction to one completed plan, with no application behavior or test-code changes.

## Goal

Keep the completed PR-description plan as a factual record rather than instructions to run tooling or mutate a pull request.

## Approach

Review `product/plans/complete/correct-agent-command-pull-request-description.md` for commands and future-reader instructions to run checks, commit, push, or edit a PR body. Replace them with a factual account of the description correction already completed. Preserve the plan's stated goal, evidence about supported selectors and execution behavior, test rationale, and out-of-scope statements. Do not assert verification or publication outcomes beyond the facts already recorded.

## Implementation steps

1. The completed plan describes the already-recorded correction as historical work and has no operational commands or mutation instructions addressed to a future reader.
2. Only the matching entry is removed from `product/backlog/pull-request.md`; all other entries remain unchanged.

## Tests

- Read the edited plan and focused diff to confirm the historical facts and scope remain, and no operational directives remain.
- No application tests apply to this documentation-only change.

## Spec

No behavior spec update is needed because application behavior does not change.

## Out of scope

- Changing application implementation, tests, specs, or user-facing behavior.
- Editing any other completed plans or backlog entries.
- Changing the pull request description.
