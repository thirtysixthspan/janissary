# Complete the `tab` command help reference

**Complexity: 2/10** — documentation and one focused regression test; the command parser and behavior already exist.

## Goal

Make `help tab` document all eight supported command forms, the quoting rule for names with spaces, silent success and no-op behavior, notification-only refusals, and exact usage output. The application-command spec must identify the page as the `tab` command reference rather than describing it as a focus-only page.

## Approach

Use `parseTabCommand`, the `tab` command implementation, and the existing application-command and tab specs as the behavior sources. Keep the combined command-table row and its ordering checks in `help/commands.md` unchanged. Add a test that exercises the actual `help tab` output and confirms its examples and usage text agree with parser behavior.

## Implementation steps

1. Rewrite `help/tab.md` with all eight forms, their user-visible behavior, exact quoting rules, success and no-op behavior, notification refusals, and exact malformed-command usage lines.
2. Update the `help <command>` description in `product/specs/application-commands.md` to identify `help tab` as printing the `tab` page.
3. Extend the help-page tests in `src/commands.test.ts` to check that `help tab` returns the expanded page, that its eight documented examples parse successfully, and that the unquoted spaced focus example and all usage lines match the parser.

## Tests

- Add one test in `src/commands.test.ts` covering the page returned by `help tab`, all eight documented example forms, the rejection of `tab focus review notes`, and the exact per-subcommand and summary usage lines.
- Existing parser tests in `src/commands/parse-tab.test.ts` and command behavior tests in `src/commands/tab.test.ts` remain the source checks for valid forms, malformed input, and refusals.
- Run `$janissary/scripts/run.mjs check-diff` after each change.

## Spec and documentation

- Update `product/specs/application-commands.md` so its help-page description names the `tab` command page.
- Expand `help/tab.md` as the user-facing command reference. Keep the `tab` row and ordering in `help/commands.md` unchanged.

## Out of scope

- Changing tab-command parsing, arrangement behavior, or notifications.
- Revising separate user-documentation pages or the `help/commands.md` table.
- Changing the pull request description.
