# Launcher file navigator left sidebar

**Complexity: 2/10** — update the built-in command, its assertion, and the launcher spec.

## Goal

Choosing File navigator from the launcher's built-in command rail opens it in the left sidebar.

## Approach

Change the default launcher entry from `files` to `files left`. The command already supports this docking variant; custom `launcher.json` entries remain under user control.

## Implementation steps

1. Update the built-in File navigator command and its expected value in `src/plugins/launcher/commands-file.ts` and `src/plugins/launcher/commands-file.test.ts`.
2. Update `product/specs/launcher.md` to describe its default left-sidebar placement.
3. Run `./scripts/run.mjs check-diff`.

## Tests

- The default launcher commands include File navigator as `files left`.
- Run the server tests through `check-diff`.

## Out of scope

- Changing bare `files` behavior or custom launcher command entries.
