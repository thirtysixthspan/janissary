# Position selected editor find matches near the top

**Complexity: 2/10** — a small scroll helper and one editor effect, with focused unit and component coverage. No protocol or server changes.

## Goal

When a user selects a fuzzy-find result, place its line roughly one quarter of the editor viewport below the top edge so there is room to read the surrounding context.

## Approach

Use the existing `find.selected` state and cursor preview in `EditorTab` to recognize a selected result. Add a focused helper in the editor scroll module that adjusts `.editor-body.scrollTop` until the caret is at 25% of the body's visible height. Keep ordinary cursor movement and initial line jumps on their existing scroll behavior.

## Implementation steps

1. Add and unit-test a helper that aligns a caret to one quarter of its scroll body's viewport height.
2. Run `./scripts/run.mjs check-diff`.
3. Apply the helper when the selected fuzzy-find row changes, and cover selected-result scrolling in the editor tests.
4. Run `./scripts/run.mjs check-diff`.
5. Update the editor tab behavior spec and run `./scripts/run.mjs check-diff`.

## Tests

- `web/src/editor/scroll.test.ts`: a caret below the quarter-height target moves the body down by the measured offset; the same geometry above the target moves it up.
- `web/src/editor/EditorTab.test.tsx`: selecting a fuzzy-find row positions the caret near the quarter-height mark.

## Out of scope

- Changing how Enter behaves in the fuzzy-find input.
- Changing ordinary cursor movement, file-line navigation, or initial editor positioning.
- Updating help or user documentation, which does not currently describe fuzzy-find scroll placement.
