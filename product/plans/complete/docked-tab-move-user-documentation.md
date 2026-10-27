# Document docked-tab move ordering

**Complexity: 2/10** — documentation-only clarification across three existing user pages; the behavior and its implementation are already specified and tested.

## Goal

Describe `tab move` accurately when a tab is docked. Center tabs move among tabs in the same group and pane, while a visible docked tab moves among all tabs on its sidebar regardless of group. Preserve the 1-based position and past-the-end behavior.

## Approach

Update the command reference and the two getting-started pages that describe `tab move`. Scope statements about group contiguity and center-strip order to center tabs, and distinguish visible docked tabs from hidden docked tabs, which retain their center group-and-pane ordering. Keep reporting tabs' separate ordering clear where the command reference describes all move targets.

The behavior in `product/specs/tabs.md`, `product/specs/sidebars.md`, and `src/tab/arrange.ts` already matches this description, so no spec or implementation change is needed.

## Implementation steps

1. Update `documentation/user-documentation/command-bar/commands.md` to explain center, visible docked, hidden, and reporting-tab ordering, including positions past the end.
2. Update `documentation/user-documentation/getting-started/groups.md` to scope group-only reordering to center tabs and describe the sidebar ordering rule for `tab move`.
3. Update `documentation/user-documentation/getting-started/tabs.md` to distinguish sidebar order from center group-and-pane order and retain the position rules.

## Tests

- Run `src/tab/arrange.test.ts`, whose existing cases cover center, visible docked, hidden docked, and reporting-tab movement.
- Run `npm run docs:build` to verify the documentation site builds.
- Run `$janissary/scripts/run.mjs check-diff` after each change.
- No new tests are needed because this change only corrects documentation for existing behavior.

## Out of scope

- Changing tab movement behavior or implementation.
- Changing the already-accurate tab and sidebar specs.
- Rewriting other command or sidebar documentation that does not describe `tab move` ordering.
