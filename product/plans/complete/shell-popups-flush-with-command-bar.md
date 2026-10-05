# Seat the application's popups on the shell tab's command bar

**Complexity: 3/10** — The command bar publishes its height on the nearest enclosing `.tab-body` or `.sidebar-plugin` element. The shell tab's own root also carries the `tab-body` class, so in a shell tab the height lands on the plugin's inner element instead of the host's tab frame. The host renders its overlays (clipboard history, queue, tab navigator, Quick Open, theme pickers) as siblings of the plugin body inside that outer frame, where a custom property set on the inner element never reaches them, so they fall back to `bottom: 0` and cover the command bar instead of sitting on it.

## Goal

Every popup shown over a shell tab, whether the shell tab opens it or the host does, sits with its bottom edge flush against the top of the command bar.

## Approach

Publish the bar's height on the outermost enclosing tab frame rather than the nearest one. Custom properties inherit downward, so the shell tab's own history popup, which sits inside the inner element, still reads the same value, and the host overlays beside the plugin body now read it too. Agent and harness tabs have only one frame, so their behavior does not change.

## Implementation

1. In `web/src/shared/command-bar/useCommandBarInset.ts`, resolve the frame by walking up through every enclosing `.tab-body` / `.sidebar-plugin` match and taking the outermost one, then publish and remove the property there.
2. Add a sentence to the keyboard-navigation spec stating that popups the application opens over a plugin tab sit on that tab's bar even when the plugin draws its own body inside the tab.

## Tests

- `useCommandBarInset.test.tsx`: when a bar sits inside a plugin's own `.tab-body` nested within the host's `.tab-body`, the height is published on the outer frame and not the inner one, and removed from the outer frame on unmount.
- The same nesting inside a `.sidebar-plugin` publishes on the sidebar frame.

## Out of scope

- Positioning rules for host overlays in a docked sidebar, which have no command-bar offset rule today.
- Popup contents, keyboard handling, and the agent tab's pickers.
