# Bound the launcher command rail

**Complexity: 4/10** — constrain the command list within the sidebar flex column and verify a long configuration in a short browser viewport.

The command rail cannot shrink because it uses `flex: 0 0 auto` and has no maximum height. A long configured list can consume the space needed by the tabs and command bar.

## Goal

Keep a long rail scrollable within a bounded part of the launcher while the tab list and command bar remain reachable.

## Approach

1. Allow `.launcher-commands` to shrink and scroll, with a maximum height proportional to the launcher body.
2. Describe the long-list scrolling behavior in `product/specs/launcher.md`.
3. Start an isolated scratch app and use the attached browser at a constrained viewport to verify the last command, a tab row, and the command bar remain reachable.
4. Run `./scripts/run.mjs check-diff` and retain the existing client interaction coverage for the default rail.

## Tests

- Existing `web/src/plugins/launcher/LauncherTab.test.tsx` command list interaction coverage.
- Browser verification with a custom rail long enough to exceed the available sidebar height; inspect rail and tab-list scroll areas at a constrained viewport and type in the command bar.
- Run `./scripts/run.mjs check-diff` after the CSS and spec changes.

## Out of scope

- Changing the host sidebar frame sizing or the shared list ref and keyboard behavior.
- Changing the default command set or its interaction.
