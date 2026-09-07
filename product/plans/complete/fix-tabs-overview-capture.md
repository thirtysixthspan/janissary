# Fix tabs overview capture

**Complexity: 2/10** — reorder one screenshot fixture sequence and regenerate its output.

## Goal

Capture the documented three-tab state, including the busy indicator and unread badge.

## Approach

Create both agent tabs and send the root-tab message before starting the long-running command in the active third tab.

## Implementation

1. Reorder the `tabs-overview` manifest setup commands.
2. Regenerate `tabs-overview.png`.
3. Remove the resolved backlog entry.

## Tests

- Run `./scripts/run.mjs check-diff`.

## Out of scope

- Changing tab behavior or adding screenshots.
