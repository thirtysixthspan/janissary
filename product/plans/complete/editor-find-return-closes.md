# Let Return close the editor's find overlay without scrolling

**Complexity: 2/10** — ~12 added lines, 2 production files, 3 requirements (p=4.18).

In the editor tab's Cmd+F find overlay, Return currently re-selects the first ranked match and leaves the overlay open. After navigating with the arrow keys to a result, the user expects Return to commit: close the overlay and leave the cursor on that line.

## Goal

With the find overlay open, Return closes it without scrolling the buffer and leaves the cursor on the highlighted result's line, with focus back in the buffer. When the highlighted result's line is not yet the cursor line (typing a query and pressing Return without arrowing), the cursor is moved there first. With no results, Return just closes the overlay. The shell transcript and PDF find overlays keep their current Return behavior.

## Approach

1. `web/src/shared/line-find/LineFind.tsx`: add an optional `onEnter` prop. When given, it replaces the default Enter handler (select the first row); otherwise behavior is unchanged.
2. `web/src/editor/EditorTab.tsx`: pass `onEnter` that, when a highlighted result exists and the cursor is not already on its line, moves the cursor there through `interactions.selectFindResult`, then closes the overlay and refocuses the buffer without scrolling (the same close path Escape uses).

## Implementation steps

1. Add the `onEnter` prop to `LineFind` and thread it into `rankedOverlayKeys`.
2. Wire the editor's commit handler.
3. Update `product/specs/editor-tab.md` ("Finding a line") to describe Return.

## Tests

- `LineFind.test.tsx`: with `onEnter` supplied, Enter calls it and does not select row 0; without it, Enter still selects the first row.
- `EditorTab.test.tsx`: arrowing to a later result then Return closes the overlay and leaves the cursor on that line; typing a query then Return places the cursor on the first match and closes; Return with no matches closes without moving the cursor; Return does not scroll the body.

## Out of scope

- The shell transcript and PDF find overlays.
- Changing Escape, click, or arrow-key behavior.
