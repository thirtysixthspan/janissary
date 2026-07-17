# Sidebar default width should be 300px

**Complexity: 1/10** — a single constant change plus updating one stale test assertion.

## Goal

A sidebar (left or right) currently opens at a default width of 280px before any drag-resize.
Change the initial width to 300px.

## Approach

`web/src/Sidebar.tsx` defines `DEFAULT_WIDTH_PX = 280` (line 12), used as the initial value of the
`width` `useState` (line 31). This is the single source of truth for the default width — change the
constant to `300`.

## Implementation steps

1. In `web/src/Sidebar.tsx`, change `const DEFAULT_WIDTH_PX = 280;` to `const DEFAULT_WIDTH_PX = 300;`.
2. Run `./scripts/run.mjs check-diff`.

## Tests

`web/src/Sidebar.test.tsx:72` — `'stops resizing on mouseup'` asserts the sidebar's `style.flex`
equals `'0 0 280px'` after a mousedown/mouseup sequence with no net movement (the drag never moves,
so the width stays at the default). Update the expected value to `'0 0 300px'`.

No new tests are needed — this existing test already exercises the default-width value and is the
correct place to encode the new default.

## Spec updates

`product/specs/sidebars.md` does not name a specific pixel default (it only documents that width is
resizable, unpersisted, and resets on relaunch), so no spec change is needed.

## Out of scope

- The other backlog issue (Effort dropdown for new harness) — a separate fix.
- `MIN_WIDTH_PX` (180) and `MAX_WIDTH_PCT` (50) — unrelated to the default and unaffected by this
  change.

## Verification

- `./scripts/run.mjs check-diff` passes.
- Manual: not necessary beyond the automated test — this is a pure constant change with direct test
  coverage of the resulting DOM style value.
