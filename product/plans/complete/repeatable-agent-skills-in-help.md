# Show repeatable skills in agent help

**Complexity: 2/10** — this is a correction to one usage signature and one example in an existing help page. The spec and parser already support repeated skill clauses.

## Goal

Make `help agent` show that a launch may select more than one skill.

## Approach

Mark the complete optional `with skill <name>` clause as repeatable in the Usage block, using the existing help notation where an ellipsis follows the repeated item. Add an example that selects two existing skills. Keep the change in the source help page rather than updating generated documentation.

`product/specs/agent-command.md` already says skill clauses may repeat and repeated names are deduplicated. `src/agent/command-parser.ts` appends each skill clause and deduplicates the list; `src/agent/command-parser.test.ts` verifies repeated clauses and deduplication. The spec needs no update because behavior is unchanged.

## Implementation steps

1. Change the agent Usage signature in `help/agent.md` to mark `[with skill <name>]` as repeatable, and add an example with two skill clauses.
2. Remove this completed entry from `product/backlog/pull-request.md`, preserving the file's comment and heading.
3. Move this plan to `product/plans/complete/`.

## Tests

- Run `$janissary/scripts/run.mjs check-diff`; it must pass.
- Confirm the documented signature and two-skill example agree with the parser behavior and the existing parser test for repeated clauses and deduplication. No new test is needed because runtime behavior does not change and the existing test covers that behavior.

## Out of scope

- Changes to agent parsing or skill resolution.
- Changes to the existing behavior spec, which already describes repeatable skill clauses and deduplication.
- Tests that pin help wording.
- Changes to the command table or other command help pages.
