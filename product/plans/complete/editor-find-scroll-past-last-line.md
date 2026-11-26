# fix(editor): scroll past the last line so a find match near the end clears the overlay

**Complexity: 5/10** — 9 requirements, 13 test scenarios, ~55 added lines across 2 edited files and 2 new modules (p=5.56)

## Goal

The editor tab's Cmd+F find overlay sits over the bottom of the tab, and previewing a result scrolls the buffer so the match lands about one quarter of the body's height below its top. A match near the end of the file cannot get there: the body runs out of content to scroll, the match stays near the bottom of the view, and the overlay covers it. This fix lets the buffer scroll past its last line by exactly as much as a preview needs, so a match on one of the last lines lands one quarter down like any other and stays visible above the overlay. It builds on the buffer match highlight from `product/plans/complete/editor-find-highlight-match-in-buffer.md`, which keeps painting the previewed match's characters.

## Requirements

1. From the issue, "the scroll must go beyond the final line of the buffer so the matched line can be visible": previewing a find result whose line is too close to the end of the file to reach one quarter of the body's height lets the buffer scroll past its last line, so the match lands one quarter down.
2. The empty room added below the last line is only as tall as that preview needs to reach the quarter mark.
3. A previewed match that can reach the quarter mark with the file's own content adds no room below the last line.
4. From the spec, "Closing the overlay never scrolls the buffer: the view stays exactly where it was": closing the overlay with Return or Escape keeps the added room, so the view does not jump.
5. Scrolling the buffer back up, with the overlay open or closed, shrinks the added room to what keeps the current view in place.
6. Once the view no longer reaches past the last line, the added room is gone entirely.
7. A scroll event that arrives while the tab is hidden never shrinks the added room, so switching away and back still restores the scroll position the tab had.
8. Ordinary cursor movement and ordinary scrolling never add room below the last line; only a find preview does.
9. The added room is not a buffer line: it has no gutter number, adds no text, and never dirties the buffer.

## Design decisions

- The room below the last line is one empty run-out element rendered after the buffer's rows inside the editor body, with its height set from the scroll helpers. It is not a padding rule on the body, because a padding change cannot be sized to the deficit of one preview and a CSS percentage height inside the flex body is not reliably definite. See Assumption 3.
- The run-out is grown at the moment of a preview, by the deficit between the scroll offset the quarter placement wants and the largest offset the body allows, so it is never taller than the preview needs (Requirement 2) and stays at zero when there is no deficit (Requirement 3). `positionCaretAtQuarter` in `web/src/editor/scroll.ts` takes the run-out and grows it before it sets `scrollTop`, because a browser clamps a `scrollTop` past the end of the content. See Assumption 1.
- The run-out shrinks only on body scroll events, to the height that keeps the current view's bottom edge inside the content, and never grows there. Closing the overlay therefore changes nothing (Requirement 4), and scrolling up gives the room back (Requirements 5 and 6). It is not tied to the overlay's open flag, because removing it on close would make the browser clamp the scroll offset and move the view.
- The shrink is skipped while the body reports no height, the same guard `useEditorScrollRetention` uses for scroll events from a hidden tab, so a hidden tab's zero offset cannot discard the room the restored offset needs (Requirement 7). See Assumption 4.
- The run-out helpers live in a new pure DOM module, `web/src/editor/find-runout.ts`, beside `scroll.ts`. The preview effect moves out of `EditorTab.tsx` into a new hook, `web/src/editor/useFindPreviewScroll.ts`, which owns the run-out ref and returns the scroll handler, so `EditorTab.tsx` stays thin and under the 200-line limit, per `ai/guidelines/react-code-organization.md` §5 and §6. See Assumption 2.
- Only the find preview grows the run-out. `keepCaretRowVisible`, `revealVerticalProbe`, and the initial and line-jump scrolls are untouched (Requirement 8).

## Preserved behavior

1. A previewed match is scrolled to one quarter down the editor body. The run-out must not change the scroll offset computed for the caret. Pinned by `EditorTab find overlay positions a selected match one quarter down the editor viewport` in `web/src/editor/EditorTab.test.tsx`.
2. Return after arrowing to a match closes the overlay without scrolling. The run-out must not cause a scroll or a scroll-into-view on close. Pinned by `EditorTab find overlay closes on Enter without scrolling after arrowing to a match`.
3. A hidden editor tab restores its scroll offset when it comes back. The run-out handler must not interfere with the retention handler that shares the body's scroll event. Pinned by `EditorTab restores the scroll position when a hidden editor tab comes back on screen`.
4. The previewed match's characters are highlighted in the buffer and the highlight follows the highlighted row. The run-out must not add a highlighted segment or move the highlight. Pinned by `EditorTab find overlay buffer match highlight moves the highlight with the highlighted row`.
5. ArrowDown at the bottom edge scrolls by one screen row. The run-out must not change edge scrolling when it is absent. Pinned by `EditorTab ArrowDown at the bottom edge scrolls one screen row instead of crossing a whole buffer line`.

## Assumptions

1. The quarter placement sets the body's scroll offset by the caret's distance from the quarter mark, with no clamp of its own: `web/src/editor/scroll.ts:19` `body.scrollTop += rect.top + rect.height / 2 - target;`.
2. The preview effect is the only caller of the quarter placement and runs only while the cursor is on the highlighted result's line: `web/src/editor/EditorTab.tsx:81` `state?.cursor.line !== result.index`.
3. The editor body is a flex-sized scroll container with no padding: `web/src/theme.css:871` `.editor-body { flex: 1; min-height: 0; overflow-y: auto; position: relative;`.
4. A hidden editor tab is `display: none`, so its body reports a zero offset and size: `web/src/editor/useEditorScrollRetention.ts:25` "A scroll event that arrives while the tab is hidden can only report zero".
5. A mouse press that lands on no buffer row is ignored without moving the cursor: `web/src/editor/useEditorMouse.ts:63` `if (!hit) { e.preventDefault(); return; }`.
6. The find overlay is anchored to the bottom of the editor tab, over the body: `web/src/theme.css:573` `position: absolute; left: 0; right: 0; bottom: 0; z-index: 40;`.

## Existing functionality

1. Quarter placement of a previewed match: `web/src/editor/scroll.ts:15` `export function positionCaretAtQuarter(body: HTMLElement, caret: HTMLElement)`.
2. The body's scroll handler that records the offset for tab switches: `web/src/editor/useEditorScrollRetention.ts:13` `export function useEditorScrollRetention(`.
3. The find overlay's open flag, results, and highlighted row: `web/src/shared/line-find/useLineFind.ts:11` `export type LineFindApi`.

## Implementation steps

Step 1. Add `web/src/editor/find-runout.ts` with two exported functions. `extendRunout(body, runout, scrollTop)` grows the run-out element's height by however far `scrollTop` exceeds the body's largest scroll offset (`scrollHeight - clientHeight`), and does nothing when it does not. `trimRunout(body, runout)` does nothing when the run-out has no height or the body reports no height; otherwise it sets the run-out's height to the smaller of its current height and the amount by which the view's bottom edge (`scrollTop + clientHeight`) reaches past the content above the run-out, clearing it at zero. The run-out's height is read from and written to its inline style only, so the helpers never depend on layout reads of the run-out itself. Add the colocated `find-runout.test.ts`. Build command: `$janissary/scripts/run.mjs check-diff`.

Step 2. Change `positionCaretAtQuarter` in `web/src/editor/scroll.ts` to take the run-out element as a third argument, compute the target offset, call `extendRunout` with it, and then set `scrollTop`. Update its cases in `web/src/editor/scroll.test.ts` and add the end-of-file case. Build command: `$janissary/scripts/run.mjs check-diff`.

Step 3. Add `web/src/editor/useFindPreviewScroll.ts`, a hook taking the body ref, the caret ref, the find API's `findOpen`, `results`, and `selected`, and the cursor's line. It owns a ref for the run-out element, runs the preview effect moved out of `EditorTab.tsx` (now passing the run-out to `positionCaretAtQuarter`), and returns the run-out ref and an `onScroll` callback that calls `trimRunout`. In `EditorTab.tsx`, replace the inline preview effect with the hook, render an empty `editor-find-runout` element with `aria-hidden` after `EditorLines` inside the body, and make the body's `onScroll` call both the retention handler and the hook's handler. Add `EditorTab` tests. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. When a previewed match is near the end of the file, empty space in the editor's background color appears below the last line, so the matched line sits one quarter down the body, above the overlay, with its buffer highlight visible.
2. The empty space carries no gutter number and no current-line background, and the mouse cursor over it is the body's text cursor; a press in it does nothing.
3. After the overlay closes the view does not move. Scrolling up with the wheel or trackpad shrinks the empty space until the last line is back at the bottom edge, after which the buffer scrolls exactly as it did before.
4. No keyboard, focus, or accessibility behavior changes. The run-out is hidden from assistive technology.

## Tests

- `web/src/editor/find-runout.test.ts`: `extendRunout` grows the run-out by the deficit past the largest scroll offset (Requirements 1 and 2); `extendRunout` leaves it untouched when the target offset is reachable (Requirement 3); `trimRunout` shrinks it to what keeps the current view's bottom inside the content (Requirement 5); `trimRunout` clears it when the view no longer reaches past the content (Requirement 6); `trimRunout` leaves it untouched when the body reports no height (Requirement 7); `trimRunout` never grows it when the view sits at the run-out's bottom (Requirement 4).
- `web/src/editor/scroll.test.ts` `positionCaretAtQuarter`: a caret near the end grows the run-out so the offset lands one quarter down (Requirement 1); the existing mid-file case adds no run-out height when the body has room (Requirement 3).
- `web/src/editor/EditorTab.test.tsx` `find overlay` block: arrowing to a match whose line cannot reach the quarter mark grows the run-out by the deficit and scrolls the match to one quarter down (Requirements 1 and 2); Escape after that keeps the run-out and the offset (Requirement 4); a body scroll back up after close shrinks the run-out, and one back to the content's end clears it (Requirements 5 and 6); the run-out is not a buffer row and the buffer stays clean (Requirement 9); arrowing the cursor in the buffer with no overlay leaves the run-out at zero (Requirement 8).

## Out of scope

- The shell tab and PDF tab finds, which share the overlay but scroll their own surfaces.
- Making the buffer scroll past its last line in general, as some editors offer as a setting.
- Moving the quarter mark or sizing the preview against the overlay's actual height.
- Return on a typed query nobody navigated to, which moves the cursor through the ordinary into-view scroll rather than the quarter preview.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then, in the running app, open a file of a few hundred lines in an editor tab, press Cmd+F, type a word that appears only on one of the last three lines, and press ↓. The buffer should scroll so that line sits about a quarter of the way down the editor body, with empty space below the last line, and the matched characters highlighted above the overlay. Press Escape: the overlay closes and the view does not move. Scroll up with the trackpad: the empty space shrinks, and once the last line reaches the bottom edge the buffer can no longer scroll past it. A failure looks like the matched line staying at the bottom of the view behind the overlay, the view jumping when the overlay closes, or empty space below the last line that never goes away.
