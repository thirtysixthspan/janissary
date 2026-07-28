# Grey the unfocused split-pane border

**Complexity: 3/10** — every tab body already knows whether it is focused, but six rendering paths currently apply the tab color unconditionally.

## Goal

Show the selected tab's colored left border only in the pane with keyboard focus. Use the theme's muted neutral for the visible tab in the unfocused pane.

## Approach

- Add one pure helper that returns the left-border style from a tab color and focused state.
- Use the helper in agent, generic view, shell, harness, editor, and page body wrappers.
- Leave single-pane and hidden-tab behavior unchanged because the sole visible pane remains focused.

## Implementation steps

1. Add the shared border helper, apply it to every action-tab body path, and add focused tests for the helper and representative persistent/non-persistent layers.
2. Update the split-view tabs functional spec and existing public tabs guide.
3. Promote this plan to complete and remove only the fixed backlog line.

## Tests

- `web/src/tab-body-border.test.ts`: focused bodies use their tab color and unfocused bodies use the theme's muted neutral.
- `web/src/InactiveAgentTabBody.test.tsx`: the inactive agent wrapper uses the muted border.
- `web/src/ViewTabBody.test.tsx`: an inactive view wrapper uses the muted border.
- `web/src/ShellTabLayer.test.tsx`: two visible shell panes use colored and muted borders according to focus.

## Out of scope

- Changing tab-strip group borders or dot colors.
- Changing pane focus selection.
- Dimming the whole unfocused pane.
- Changing borders on reporting or docked tabs.
