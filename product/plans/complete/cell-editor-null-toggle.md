# Stop the cell editor's null toggle from writing before the user commits

**Complexity: 2/10** — one line out of one component, one test case amended, one sentence in the
spec.

## Goal

`CellEditor.tsx` wires the null checkbox's `onChange` straight to `onCommit`, so ticking it writes
the cell at once. The editor is still open afterwards, still offering Escape, and the field inside it
is `InlineEditInput`, which commits on blur — so a single click on the checkbox fires two writes: the
blur commits the cell's unchanged text, and the change commits the null. One control in a data grid
overwrites a value on the click, on a surface where everything else waits for Enter.

`product/specs/sql-database.md` says "Enter commits it and Escape leaves it without changing
anything", and the pull request's own verification list includes "Press Escape in an editor and
confirm nothing was sent". Neither holds once the toggle is involved.

## Approach

The toggle sets local state only, and the input's existing commit path carries the null — which is
already what `onCommit` does for the text. The editor then has one rule: Enter and blur write, Escape
does not.

## Implementation steps

1. **`web/src/plugins/sql/CellEditor.tsx`** — drop the `onCommit` call from the checkbox's `onChange`
   and leave `setIsNull` alone. The `onCommit` already passed to `InlineEditInput` reads `isNull` at
   the moment it fires, so a commit after the toggle already carries the null. Say in the file's
   comment that the toggle is part of the value the editor is holding rather than a write of its own.

## Tests

- `web/src/plugins/sql/DataGrid.test.tsx` — the case "asks for a null value rather than the four
  characters when the NULL toggle is used" clicks the toggle and asserts the intent fired. Change it
  to press Enter after the click, so it still pins that a null is what is sent. Add a case that
  opens the editor, ticks null, presses Escape, and asserts nothing is sent.

`product/specs/sql-database.md` says the editor has a null toggle without saying when it takes
effect. Add that the toggle is part of the value being edited and commits the way the text does, so
the rule is in the spec rather than only in the component.
