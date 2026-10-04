# Ctrl+G tab navigator in shell tabs

**Complexity: 3/10** — the window-level chord and tab-navigator state machine already work, and shell command bars let window shortcuts bubble. The missing piece is rendering the existing picker over a current plugin tab.

## Goal

Pressing `Ctrl+G` in a shell tab opens the existing tab navigator over that tab, with its current filtering, selection, and close behavior.

## Approach

Reuse the app-owned `TabNavPicker` and the overlay state already passed from `AppMain` to `MountedViewLayers`. Render it inside the current plugin tab's host frame so it appears above a shell tab without adding key handling or picker state to the shell plugin. Keep the overlay out of inactive plugin tabs.

## Implementation steps

1. In `web/src/MountedViewLayers.tsx`, create the existing `TabNavPicker` for the current plugin tab when `navOpen` and `onPickTab` are available, and pass it to `PluginTabLayer` as host-rendered overlay content.
2. In `web/src/plugins/PluginTabLayer.tsx`, render the optional host overlay beside the plugin body inside the tab frame. Do not add a picker import to the plugin layer; the application shell owns picker composition.
3. Add focused plugin-layer coverage to `web/src/MountedViewLayers.test.tsx`, verifying the navigator appears on the current plugin tab and stays absent when closed or when another tab is current. Existing `web/src/plugins/shell/ShellTab.test.tsx` and `web/src/useWindowKeys.test.ts` already cover shell chord pass-through and opening the navigator.
4. Update `product/specs/tab-navigator.md` and `documentation/user-documentation/command-bar/tab-navigator.md` to include shell tabs where they currently enumerate supported tabs.

## Tests

- `web/src/MountedViewLayers.test.tsx`: the tab navigator renders within the current plugin tab and does not render for an inactive plugin tab or when closed.
- Keep existing Ctrl+G behavior coverage passing in `web/src/plugins/shell/ShellTab.test.tsx` and `web/src/useWindowKeys.test.ts`.

## Out of scope

- Changing `Ctrl+G` key dispatch, picker navigation behavior, or `TabNavPicker` filtering.
- Changing picker behavior in docked plugin tabs.
- Updating `help.md`, which already describes `Ctrl+G` as opening the fuzzy tab navigator without limiting the supported tab kinds.
