# Launcher: update the built-in command list

**Complexity: 2/10** — the default list is a small constant, with a focused reader test and one existing functional spec to update.

## Goal

Make the launcher’s first-run command list match the requested labels and remove the Tasks and History entries.

## Approach

Update the built-in launcher command definitions, pin their order and labels in the existing server test, and document the visible list in the launcher spec.

## Implementation steps

1. Change the default commands to Shell, Harness, Navigator, Notifications right, Schedules right, Sessions right, Conversations, and Search, in that order.
2. Add an assertion for the exact built-in command list.
3. Update the launcher functional spec with the new list.
4. Promote this plan and remove the completed backlog entry.

## Tests

- Assert the exact default launcher commands and order in `src/plugins/launcher/commands-file.test.ts`.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Out of scope

- Changes to user-authored `launcher.json` files.
- Changes to how commands are parsed or dispatched.
