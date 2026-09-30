# A copied run of cells keeps its first value

Issue: Copy a whole run of cells rather than dropping the first value — `useGridSelection` stands
aside whenever `getSelection()?.toString()` is non-empty, but a shift-click extending a run always
leaves a browser text selection running from wherever the caret landed in the first cell to the end
of the last, so the grid's own `selectionToTsv` never ran for the gesture the spec names and the
clipboard held `"\tNULL"` — the run's first value empty.

Complexity: 4/10

## Goal

The grid's run of cells is the selection a copy takes, and the browser's is the selection a word gets.
Both are made the way the spec describes, and the copy chord picks the right one. A run copied with
the platform key pastes as the whole rectangle, first value included.

## Approach

- `web/src/plugins/sql/selection.tsx`: the stand-aside test becomes *a selection whose two ends are in
  the same cell*, read from `anchorNode` and `focusNode` through `closest('td.sql-cell')`. That is
  exactly the case the spec protects — "A text selection the browser has made inside a cell is left
  alone, so copy still gets the word" — and it is what a shift-click across cells is not, however
  much text it happens to have selected. A collapsed selection stands aside for nothing, so a plain
  click on one cell still copies that cell.
- `web/src/plugins/sql/selection.tsx`, exported: `startRun(event)` answers whether a press extends a
  run, and when it does, stops the browser making a selection of its own over the same cells. It is
  one function because "this press extends a run" and "the browser's selection is now wrong" are the
  same fact — the two are inseparable, and a `preventDefault` at each of the three call sites would
  have said so three times.
- `web/src/plugins/sql/GridRow.tsx`: the two `onMouseDown` handlers (a cell, and a row header) call
  `startRun(event)` where they read `event.shiftKey` directly. Nothing else moves — `select` and
  `selectRow` keep their signatures, the keymap is untouched, and a plain press is left alone so the
  caret still lands where it was clicked and a word inside that cell can be selected afterwards.
- The row header is included because a shift-click there extends a whole-row run and leaves the same
  browser selection across the rows, and because the spec describes the two ways of marking a row as
  one behaviour.

## Implementation steps

1. `web/src/plugins/sql/selection.tsx`: `startRun`, and the stand-aside narrowed to one cell.
2. `web/src/plugins/sql/GridRow.tsx`: both mousedown handlers claim the run.
3. `./scripts/run.mjs check-diff`.

## Tests

- `web/src/plugins/sql/Selection.test.tsx`:
  - a shift-click run is copied whole, with a browser selection mocked over the same two cells — the
    regression, and the case the old stand-aside refused.
  - a selection whose ends are in one cell is still left to the browser, so Copy gets the word. The
    existing case, re-mocked to the shape the new test actually reads, since the old mock answered a
    question the new code no longer asks.
  - a collapsed selection — a plain click on one cell, or a run made with the keyboard — does not
    stand aside, so one cell is copied rather than nothing.
  - a shift-press on a cell and on a row header is cancelled, and a plain press is not: that is the
    observable difference between the browser's selection and the grid's.
  - the whole-row copy still works, since it reaches the same chord with no browser selection at all.
- The existing `selectionToTsv` cases are unchanged and still describe the text itself.

## Out of scope

- **A drag with the button held does not extend the run.** `onMouseEnter` gates its extend on
  `event.shiftKey`, which a plain drag does not carry, so the run stays one cell and the copy hands
  over that cell. This is a different defect with a different cause and a different fix — the
  rectangle arithmetic is already right — and this entry's issue, remedy, and expected result all name
  the shift-click. The spec's "a shift-click or a drag extends it" is therefore still partly
  unfulfilled, and it belongs in an entry of its own.
- `useGridKeys` and the row-header selection, which build the same rectangle through a different route
  and were already correct.
- The clipboard fallback, which reports the text in the error band when the system clipboard is
  withheld and now receives more of it.

## Specs / docs

`product/specs/sql-database.md` — no change: "Selection is a rectangle: a click starts one and a
shift-click or a drag extends it" and "A text selection the browser has made inside a cell is left
alone, so copy still gets the word" already state this, and the second is what the narrowed test
implements. No `help.md` or `documentation/user-documentation/` page describes grid selection, so no
documentation change.
