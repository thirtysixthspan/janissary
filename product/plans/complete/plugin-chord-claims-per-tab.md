# Keep plugin chord claims per tab

**Complexity: 6/10.** The registry and focused plugin frame can carry tab identity without changing chord declarations or keyboard priority.

## Goal

Let each visible plugin tab keep its own chord handler, and run only the handler for the tab that owns keyboard focus.

## Approach

Key each registration by plugin, tab label, and chord. Put the tab label on both center and docked plugin frames, then resolve the window key event through its focused target. An ambiguous event with no focused plugin tab falls through to the application.

## Implementation

1. Add tab identity to plugin chord registrations and resolve claims by the event target's plugin frame.
2. Add regressions for two same-plugin tab claims, focused resolution, independent release, and fallback after both release.
3. Update the plugin and shell specs, then remove the backlog entry.

## Tests

Run `$janissary/scripts/run.mjs check-diff` after each implementation and test change.

## Out of scope

Changing which chords a plugin may claim or changing application chord priority.
