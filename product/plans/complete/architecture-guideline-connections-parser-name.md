# Correct the architecture guideline's connections parser name

**Complexity: 1/10** — one parser name in one sentence of a guideline; no code, test, behavior, spec, or user-documentation change.

## Goal

`ai/guidelines/architecture-principles.md` principle 4 cites `parseConnectionCommand` among its pure-parser examples. The branch deleted `src/connection/parsing.ts` and moved the parser to `src/plugins/connections/parse.ts` as `parseConnectionsCommand`, so a reader following the guideline searches for a function that no longer exists.

## Approach

- Replace `parseConnectionCommand` with `parseConnectionsCommand` in the parenthetical list of pure parsers in principle 4. Leave the sentence's principle and the rest of the guideline unchanged.
- A repository-wide search finds no other current reference to either the old name or `src/connection/parsing.ts`: the only remaining hits are historical plans under `product/plans/complete/`, which stay as records, and the backlog entry this change resolves. `product/specs/`, `help/`, and `documentation/user-documentation/` do not mention the parser.
- No spec update: specs describe user-visible behavior, and this correction changes no behavior.
- No help or user-documentation update for the same reason.

## Implementation steps

1. Edit `ai/guidelines/architecture-principles.md` principle 4, replacing only the parser name.
2. Run `$janissary/scripts/run.mjs check-diff` and `git diff --check`.
3. Promote this plan to `product/plans/complete/` and remove only the resolved entry from `product/backlog/pull-request.md`.

## Tests

None possible — prose only. `check-diff` selects no source checks for a Markdown-only diff; `git diff --check` confirms no whitespace errors.

## Out of scope

- The adjacent `parseDbCommand` example in the same sentence, which names `parseDatabaseCommand` in `src/database/parsing.ts`; the backlog entry scopes this change to the connection parser only.
- Historical plans under `product/plans/complete/`.
- Other backlog entries and the pull request's title or body.
- Application behavior, tests, specs, help pages, user documentation, and the command-definition section.
