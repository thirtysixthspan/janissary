# Shell completion result spacing

**Complexity: 2/10** — a small presentation fix in the shell tab and one focused test.

## Goal

Keep adjacent shell completion choices visually distinct by rendering a space between them.

## Approach

The shell tab renders each completion as a separate inline span with no text separator. Add a literal two-space separator between the spans, matching the agent command bar's completion display.

## Implementation steps

1. Add spacing between rendered shell completion choices.
2. Update the shell tab completion test to assert the choices include the separator.
3. Update the shell tab spec to describe the visible separation.

## Tests

Extend `web/src/plugins/shell/ShellTab.test.tsx` to verify multiple choices render with two spaces between them. Run the diff-scoped checks.

## Out of scope

- Changing which candidates are returned or how the common prefix is completed.
- Changing completion presentation in other tabs.
