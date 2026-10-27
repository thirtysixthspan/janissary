# Preserve tab-command usage placeholders

**Complexity: 2/10** — a small formatting correction to the tab parser, covered by its existing unit tests and a focused browser-visible shell rendering regression test.

## Goal

Keep every angle-bracket argument placeholder visible when a malformed `tab` command is shown in a transcript or shell terminal.

## Approach

Escape the angle brackets in the tab command's usage replies as Markdown text, matching the established approach used by harness and diff replies. Keep the Markdown renderer generic so replies that intentionally contain markup continue to work. Assert the actual parsed usage replies after they pass through shell rendering, including the eight subcommand lines and the summary line.

## Implementation steps

1. Escape angle brackets in all tab usage constants in `src/commands/parse-tab.ts`. Update `src/commands/parse-tab.test.ts` and `src/commands/tab.test.ts` to expect the escaped Markdown source strings.
2. Extend `web/src/plugins/shell/markdown-block.test.ts` with a DOM-visible regression case for every parsed tab usage line and the summary line. Assert all argument placeholders are present in rendered text.
3. Update `product/specs/application-commands.md`, `help/tab.md`, and `documentation/user-documentation/command-bar/commands.md` to state that argument placeholders are displayed literally in rendered usage replies.

## Tests

- Existing parser and command tests verify the escaped reply strings remain exact for malformed forms.
- The shell Markdown block test feeds each real parser reply through the same rendering path used by a shell tab and verifies its visible text retains every placeholder.
- Run `$janissary/scripts/run.mjs check-diff` after each implementation step and after the spec and documentation update.

## Out of scope

- Changing tab command syntax, validation, or usage wording.
- Changing global Markdown rendering or escaping unrelated command replies.
- Editing the pull request description.
