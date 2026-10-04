# Seat tab popups flush against the command bar and the colored edge

**Complexity: 4/10** — Popups that the host renders over a plugin tab, and the shell tab's own history and clipboard popups, are placed with fixed offsets: 8px in from the tab body's left side and 40px up from its bottom. The left offset leaves a gap beside the tab's colored edge, and the bottom offset only matches a one-line command bar, so a popup floats above or overlaps the bar as the bar changes height. The fix measures the bar instead of guessing.

## Goal

Popups over a tab with a command bar start immediately beside the tab's colored edge, without covering it, and sit directly on top of the command bar at whatever height the bar currently has.

## Approach

The colored edge is the tab body's left border, so a popup positioned at `left: 0` inside the tab body already starts right beside it. For the bottom, the shared `CommandBarShell` publishes its own rendered height as a `--command-bar-height` custom property on the tab frame that contains it, kept current with a `ResizeObserver` and removed on unmount. The popup rules use that property for their bottom offset, falling back to the frame's bottom when there is no command bar.

## Implementation

1. Add a `useCommandBarInset` hook beside `CommandBarShell` that publishes the bar's height on the closest `.tab-body` or `.sidebar-plugin` frame, and call it from `CommandBarShell`.
2. Change the `.tab-body > .picker` rule to `left: 0` and `bottom: var(--command-bar-height, 0px)`, and the shell tab's history and clipboard popup rules to the same bottom offset.
3. Update the keyboard-navigation spec.

## Tests

- The hook publishes the bar's height on its frame, republishes it when the bar resizes, and removes it on unmount.
- The picker positioning rules use `left: 0` and the published command-bar height.

## Out of scope

- Popup contents, keyboard handling, and which popups open over which tabs.
- Agent-tab pickers, which stay inside the transcript area above that tab's bar.
