# Copy a selection out of the grid

**Complexity: 3/10** — one pure formatter, one hook, one button. The design question is what the
copied text should be, and the answer is tab-separated with no quoting.

## Goal

The grid has no copy path at all. Every value a user wants anywhere else is retyped by hand, and
retyping a primary key or an account number is exactly the step that introduces the typo this
feature's whole safe-editing design exists to prevent.

DB Browser for SQLite's data grid carries a custom `copyMimeData()` and `paste()`, so a selection can
be lifted out and into a spreadsheet.

## Approach

Tab-separated, not CSV.

A spreadsheet pastes TSV as a table with no quoting rules to disagree about, and a value containing
a comma or a quote cannot change the shape of what is copied. That is a stronger guarantee than CSV
gives, and it is the format the destination expects.

Values are read through `cellText`, so a null copies as the `NULL` the grid shows rather than as an
empty cell that a paste would turn back into a string. A range that runs off the end of the page
copies only what was on screen: inventing rows past the page would be copying something the user
never saw.

A selection is a **rectangle** anchored where the run started and reaching wherever it got to, with
no direction — dragging back over the anchor selects the same cells as dragging away from it.

## Implementation steps

1. **`web/src/plugins/sql/grid-view.ts`** — `selectionToTsv` and `selectionTo`, both pure.
2. **`web/src/plugins/sql/selection.tsx`** — `useGridSelection`, the window-level key listener, and
   `CopySelectionButton`.
3. **`web/src/plugins/sql/DataGrid.tsx`** — the mousedown and enter handlers, and the control.
4. **`web/src/plugins/sql/GridRow.tsx`** — new: one row and one cell, extracted because `DataGrid.tsx`
   passed the 200-line limit once the selection handlers were added.

## Two things the plugin contract forces

- The key listener is gated on `capabilities.active`. A plugin tab stays mounted while another tab
  covers it, so a listener that ignored this would copy from a grid the user is not looking at. The
  markdown and pdf plugins gate their own window-wide listeners the same way.
- A cell is not rendered inside a button, so a text selection inside a cell is the browser's and
  copy still gets the word. The handler checks `getSelection()` first and only claims the keypress
  when nothing else did.

## A clipboard that is withheld is not a failure the plugin can act on

`navigator.clipboard.writeText` rejects when a browser withholds the async clipboard. Rather than
silently doing nothing, the text is surfaced in the error band so the copy still succeeds by hand.

## Notes from the build

- The selection tests ended up in `Selection.test.tsx` and the hidden-column tests in
  `Pager.test.tsx` — the latter because that is where the grid's other interaction tests had already
  been collected. Both files are about the same subject as the view arithmetic they check, so the
  pairing is deliberate rather than incidental.

## Out of scope

- **Paste.** A pasted range needs its own addressing story: which key is the row, how a partial range
  lines up with the columns, what happens when the paste is wider than the object. That is a
  different decision, and copying is the half with no such question.
- Copying a whole page or the whole object. That is what an export is for.
- Copying column headers alongside the values.
