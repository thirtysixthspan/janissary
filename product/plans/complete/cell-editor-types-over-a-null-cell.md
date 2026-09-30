# Let the cell editor take a typed value over a cell that holds null

**Complexity: 2/10** — one change handler in one component, two test cases, one sentence in the spec.

## Goal

`CellEditor.tsx` seeds `isNull` from the cell and passes `value={isNull ? '' : text}` to `InlineEditInput`, which is a controlled input. On a cell that already holds null the editor therefore opens with the toggle on and the field pinned empty, and every keystroke is discarded: React restores `''` because `isNull` is still true, and `onCommit` sends `isNull ? null : text`. Typing `recovered` into a `status` cell that reads `NULL` leaves the cell reading `NULL`, on every run, and nothing in the editor says why.

`product/specs/sql-database.md` says a null reads `NULL` in a muted style "rather than as a blank cell", and the **NULL** toggle is there so a null and the four characters `NULL` are different acts. A cell whose value is null is exactly the one a user opens the editor on to fill in, and there it is the one cell that cannot be filled in.

`InsertForm.tsx` already answers the same question the other way round — its toggles are "off until the user turns it on", and a field whose column is null is disabled. The cell editor cannot disable the field, because the user has to be able to type over the null, so the toggle has to get out of the way instead.

## Approach

Clear the toggle on the first keystroke, and let the typed text be the value. `onChange` already receives the field's new contents; it sets `text` as it does today and additionally drops `isNull` when the toggle was on. React batches the two updates in the same event, so the re-render that follows carries both — the field shows what was typed and the toggle is clear, and the commit that Enter triggers sends the text rather than a null.

The text typed is the value, not a continuation of the text the toggle was hiding. A cell holding `open` whose toggle is ticked shows an empty field, and `x` in that field is `x`, not `openx` — what the user can see is what they are editing. Unticking the toggle without typing still restores the text the cell held, which is the case that already works.

## Implementation steps

1. **`web/src/plugins/sql/CellEditor.tsx`** — change the `InlineEditInput`'s `onChange` from `setText` to a handler that takes the value and, when the toggle is on, clears it. Add a paragraph to the file's header comment saying that typing takes the cell out of null and why the field cannot simply be disabled the way the insert form's is.

## Tests

- `web/src/plugins/sql/DataGrid.test.tsx`, in the `DataGrid editing` group, using the fixture's second row, whose `status` cell is `{ text: '', isNull: true }`:
  - opening the editor on a cell that reads `NULL` shows an empty field and a ticked toggle, and committing it unchanged sends `null` — the two states the toggle distinguishes are still reachable from where the editor opens.
  - typing into that field clears the toggle and the typed text is what Enter carries: `update-cell` with `{ row: 'r2', column: 'status', value: 'recovered' }`, and no null.
  - a cell holding text is unaffected: a cell whose toggle was ticked and then typed into commits the typed characters, and a cell whose toggle was ticked and then cleared with no typing still commits the text it held.

## Spec

`product/specs/sql-database.md` — the editor's **NULL** toggle paragraph gains a sentence: a cell that already holds null opens the editor with the toggle on, and typing takes it out of null, so the typed characters are the value and not a null written over them.
