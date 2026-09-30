# Auto refresh the tab after a statement runs in the command bar

**Complexity: 3/10** — one follow-up changes from a page re-read to a schema re-read, and the fold is
told which kind of write it is looking at. No contract change, no client change.

## Goal

A statement typed into the command bar is arbitrary SQL. It can create a table, drop one, add a
column, or change rows in a table the tab is not even showing — and the tab does not reflect any of
it. `CREATE TABLE t (id INTEGER PRIMARY KEY)` on an empty tab leaves it empty, and `DROP TABLE` leaves
a table in the list that is no longer there. A user has to press **Refresh** to see what they just did.

The tab should read itself again after a statement, the same way **Refresh** does: the object list
first, then the page.

A grid's own write is not in scope for this. Editing a cell changes one value in a table that already
exists, so it cannot change the schema, and it re-reads the page it disturbed and stops there.

## Approach

`planRun` already marks a console statement apart from every other write: its `followUp` is
`'console'`, where a grid write's is `'query'`. That one word is the whole of the distinction, so
`deliver` passes the pending's follow-up into `fold` and the `write` branch asks for a schema read
when it is `'console'`.

The schema read answers with the new object list, picks the object the tab was on when it is still
there, and follows up with its page — so a `CREATE` on an objectless tab now lands on the table it
made, and a `DROP` takes the dropped table out of the list.

Two branches collapse into the rule that a console statement always re-reads the tab, and the
"no object selected, so nothing to re-read" special case goes with them: the schema read is what
chooses an object, and it chooses one even when the tab had none.

A statement that **failed** still settles without a re-read. It changed nothing the tab can show, and
the failure is already reported as a notification. A statement that **returns rows** still only fills
the grid, because a read cannot have changed the schema.

## Implementation steps

1. **`src/plugins/sql/fold.ts`** — `fold` takes the answered request's follow-up; the `write` branch
   plans a schema re-read for a console statement and a page re-read for everything else, and the
   objectless bail goes.
2. **`src/plugins/sql/activate.ts`** — `deliver` passes `pending.followUp` into `fold`.
3. **`product/specs/sql-database.md`** — the console section says the tab re-reads itself after a
   statement, and the passage about a tab with no object selected is replaced.

## Tests

`src/plugins/sql/activate.test.ts`:

- A console statement is followed by a schema read and then the page it asks for.
- A `CREATE` on a tab with no object selected lands on the table it made.
- A grid's own write is still followed by one query, and issues no schema read — the existing
  `followUp === 'query'` assertion over the three write intents already says this, and a new case pins
  the actions.
- A statement that failed asks for nothing.

## Out of scope

- Grid writes, which cannot change the schema.
- The offset. A console statement re-reads the page the tab was on rather than returning to the
  first, which is what a cell edit does today.
- A statement that returns rows, which still only fills the grid.
- `help.md` and the user documentation, which do not describe the console's aftermath.
