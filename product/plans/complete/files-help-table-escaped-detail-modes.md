# Keep files detail modes in one help-table cell

**Complexity: 2/10** — escape four table delimiters, pin the source form with a focused assertion, and clarify the existing command-table spec.

## Goal

Keep the `files` command's detail-mode summary together in one description cell when the help command table is rendered as Markdown.

## Approach

Escape the mode separators in the Markdown table source. Extend the existing help-table regression coverage to check the escaped syntax and ensure the source description has no unescaped table separators, while retaining the 350-character bound and existing table checks.

## Implementation steps

1. Escape the separators between `name`, `size`, `modified`, and `permissions` in `help/commands.md`, and slightly shorten the existing remote-path wording so the description remains within 350 characters.
2. Update `src/commands.test.ts` to expect the escaped source syntax and assert that the source row's description contains no unescaped table separators.
3. Update `product/specs/application-commands.md` to specify that the detail-mode list remains within the `files` description cell.

## Tests

- The `files` help row contains the complete escaped detail-mode syntax.
- The source description has no unescaped Markdown table separators.
- Existing command-table ordering, help-page coverage, description checks, and the 350-character `files` row limit continue to pass.
- Diff-scoped lint, typecheck, and related tests pass.

## Out of scope

- Changing the `files` command behavior, its detailed help page, or user documentation that already describes the detail modes accurately.
- Changing command-table limits, ordering, or any unrelated help row.
