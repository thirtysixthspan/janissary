# Quick Open should work from every tab

**Complexity: 1/10** — remove one incorrect UI capability gate, add one regression assertion, and
correct the functional specification.

## Goal

`Cmd+P` should open the Quick Open file finder regardless of which tab is focused, including tabs
that do not show the transcript search bar.

## Approach

Keep the existing global shortcut and modal-state guard, but stop checking `canSearch` for Quick
Open. That capability only describes transcript search and must continue to gate `Cmd+F`.

## Implementation steps

1. Update the `Cmd+P` branch in `web/src/useWindowKeys.ts` to open Quick Open whenever it is closed.
2. Add a `canSearch: false` regression case to `web/src/useWindowKeys.test.ts`.

## Tests

- Verify `Cmd+P` opens Quick Open and prevents the browser default even when the focused tab cannot
  show transcript search.

## Spec updates

- Update `product/specs/keyboard-navigation.md` to describe `Cmd+P` as available from every tab.

## Docs

Checked `help.md` and `documentation/user-documentation/`. Both already describe Quick Open as a
general application shortcut, so no public documentation update is needed.

## Out of scope

- `Cmd+F` transcript search gating.
- Quick Open matching, loading, selection, or file-opening behavior.
- The other backlog issues.
