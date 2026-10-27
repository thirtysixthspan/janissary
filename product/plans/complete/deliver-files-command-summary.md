# Deliver the complete `files` command summary

**Complexity: 2/10** — update one help-table description, pin its advertised syntax with a focused assertion, and clarify the command-help spec.

## Goal

Make the `files` row in `help commands` summarize all four detail modes and all five view clauses while retaining the quoted-label note and staying within its 350-character limit.

## Approach

Keep the existing concise description and add the complete `<name|size|modified|permissions>` mode list and each view clause with its `<path>` argument. Extend the command-table test to require these forms and the quoted-label note, alongside its existing length and ordering checks. Record the summary requirement in the application-commands spec; the dedicated `help files` page already documents the full command syntax.

## Implementation steps

1. Update the `files` row in `help/commands.md` with all detail modes and view clause forms, preserving the note that labels with spaces or quotes should be quoted and keeping the description at or below 350 characters.
2. Add a focused assertion in `src/commands.test.ts` for the mode list, each view clause form, and the quoted-label note.
3. Clarify the `help` section in `product/specs/application-commands.md` to require the complete `files` summary.

## Tests

- `src/commands.test.ts`: assert the command table's `files` row contains the complete detail-mode list, all five view clauses, and the quoted-label note; existing length and ordering checks continue to enforce their limits.
- Run `$janissary/scripts/run.mjs check-diff` after each implementation step.

## Documentation

Update `help/commands.md`, the source for the command table and generated Command Reference. No `help/files.md` or user-documentation change is needed because their existing syntax descriptions remain accurate and this change does not alter command behavior.

## Out of scope

- Changing the `files` command's runtime behavior or its detailed help page.
- Changing the pull request description.
- Removing or altering any backlog entry other than the selected first entry.
- Changing the other remaining backlog entry.
