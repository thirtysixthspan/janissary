# Rename the `clip` command

Complexity: 2/10

## Goal

Make `clipboard` the command users type to open clipboard history.

## Approach

Rename the command definition and its registration while preserving case-insensitive exact matching and the existing server-side no-op. Update the existing help, behavior spec, and user documentation that name the command.

## Implementation steps

1. Rename the command module and its focused tests, and register the command under `clipboard`.
2. Update clipboard-history help, spec, and user documentation references to use `clipboard`.

## Tests

- Confirm the command is named `clipboard` and matches that name case-insensitively.
- Confirm unrelated and partial command inputs do not match.
- Confirm the command remains a server-side no-op.

## Out of scope

- Changing clipboard-history behavior, keyboard shortcuts, or context-menu labels.
- Changing unrelated uses of “clip” such as video filenames.
