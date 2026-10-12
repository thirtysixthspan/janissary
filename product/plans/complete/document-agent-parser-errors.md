# Document exact agent parser errors

Complexity: 2/10

## Goal

Make the agent-command behavior spec state every parser error emitted by `parseAgentCommand`, with exact assertions covering the documented messages.

## Approach

Keep launch parsing and grammar unchanged. Document the parser's existing messages and their token substitutions in `product/specs/agent-command.md`, and add focused table-driven assertions to `src/agent/command-parser.test.ts` for parser error branches not currently pinned exactly.

## Implementation steps

1. `product/specs/agent-command.md` lists malformed quotes, missing clause values, unknown clauses, duplicate clauses, unexpected launch tokens, missing `execute`, and missing tasks, including input-token substitutions in messages.
2. Parser tests assert exact messages for named and location clause errors, unknown clauses, unexpected launch tokens, and duplicate singleton clauses while retaining successful grammar coverage.

## Tests

- Assert exact error strings for malformed quoted values, each missing-value clause form, unknown named and location clauses, each singleton duplicate form, unexpected launch tokens, missing `execute`, and missing tasks.
- Retain the existing valid launch grammar, quote handling, and untouched parameter-tail assertions.
- Diff-scoped lint, typecheck, and tests passed after the implementation and spec update.

## Spec

- Update `product/specs/agent-command.md` with exact parser error behavior.

## Out of scope

- Changing parser behavior or launch grammar.
- Changing task resolution, launch execution, help text, or user documentation.
- Editing other pull-request backlog entries.
