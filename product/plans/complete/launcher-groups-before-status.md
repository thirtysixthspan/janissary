# Launcher groups before status

**Complexity: 5/10** — the launcher must carry group metadata through its row contract, nest the existing status tiers inside groups, and keep keyboard navigation in the same visual order.

## Goal

Organize launcher tabs by group first, then by status within each group, and identify each group with its color as a left border.

## Approach

Include each tab's group number and group color in the activity and launcher row projections. Build groups in their first-seen strip order, keep tab order stable within each status tier, and render the existing status headings inside each group without a group title. Apply the group's color to a left border on each row.

## Implementation steps

1. Add group number and color to the activity entry and launcher row contract, including its guard and fixtures.
2. Change the tier projection to return groups containing the existing status tiers; flatten groups and tiers in rendered order for keyboard selection.
3. Render group wrappers without headings and use the row's group color for its left border.
4. Add tests for group order, status subgroups, keyboard order, and group-colored row borders.
5. Update `product/specs/launcher.md` to describe group-first ordering and color borders.

## Tests

- `src/plugins/launcher/payload.test.ts`: group metadata is copied into the launcher row projection.
- `web/src/plugins/launcher/tiers.test.ts`: groups follow first-seen strip order, status tiers are nested within each group, and order stays stable within a tier.
- `web/src/plugins/launcher/LauncherTab.test.tsx`: group color appears on the row border and keyboard selection follows the rendered group/status order.

## Out of scope

- Adding group names or headings.
- Changing the existing status tier order or tier labels.
- Changing tab grouping or colors in the center strip.
