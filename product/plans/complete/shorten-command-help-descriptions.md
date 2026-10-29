# Shorten clipboard and SQL command descriptions

**Complexity: 1/10** — two help-table descriptions need concise wording; command behavior is unchanged.

## Goal

Keep the `clipboard` and `sql` rows in `help/commands.md` within the existing 200-character description limit while retaining their key usage details.

## Approach

Shorten only the two command-table descriptions. The existing application-commands spec already specifies the 200-character limit, and the existing test verifies it along with the longer `files` exception.

## Implementation steps

1. Rewrite the `clipboard` and `sql` descriptions to no more than 200 characters each.
2. Run the repository's diff-scoped checks, including the existing command-help test.

## Tests

Run `$janissary/scripts/run.mjs check-diff`; `src/commands.test.ts` already checks the table's description lengths and is sufficient for this text-only correction.

## Spec and documentation

The functional spec `product/specs/application-commands.md` already documents the 200-character constraint. Update the command rows in `help/commands.md`; the detailed command pages do not need changes because no behavior is changing.

## Out of scope

- Changing command behavior or the description-length constraint.
- Editing the detailed `help/clipboard.md` or `help/sql.md` pages.
