# Clarify launcher rail confirmation

**Complexity: 1/10** — clarify the existing command rail interaction in the launcher spec.

The backlog item requesting a one-click command launch conflicts with the completed plan for tab-row focus, the rail's own documented behavior, and its interaction tests. The rail intentionally requires a second click on an already-highlighted command so a click while reading the list does not run it.

## Goal

Make the launcher spec state that a command runs on the second click of its highlighted row, matching the existing implementation and tests.

## Approach

1. Update the command-list behavior in `product/specs/launcher.md` to distinguish the first click, which highlights, from the second click, which runs the command.
2. Keep the command rail implementation and its interaction tests unchanged.

## Tests

- Existing `web/src/plugins/launcher/LauncherTab.test.tsx` coverage verifies that one click does not dispatch and two clicks dispatch the configured command.
- Run `./scripts/run.mjs check-diff` after the spec change.

## Out of scope

- Changing the rail to dispatch on the first click.
- Changing keyboard selection or Enter activation.
