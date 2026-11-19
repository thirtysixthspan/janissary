# Put the shell thinking marker at the start of the next line

**Complexity: 3/10** — ~12 added lines in one production file, 4 behavioral requirements and 14 placement/hide scenarios, no new modules or wire types (p=4.564).

## Summary

Per the backlog: "Move the Thinking and spinner and see thought process to the beginning of the next line rather than the end of the line."

An accepted `ask`, `tell`, or `subagent` prompt (and a pending core prompt with an echo) adds a decoration to the shell terminal that reads `Thinking` beside a spinner while it runs and becomes a `see thought process` link once it settles. `web/src/plugins/shell/thinking-marker-decoration.ts` builds that decoration and `place()` positions it today. `place()` anchors the element to the last row of the echoed line and computes a horizontal offset from the number of cells that row's text uses (`cellsUsed` + `offsetFor`), so the marker lands one cell after the text, or clamped to the row's right edge when there is no room. This change moves the marker to the left edge of the line below the echoed line's final row. Placement stops depending on text or element width, and a marker whose next line would fall off the bottom of the viewport is hidden rather than drawn past the screen.

## Design decisions

- **Left edge of the next row, not after the text.** The marker's `top` becomes one row below the last row of the echoed (possibly wrapped) line, and its `marginLeft` becomes a fixed `'0px'`. (Chosen over keeping any horizontal offset derived from the row's contents.)
- **Drop the width math entirely.** `cellsUsed` and `offsetFor` no longer have a purpose once placement is independent of text and element width, so they are deleted rather than left unused. The `IBufferLine` type import and the `Anchor.line` field they required go with them; `lastRowOf` still walks wrapped rows and returns only the final row number, which is what the next line is measured from.
- **Hide when the next line is off screen.** `anchorOf` currently shows a marker on any row in `[0, terminal.rows)`. Because the marker now renders one row lower, it is shown only when that next row is still inside the viewport (`row + 1 < terminal.rows`), keeping the existing "hide when off screen" behavior consistent with the new placement.
- **Everything else stays.** Content (`Thinking` + spinner / `see thought process`), click/mousedown handling, view switching, decoration lifetime, wrapped-line following, alternate-buffer hiding, and resize re-placement are untouched.

## What already exists (reuse, don't rebuild)

| Need | Existing thing to reuse | Location |
| --- | --- | --- |
| Builds the decoration and positions it on the terminal | `addThinkingMarker` / `place` / `anchorOf` / `lastRowOf` | `web/src/plugins/shell/thinking-marker-decoration.ts` |
| Drives the marker's running/link views | `reply-markers.ts` | `web/src/plugins/shell/reply-markers.ts` |
| Unit coverage of placement, content, presses, lifetime | `thinking-marker-decoration.test.ts` with its `fakeTerminal` / `render` helpers | `web/src/plugins/shell/thinking-marker-decoration.test.ts` |
| User-visible behavior statement for the marker | the `ask`/`tell` marker paragraph | `product/specs/shell-tab.md` |

## Proposed changes

**`web/src/plugins/shell/thinking-marker-decoration.ts`.** In `place()`, keep the screen/row-height/cell-width guards, but set `element.style.marginLeft = '0px'` and `element.style.top = `${(anchor + 1) * rowHeight}px``. Change `lastRowOf` to return the final row number (`number | undefined`) instead of an `Anchor` object, and `anchorOf` to return that viewport-relative row number (`number | undefined`), adding `row + 1 < terminal.rows` to its visibility test. Delete the now-unused `Anchor` type, `cellsUsed`, `offsetFor`, and the `IBufferLine` import. No comment changes beyond adjusting the placement description if a comment names the old "one cell after the text" behavior.

**Files and limits.** One production file changes; it shrinks well below the 200-line `max-lines` cap. No new modules, no new imports, no wire-contract changes. No CSS change is needed: the marker keeps its xterm-provided cell height and existing `.shell-thinking-marker` styling.

## Tests

**Web** (vitest project `client`, colocated `*.test.tsx`):
- `web/src/plugins/shell/thinking-marker-decoration.test.ts` (existing — update the `placement` block and the width-change case in `content`):
  - a simple row places the marker at `marginLeft: '0px'` and one row down (`top: '12px'`), with `width: 'auto'` and `display: 'block'`;
  - placement ignores text width (wide characters, an over-long stale row after a resize, an empty row) — all stay at `'0px'`;
  - `left` is still never written, and re-rendering after xterm resets `top`/`width` re-applies the next-line geometry;
  - a full row and an element wider than the screen still sit at `'0px'`;
  - changing the row text or switching running→link no longer shifts the marker;
  - wrapped lines place below the last wrapped row (`top: '36px'` for a three-row wrap) and a non-wrapped following row ends the wrap (`top: '24px'`);
  - existing hide cases (row gone, alternate buffer, above/below viewport, disposed, no screen height) still pass, with the above-viewport/show case now asserting the next-row `top`;
  - a new case hides the marker when the next line would be below the viewport (marker on the last visible row).
- No new test file; mirror the existing helpers and assertion style.

## Out of scope

- The marker's label, spinner, icon, tooltip, accessible name, click behavior, or lifetime.
- The connections popup / host-name display (the other backlog issue).
- CSS styling of `.shell-thinking-marker`, the connections panel, or any documentation page that does not already describe this placement.

## Verification

- Run `$janissary/scripts/run.mjs check-diff` and confirm lint, typecheck, and the affected `client` tests pass.
- Update the marker-placement sentence in `product/specs/shell-tab.md` so the spec matches the new behavior.
- Manual check: run an `ask` in a shell tab and confirm `Thinking` + spinner appear at the left edge of the line below the echoed command, that a settled reply turns it into a `see thought process` link in the same place, and that it stays there across a resize.
