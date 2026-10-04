# Route shell command pickers to docked tabs

**Complexity: 7/10.** Application picker state is global, while a shell tab can live in a center pane or either sidebar; the shared picker must render over the shell that opened it and retain its existing key ownership.

## Goal

Show application pickers opened by bare words in a docked shell tab over that shell, and keep picker keys out of zsh.

## Approach

Carry the submitting plugin tab's label through the shared command interception. Use that label to place the existing picker overlay in the matching mounted center or docked plugin body. Keep the current center-tab and agent picker behavior when no plugin source label is supplied.

## Implementation

1. Let plugin command interception report the source tab when a bare-word picker opens.
2. Route the shared picker overlay to the matching center plugin or sidebar plugin body.
3. Preserve the shell's modal key handling and avoid rendering duplicate overlays over the center tab.
4. Add coverage for source routing and the docked overlay, and update the shell tab spec.
5. Run diff checks and remove the resolved PR backlog entry.

## Tests

`./scripts/run.mjs check-diff` passes. Tests cover command source reporting, overlay placement over the docked shell, and existing shell behavior that keeps picker commands out of the PTY.

## Out of scope

Changing picker behavior or visual design for agent and center shell tabs.
