# Document the commandDisabled ambient notification event

**Complexity: 1/10**

## Goal

Make the user documentation describe five ambient notification events, including `commandDisabled`, matching the shipped config defaults and the specs.

## Approach

Mirror the `command-disabled` paragraphs of `product/specs/notifications.md` and `product/specs/application-config.md` in the three user pages that still describe four ambient events.

## Implementation steps

1. In `documentation/user-documentation/tab-types/notifications.md`, change "four ambient" to five, add `commandDisabled` to the example config, the event table, and the feed-message table (`Command is disabled: <command>.`), and note it is attributed to the originating tab and suppressed on the active tab.
2. In `documentation/user-documentation/getting-started/configuration.md`, add the `notifications.events.commandDisabled` row (default `false`).
3. In `documentation/user-documentation/command-bar/commands.md`, change "four ambient event toggles" to five and mention disabled-command refusals.
4. Complete the plan and remove the resolved backlog entry.

## Tests

- No code changes; existing checks run through check-diff.

## Out of scope

- Code, specs, and help pages, which already describe the event.
