# Launcher file navigator opens at project root

**Complexity: 1/10** — the file navigator already expands `$root`; the default launcher command only needs to request it and its expectation needs a regression assertion.

## Goal

Make the built-in File navigator action open its left-docked tree at the project's launch directory.

## Approach

Change the default launcher command from `files left` to `files left $root`. Keep custom launcher commands and ordinary `files` behavior unchanged.

## Implementation steps

1. Update the default File navigator command and its existing default-list test.
2. Update the launcher spec to say that the built-in File navigator opens at the project root.

## Tests

- `src/plugins/launcher/commands-file.test.ts`: the built-in File navigator command includes `$root`.

## Out of scope

- Changing the behavior of user-configured launcher commands.
- Changing how other `files` commands choose their root.
- Updating public documentation, which does not describe the built-in launcher command's root.
