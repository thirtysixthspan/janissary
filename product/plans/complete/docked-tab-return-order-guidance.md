# Docked tab return-order guidance

**Complexity: 3/10** — clarify two existing user guides and add a focused regression test for the retained tab order after a docked move.

## Goal

The tab guide should not promise that a docked tab returns within its group after undocking. A docked tab keeps its current place in the overall strip order, and moving it in the sidebar can place it outside the group's run when it returns to the center strip.

## Approach

Update the sidebar section in `documentation/user-documentation/getting-started/tabs.md` to explain that docking hides a tab from the center strip while preserving its current overall position. Clarify that moving a visible docked tab with `tab move` or dragging its sidebar label can change that position, so it may reappear outside its group's run after undocking. Qualify the contiguous-group claims in `documentation/user-documentation/getting-started/groups.md` so they account for this case. `product/specs/sidebars.md` already describes the retained overall position and needs no change.

## Implementation steps

1. Add a regression case to `src/tab/arrange.test.ts` that moves a visible docked tab across groups, undocks it, and verifies its center-strip position follows the retained overall order rather than its group's run.
2. Correct the sidebar ordering description in the tabs guide and qualify the group-contiguity descriptions in the groups guide.

## Tests

- Verify the docked-move-and-undock ordering in `src/tab/arrange.test.ts`.
- Run `$janissary/scripts/run.mjs check-diff` after each implementation step.
- Run `npm run docs:build` to verify the edited user-documentation pages.

## Out of scope

- Changing tab move, sidebar drag, docking, or undocking behavior.
- Changing group membership or how groups are ordinarily arranged.
- Updating `product/specs/sidebars.md`, which already describes the behavior accurately.
