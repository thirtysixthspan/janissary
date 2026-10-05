# Expand shell reply decorations to their content

## Complexity

3/10. The change is limited to shell reply row reservation, its decoration styling, and the documented behavior.

## Goal

Render application-command replies in shell tabs at their measured height without an internal scrollbar.

## Approach

Reserve one terminal row per measured row of markdown output rather than clamping the decoration to the viewport. Remove the decoration's internal scrolling rule so the reserved rows display the full reply.

## Implementation steps

1. Change `insertMarkdownBlock` to reserve the full measured reply height and test a reply taller than the terminal viewport.
2. Remove the internal overflow scrolling from the shell reply decoration styling.
3. Update the shell-tab spec and existing shell user guide to state that the full reply appears in the terminal scrollback without an internal scrollbar.

## Tests

- `web/src/plugins/shell/markdown-block.test.ts`: a reply taller than the viewport reserves all measured rows.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Specs and docs

- `product/specs/shell-tab.md`: describe the full-height reply decoration.
- `documentation/user-documentation/command-bar/shell.md`: remove the internal-scrollbar claim and describe the full output in scrollback.

## Out of scope

- Changing when a shell reply falls back to styled terminal text.
- Changing decoration marker lifetime or scrollback visibility.
- Changing markdown rendering, selection, or command behavior.
