# Position Toasts Below Floating Status Panels

**Complexity: 4/10** — the stack needs to track a small set of existing floating elements whose dimensions and presence change with the active tab and status-window timers.

## Goal

Keep toast buttons below the visible connection indicator and connection/schedule status panels, even when those panels contain several rows or appear together.

## Approach

Measure the rendered connection indicator and each visible status panel from the application shell. Recompute on DOM changes, element resizing, and viewport resizing, then pass the resulting viewport offset to the fixed toast stack.

## Implementation steps

1. Add a hook that observes visible status overlays and calculates the stack's top offset.
2. Wire the measured offset through `AppShell` to `ToastStack` and remove the fixed-height assumption.
3. Add a layout test with multiple rows and both panels visible.

## Tests

- With the connection indicator and multi-row connection and schedule panels visible, the stack starts below the lowest panel plus its gap.
- Existing toast timing and pointer behavior remains covered by the toast tests.

## Out of scope

- Moving or resizing the status panels themselves.
- Changing the toast's right alignment or fixed viewport placement.
