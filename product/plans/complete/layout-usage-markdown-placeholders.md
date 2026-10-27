# Preserve placeholders in layout usage replies

**Complexity: 2/10** — escape the existing layout syntax for Markdown and cover the server reply and shell display paths. Layout parsing and command dispatch stay unchanged.

## Goal

Malformed `layout` commands display the complete usage line in the shell command bar, including its `<width>`, `<height>`, and `<percent>` placeholders.

## Approach

Markdown treats bare angle-bracket placeholders as HTML. Escape the placeholders in the layout usage string, following the existing command-reply convention, so both the shell's Markdown decoration and ANSI fallback show their literal text. Keep the rendered usage line unchanged.

## Implementation steps

1. Escape the placeholders in `src/commands/parse-layout.ts` and update the command test to pin the Markdown-safe reply.
2. Add regression coverage for all four malformed layout forms through the shell command bar and for the rendered Markdown decoration in `web/src/plugins/shell/markdown-block.test.ts`.
3. Update `product/specs/application-commands.md` to state that the shell command bar displays the usage placeholders literally.

## Tests

- `src/commands/layout.test.ts` verifies the layout command returns a Markdown-safe usage reply.
- `web/src/plugins/shell/ShellTab.test.tsx` submits each malformed form through the command bar and checks the full displayed usage line.
- `web/src/plugins/shell/markdown-block.test.ts` verifies the rendered reply retains every placeholder.
- Run `$janissary/scripts/run.mjs check-diff` after each implementation step.

## Docs

No help or user-documentation changes are needed. Existing layout help already shows the complete usage syntax and says invalid forms print it.

## Out of scope

- Changing which layout command forms are accepted or their validation rules.
- Changing Markdown handling for unrelated command replies.
