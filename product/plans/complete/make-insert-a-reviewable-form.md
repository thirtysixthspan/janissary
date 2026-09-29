# Make Insert row a reviewable form rather than an immediate write

**Complexity: 3/10** — one panel and one pure function. The interesting part is that the preview and
the write are two renderings of one statement, and keeping them in step is the whole risk.

## Goal

**Insert row** sent `insert-row` with every column null on the click itself, so a row landed in the
database before a value was typed and before any statement was shown.

A user who pressed it and changed their mind had already written a row of nulls, and one that
survives a `NOT NULL` constraint is an error to clean up by hand. The same press is one stray
double-click away on a table the user did not mean to be editing.

DB Browser for SQLite replaced its immediate-insert path with a dialog that collects the values,
previews the SQL, and writes only on Save, for exactly this reason.

## Approach

A panel: one input per column, the statement above the controls, Save and Cancel.

**A column left alone is null, not an empty string.** The old behaviour sent null for every column,
and preserving that is what lets a column the user is not thinking about take the database's own
default. A blank string is a value the user typed; conflating the two would quietly overwrite a
default with `''`.

**The NULL toggle is on until turned off**, and the field beside it is disabled while it is on — so a
typed value cannot silently contradict the toggle next to it. `CellEditor` already offers the same
control, so the two agree about how a null is set.

**Cancel sends nothing.** There is no request to cancel, which is the point.

## The preview and the write are two renderings of one statement

`insertStatement` in `src/plugins/sql/shared.ts` builds the shape `insertRow` builds in
`src/database/write.ts`: the named columns in the order the object declares them, one placeholder
per value, the same doubled-quote spelling. A preview only helps if what the user sees is what will
run, so a test in each file pins the shape rather than one being derived from the other — the client
cannot import the server's write layer, and a preview that drifted from the execution would be worse
than no preview.

A cell naming a column the object does not have is left out of the preview, because the write layer
refuses it: showing it would be showing something that cannot happen.

## Out of scope

- Validating values before the write. The database is the authority on a constraint, and a form that
  second-guessed it would have to duplicate every constraint.
- Editing an existing row through the same form. The cell editor already covers the single-cell case,
  and a row form is a different surface from a cell one.
- The intent guard checking the cells. It checks the object, and the write layer already refuses a
  column the table does not have with a message naming it; two sources for one rule would be two
  messages for one mistake.
