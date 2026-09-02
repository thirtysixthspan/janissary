# Keep the caret's screen row in view when ↓ scrolls the editor

**Complexity: 4/10** — one new geometry module, a rewrite of the two helpers that already own edge scrolling, a narrower hit contract for keyboard probing, and one line changed in the caret-into-view effect. No change to the movement transitions, to wrapping, or to how the mouse resolves a click.

## Goal

Reported against `PR #947` (`e85eb1fc`, `product/plans/complete/editor-down-arrow-screen-row-clearance.md`): *"failed to solve the problem and introduced an issue where scrolling down the page with the keyboard causes the line the caret is on to go below the fold outside of the visible fold. Scrolling down with the keyboard should never allow the line the caret is currently on to go off page. The visible portion of the buffer must scroll with the caret. Scrolling must proceed by screen lines and not buffer lines. This currently works in the up but not the down direction."*

Two guarantees have to hold after any keyboard cursor movement:

1. The line the caret is on is fully visible — never clipped at the bottom edge, never below the fold.
2. ↑/↓ at the edges of the view advance the caret one screen row and scroll the view by that same screen row, in both directions.

## Background (verified)

- `useEditorInteractions.ts`'s `verticalResolver` calls `revealVerticalProbe(body, caret, dir)` (`web/src/editor/scroll.ts`), then `visualVerticalHit(body, caret, dir)` (`web/src/editor/mouse.ts`). A hit becomes `moveToVisualTarget`; a null hit falls back to whole-buffer-line `moveCursor` (`applyKeyAction.ts`). `EditorTab.tsx` then scrolls the caret into view from an effect keyed on the cursor.
- **Every measurement in that path is taken from the caret's inline box, not from a screen row.** The caret is a zero-width inline span (`render.tsx`), so its `getBoundingClientRect().height` is the font's content height — while a screen row is `line-height: 1.45` tall (`.editor-body`/`.editor-row` in `web/src/theme.css`). The caret box is therefore roughly four fifths of a row, and the difference is split as half-leading above and below it.
- That mismatch is the whole bug, in three places:
  - `revealVerticalProbe` nudges `body.scrollTop` by **one caret box** while the press moves the caret **one screen row**. The view scrolls less than the caret travels on every press at the bottom edge.
  - The only thing making up the shortfall is `caret.scrollIntoView({ block: 'nearest' })` in `EditorTab.tsx`, and `nearest` guarantees only that the caret's *inline box* is inside the scrollport. The row it sits on keeps its half-leading — and its descenders — clipped below the fold, and nothing in the path ever asks for more.
  - `visualVerticalHit` probes half a *caret box* past the caret, which lands only a fraction of a row into the neighbouring row rather than on it squarely, and `revealVerticalProbe`'s clearance test (`PR #947`) is likewise stated in caret boxes. Both are satisfied while the row the probe lands on is still partly unpainted at the bottom edge. When that happens `elementFromPoint` resolves the body rather than a row, `hitFromEvent` finds no `[data-editor-line]` ancestor, the hit is null, and the press falls back to a whole buffer line — the "still scrolls by buffer lines going down" half of the report.
- The asymmetry with ↑ is structural, not incidental. Going up, the shortfall pushes the caret towards the top edge, where `scrollIntoView({ block: 'nearest' })` aligns the caret box's *top* and the clipped half-leading is above the caret — invisible, because the row's ascenders are inside the caret box. Going down it aligns the caret box's *bottom*, and what gets clipped is the part of the row below the caret box, which is exactly where descenders are drawn. The same pixels are lost in both directions; only downwards do they hide anything.
- `visualVerticalHit` resolves its probe through `hitFromPoint`, which exists for mouse drags and **clamps a point it cannot resolve to the first or last line of the document** (`{ line: lastLine, col: MAX_SAFE_INTEGER }`). For a drag that is right; for an arrow press it is a jump to the end of the file, which the spec explicitly rules out. It is reachable whenever `document.elementFromPoint` answers with something outside the body at the bottom edge.
- `body.getBoundingClientRect()` is the border box. It includes a horizontal scrollbar when the browser paints a classic one, and no row is painted in that strip — so a probe point measured against it can fall on the scrollbar, at the bottom edge only.

## Correct behavior

Every vertical measurement is taken in **screen rows**, the unit the user is asking for:

- The screen row height is the body's computed `line-height` (every row is exactly one), falling back to the caret box when there is no usable computed value — which is what a non-layout environment like jsdom reports.
- The caret's *row box* is its inline box grown symmetrically to a full row height. That is the box that must stay visible, and the box neighbouring rows are measured from.
- The scrollport is the body's box less any horizontal scrollbar, so no probe point is ever measured against a strip that paints no rows.

With those, both guarantees fall out:

- **After any cursor move**, the caret's row box is scrolled fully inside the scrollport. Not the caret's inline box — the row. This is the guarantee the report asks for, and it holds no matter how the press resolved, including the buffer-line fallback and `PageUp`/`PageDown`.
- **Before probing**, the probe point is the *centre of the neighbouring row* (`caretRow.bottom + row/2` going down), and it must clear the scrollport edge by half a row — which is to say the neighbouring row must be painted in full. When it is not, the caret's own row is first put fully in view and the body is then nudged by exactly one row.

One nudge still always suffices, and now provably: putting the caret's row fully in view leaves `caretRow.bottom ≤ port.bottom`, so a nudge of one row leaves `caretRow.bottom ≤ port.bottom − row` — exactly the clearance being asked for. The old proof did not hold, because `scrollIntoView({ block: 'nearest' })` only bounded the caret's inline box, leaving the row box up to a half-leading short.

Per-press scrolling is then exactly one screen row at the edge: the reveal scrolls one row, the caret advances one row, and the into-view correction afterwards finds nothing left to do. The caret keeps its position against the bottom edge instead of creeping towards it.

When the body has nothing left to scroll the nudge is a no-op, the probe stays unresolvable, and the press falls back to logical-line movement at the very top and bottom of the document, as before — but the caret's row is still brought fully into view afterwards, so the fallback can no longer leave it off the page.

## Approach

Add `web/src/editor/screen-rows.ts` for the geometry — row height, the caret's row box, the scrollport — so `scroll.ts` and `mouse.ts` share one definition of a screen row instead of each re-deriving one from the caret box. Rewrite `revealVerticalProbe` in those terms and add `keepCaretRowVisible` beside it, which `EditorTab.tsx`'s cursor effect calls in place of the bare `scrollIntoView`.

`keepCaretRowVisible` keeps `caret.scrollIntoView({ block: 'nearest' })` as its first step — it is what handles a caret parked far outside the view and any scrollable ancestor above the body — and then corrects `body.scrollTop` by whatever the row box still overhangs. The correction is arithmetic on the body's own `scrollTop`, so it can only ever move the editor body, and it is a no-op where there is no layout to measure.

In `mouse.ts`, `visualVerticalHit` resolves its probe through a row-only hit that returns null when the point does not land on a row, instead of `hitFromPoint`'s drag-oriented clamp. `hitFromPoint` itself is unchanged and still serves drag selection.

## Implementation steps

1. **`web/src/editor/screen-rows.ts`** (new) — `screenRowHeight(body, fallback)` from the body's computed `line-height`; `caretRowBox(body, rect)` growing the caret's inline box to a full row; `scrollport(body)` as the body's box less any horizontal scrollbar; `probePoint(body, rect, dir)` at the centre of the neighbouring row.
2. **`web/src/editor/scroll.ts`** — restate `probeIsClear` in rows against the scrollport, nudge by one row, add `keepCaretRowVisible`, and call it from `revealVerticalProbe` in place of the bare `scrollIntoView`.
3. **`web/src/editor/mouse.ts`** — add a module-local row-only hit; have `visualVerticalHit` probe `probePoint` and bound it by `scrollport`.
4. **`web/src/editor/EditorTab.tsx`** — the moved-cursor branch of the caret effect calls `keepCaretRowVisible(bodyRef.current, caretRef.current)`.
5. Run `./scripts/run.mjs check-diff` after each step.

## Tests

- **`web/src/editor/screen-rows.test.ts`** (new): row height read from a computed `line-height` and falling back to the caret box when it is `normal`; the caret's row box grown symmetrically around a shorter inline box; the scrollport shrunk from the bottom by a horizontal scrollbar; the probe point landing at the centre of the row above and of the row below.
- **`web/src/editor/scroll.test.ts`** (extend; the existing cases stay and must keep passing, since a fallback row height equal to the caret box reproduces their arithmetic exactly):
  - `keepCaretRowVisible` scrolls down by the overhang when the caret's row hangs below the fold although its inline box is inside it — the reported regression, at helper level.
  - `keepCaretRowVisible` scrolls up by the overhang at the top edge, and does nothing for a row already fully inside.
  - `revealVerticalProbe` nudges by a full screen row, not a caret box, when the body's computed `line-height` is taller than the caret.
- **`web/src/editor/mouse.test.ts`** (extend): a probe point that resolves to an element outside the body returns null rather than clamping to the last line of the document; the down probe lands on the centre of the row below rather than a fraction of a row into it.
- **`web/src/editor/EditorTab.test.tsx`** (extend): ArrowDown with the caret's row overhanging the bottom edge leaves `body.scrollTop` advanced by the overhang, so the row is fully inside the body afterwards; and an ArrowDown at the bottom edge with a taller computed row scrolls by that row rather than by the caret box. The existing edge cases stay as they are.

## Spec and documentation

- **`product/specs/editor-tab.md` → Scrolling** — state that it is the whole line the caret sits on that is brought into view, not just the caret, so a keyboard move can never leave it clipped at an edge or off the page; and that a press at the edge scrolls by exactly one screen row.
- **`documentation/user-documentation/tab-types/editor.md` → Caret and scroll** — the sentence promising that moving the cursor "always scrolls it into view" is what changes; say that the whole line it lands on comes into view with it.

## Verification

`./scripts/run.mjs check-diff` passes clean. Manual (browser): open a file with a paragraph long enough to wrap over several rows; hold ↓ through it — the view scrolls one screen row per press, the caret's line stays fully visible against the bottom edge with no clipped descenders, and the caret never falls below the fold; hold ↑ back through it for the unchanged mirror; wheel the caret out of view in either direction and press an arrow to see its whole line brought back.

## Out of scope

- **PageUp/PageDown**, which still move a viewport's worth of buffer lines (stated in the spec). They pick up the row-visibility guarantee through the shared effect, but their step size does not change.
- `hitFromPoint`'s clamp for mouse drags, which stays as it is — only keyboard probing stops using it.
- Multi-caret ↑/↓, which deliberately moves every caret by a whole buffer line.
- Any change to how lines wrap, to click-to-position, or to transcript scrolling.
