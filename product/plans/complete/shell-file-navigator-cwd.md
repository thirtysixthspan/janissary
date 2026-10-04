# Open the file navigator at the shell working directory

**Complexity: 2/10.** The shell metadata action already sends its tab label to the host, and the host opens the navigator for that tab.

## Goal

Open the file navigator at the shell tab's working directory.

## Approach

Verify the metadata action, host RPC, and existing target-tab behavior, then remove the resolved backlog entry.

## Implementation

1. Confirm the shell row calls the host's tab-scoped file-navigator action.
2. Confirm the host delegates to the file navigator manager for that label.
3. Remove the resolved PR backlog entry.

## Tests

Run `./scripts/run.mjs check-diff` after the backlog update; retain the existing shell action and controller RPC coverage.

## Out of scope

Changing how the file navigator chooses an existing tab to retarget.
