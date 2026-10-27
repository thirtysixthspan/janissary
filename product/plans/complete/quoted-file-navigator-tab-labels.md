# Quoted file-navigator tab labels

**Complexity: 3/10** — a narrow parser, completion, and formatter change with focused regressions and updates to the existing behavior specs and command documentation.

## Goal

Let `files in` target labels containing spaces or quotes when the label is fully quoted, whether the clause comes before or after a path. Completion must resolve the decoded label to its local working directory, and printed remote commands must quote owners as needed.

## Approach

Keep the shared tokenizer and existing unquoted single-word form. Move full-quote recognition into the quote-token module so both the parser and completion use the decoded value only when one matching quote pair encloses the whole token. Continue preserving partly quoted values verbatim. Use the file navigator's existing path-quoting formatter for remote owner labels.

## Implementation steps

1. Share full-quote recognition from `src/command/quoted-token.ts` and use it in `src/file-navigator/args.ts` to decode fully quoted `in` labels in leading and trailing clauses.
2. In `src/completion/files.ts`, retain the decoded quoted label for local-root lookup. Add parser cases for labels with spaces and escaped quotes in both clause positions, plus completion coverage for a quoted local label and root-aware path suggestions.
3. Quote remote owner labels in `src/file-navigator/print-command.ts` when needed and add formatter coverage for a remote owner label with spaces.
4. Update `product/specs/file-navigator-tab.md` and `product/specs/tab-completion.md` to describe quoted labels and root-aware completion.
5. Update the existing descriptions in `help/files.md`, `help/commands.md`, `help/keys.md`, `documentation/user-documentation/tab-types/file-navigator.md`, and `documentation/user-documentation/command-bar/tab-completion.md`.

## Tests

- `src/file-navigator/args.test.ts`: quoted labels with spaces and escaped quotes decode in both leading and trailing `in` clauses; existing unquoted and path behavior remains covered.
- `src/completion/files.test.ts`: a quoted local label resolves its cwd for path suggestions.
- `src/file-navigator/print-command.test.ts`: remote owners with spaces are quoted in the reusable command.
- Run `$janissary/scripts/run.mjs check-diff` after each implementation step and after spec and documentation updates.

## Out of scope

- Changing matching rules for unquoted labels, partially quoted tokens, or tab aliases.
- Changing the general quote-escape rules or the handling of paths and view-clause values.
- Editing PR description text, because the selected backlog entry does not request a description correction.
