# Keep the caret in the field when the null toggle is pressed

**Complexity: 2/10** — one event handler on one element, two test cases, one clause in the spec.

## Goal

`InlineEditInput` commits on blur, and `CellEditor` renders it before the `Set NULL` label. Clicking
the toggle therefore blurs the field first: `onCommit` runs with `isNull` still `false`, `DataGrid`
closes the editor and sends `update-cell` with the cell's unchanged text, and the toggle — the
control the user reached for — is unmounted before its own change can run. Ticking **NULL** writes
the value that was already there and never writes a null, and the grid offers no other way to write
one.

The editor's own comment already names the trap: "The toggle is part of the value being edited, not
a write of its own … so Enter and blur write and Escape does not." Blur is the problem, not a second
commit path: a toggle press is not a blur the user asked for.

The two existing toggle cases pass because jsdom does not move focus on a click, so no blur fires and
the editor stays open. The gap is between the test environment's click and a browser's.

## Approach

Stop the toggle from taking focus. A `mousedown` whose default is prevented does not move the caret,
so the field keeps focus, the editor stays open, and the toggle is state the user then commits with
Enter — which is the contract the comment already states. Putting the handler on the wrapping label
covers both the box and the word beside it, since either press bubbles through it.

## Implementation steps

1. **`web/src/plugins/sql/CellEditor.tsx`** — add `onMouseDown` with `preventDefault` to the
   `sql-cell-null` label, and say in the file's comment that the press is prevented so the field's
   blur cannot commit the unchanged text before the toggle is read.

## Tests

- `web/src/plugins/sql/DataGrid.test.tsx` — beside the two toggle cases: pressing the toggle takes no
  focus (the mousedown's default is prevented), and the sequence that follows leaves one
  `update-cell` carrying `null` rather than the text the field held. A case that presses the toggle
  and then Escape still asks for nothing, which the existing case covers once focus is real.
