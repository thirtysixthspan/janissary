# Complete the desktop-alert ambient inventory

**Complexity: 2/10** — a focused specification correction; no runtime behavior changes.

## Goal

Make the desktop-alert passage name all five ambient events together and state that each defaults to no banner and no sound.

## Approach

Update the desktop-alert defaults sentence in `product/specs/notifications.md` to list `state-change`, `schedule-fire`, `agent-start`, `rate-limited`, and `command-disabled` as one inventory. Keep the separate `command-disabled` classification and focus behavior unchanged.

## Implementation steps

1. Consolidate the five ambient event names and their shared default alert behavior in the desktop-alert section.
2. Review the surrounding notification specification to confirm the five-event inventory is consistent and the separate `command-disabled` paragraph remains unchanged.
3. Run the diff-scoped checks.

## Tests

No runtime behavior changes, so no code tests are applicable. Validate the specification text for the exact five-event list and shared no-banner/no-sound default; run `check-diff` as required.

## Out of scope

- Runtime notification behavior or configuration.
- The separate `command-disabled` classification, muted settings, and focus suppression.
- Help or user documentation, which does not describe this exact spec-level inventory.
