# Leave a new row's untouched columns to the database's own defaults

**Complexity: 2/10** — one derived condition in one component, four test cases amended, one paragraph of the spec.

## Goal

Every column in the insert form starts with its **NULL** toggle on, so an untouched form saves a row
of explicit nulls across the whole table. A column the insert names is stored as null whatever the
table declared, so `DEFAULT CURRENT_TIMESTAMP`, `DEFAULT 'new'`, and every other default in the
schema never run for a row added through the tab. The form's own preview says so plainly:
`INSERT INTO "orders" ("id", "status") VALUES (?, ?)` with both placeholders bound to null.

A column the insert does not name gets its `DEFAULT`, which is what the schema asked for. So an
untouched column should not be named at all — except the primary key, which keeps its null default,
because a key the user did not choose is the one value they always mean to set.

## Approach

The three states a column's field can be in are already two fields wide, and one of them is
currently collapsed: a value typed, an explicit null, and — new — untouched. Derive the third rather
than adding a fourth piece of state: a column is named by the statement when its text is not empty or
its NULL toggle is on, and omitted when both are empty. Toggling NULL off therefore returns the column
to untouched, which is what turning it off means — "not a null" is a statement about a value, and
without one there is nothing to say.

The primary key is the one column that starts in the named state, so `draftFor` takes the column
rather than a value and checks `pk`. Everything else about the form is unchanged: the field is still
offered for every column, the preview still shows what will run, and `insertStatement` already skips
a column the cells do not name, so the omission needs nothing from the shared module.

A `NOT NULL` column with no default and nothing typed is now omitted, and the database refuses the
insert. That is the right answer — the refusal names the column, and it is the same one a hand-typed
insert without it would get.

## Implementation steps

1. **`web/src/plugins/sql/InsertForm.tsx`** — `draftFor` takes a `SqlColumn` and starts the primary
   key at null and every other column untouched; `cells` becomes `columns.filter(...)` over the named
   ones rather than a map over all of them. The comment above the state, which says a column left
   alone "is still sent as null", goes with it.
2. **`product/specs/sql-database.md`** — the insert paragraph says what an untouched column does now:
   it is not named, the column's `DEFAULT` runs, and a `NOT NULL` column with no default is refused
   by the database rather than stored as null.

## Tests

- `web/src/plugins/sql/DataGrid.test.tsx` — the preview case now reads `INSERT INTO "orders" ("id")
  VALUES (?)`; the Save case sends only the column that was typed into; the "untouched column is
  null" case becomes "an untouched column is not named at all", and a new case types into a column
  and leaves the rest, so the omission is pinned on the wire as well as on screen.
- The NULL-toggle case becomes the round trip: a toggle turned off leaves the column unnamed, and one
  turned on again names it null.
- The disabled-field case is unchanged, since a column left untouched has an enabled field to type
  into — which is the point of the change.
