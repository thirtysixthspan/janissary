# Launcher group colors on state headers

**Complexity: 2/10** — the launcher already carries each group's color into its grouped tiers, so the change is limited to rendering and a focused component test.

## Goal

Show each tab group's color on the right border of its launcher rows and the status headers that group those rows.

## Approach

Use the existing group color carried by the launcher projection. Render a right border on each row and pass the group's color to each status header inside its group. Keep group ordering, status ordering, and selection behavior unchanged.

## Implementation steps

1. Render group-colored right borders on launcher rows and status headers.
2. Extend the launcher component test to verify row and header border colors across groups.
3. Update the launcher spec to describe the right borders on rows and grouped status headers.

## Tests

- `web/src/plugins/launcher/LauncherTab.test.tsx`: each row and status header displays the color of its group.

## Out of scope

- Changing group or status ordering, labels, or keyboard navigation.
- Changing tab strip borders or tab group colors.
- Updating user documentation, which does not describe launcher border placement.
