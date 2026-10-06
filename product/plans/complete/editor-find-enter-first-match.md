# Jump to the first editor find match on Enter

**Complexity: 2/10** — connect Enter to the existing result-selection callback, with focused component and editor coverage. No new state or architecture.

## Goal

When a query has matches, pressing Enter in the editor's fuzzy-find input moves the cursor to the first ranked match and scrolls it into view.

## Approach

Use `useRankedOverlayKeys`' existing Enter callback in `EditorFind` to select result zero. The editor's existing selection handler moves the cursor, and the quarter-height positioning added for fuzzy-find results scrolls it into view. Keep the overlay open so the user can continue refining or navigating the query.

## Implementation steps

1. Make Enter select the first row and update the `EditorFind` component test.
2. Run `./scripts/run.mjs check-diff`.
3. Add an editor integration test that Enter moves to the first result and scrolls it into view.
4. Run `./scripts/run.mjs check-diff`.
5. Update the editor spec and user guide, then run `./scripts/run.mjs check-diff`.

## Tests

- `web/src/editor/EditorFind.test.tsx`: Enter selects row zero and leaves the overlay open; with no matches it does not close the overlay.
- `web/src/editor/EditorTab.test.tsx`: Enter on a matching query moves the cursor to the first match and scrolls it into view.

## Out of scope

- Closing the find overlay on Enter.
- Changing fuzzy matching, ranking, or arrow-key behavior.
- Updating help, which does not describe the editor find commit behavior.
