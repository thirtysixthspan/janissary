# A refused write reports its message instead of disabling the `sql` plugin

Issue: Keep a database that refuses an inserted row from taking the whole `sql` plugin down —
`DatabaseBrowser.insertRow`, `updateCell`, and `deleteRow` let `DatabaseSync` throw, so a
`NOT NULL` / `UNIQUE` / `CHECK` refusal escapes the topic, escapes the plugin's `apply()`, and is
reported by `invokePlugin` as a plugin failure: the transcript gains
`Tab plugin "sql" disabled: NOT NULL constraint failed: notes.required.`, every `sql` tab in the
session closes, and every later `sql` command answers with the same disabled line.

Complexity: 3/10

## Goal

A write the database refuses is an ordinary outcome, reported the way every other failed read is
reported: as a `write` result carrying `error`, which the sql plugin's fold already turns into an
error band, a notifications line, and a history entry, leaving the grid underneath untouched and
the plugin enabled. No `DatabaseBrowser` method throws at its caller any more, so nothing a single
row can do takes the plugin down.

## Approach

- `src/database/browser.ts`: the three write methods wrap their delegate call in a `try`/`catch`
  that records `{ ok: false, error: errorText(error) }` through the existing `write` helper —
  byte-for-byte the shape `open()`'s own failure already takes, and the same `errorText` the read
  paths use. `updateCell`, `insertRow`, and `deleteRow` each become: open, guard, `try { … } catch
  { this.write(database, requestId, { ok: false, error: errorText(error) }) }`.
- No change to `src/database/write.ts`. Its `WriteOutcome` already has a refusal arm and every
  refusal it raises deliberately (a stale row key, a keyless table, an unknown column) flows through
  this same helper, so the database's own refusal joins a set the browser is already in the habit of
  recording rather than a new one.
- The one shape change is on the error band: the refused write carries the message the database
  gave, so it reads `NOT NULL constraint failed: notes.required.` — the column named, which is what
  the spec promises for the case that reaches it.
- Nothing on the web side changes. `fold` in `src/plugins/sql/fold.ts` already handles a `write`
  carrying `error` by settling the payload with the message and logging the statement; the whole
  path downstream of the record was working and was only never reached.

## Implementation steps

1. `src/database/browser.ts`: add the `try`/`catch` around the three write delegate calls, each
   recording `errorText(error)` through `this.write`.
2. `./scripts/run.mjs check-diff`.

## Tests

- `src/database/browser.test.ts`:
  - `insertRow` into a table with a `NOT NULL` column left with no value records a `write` result
    carrying the SQLite message naming the column, and does not throw.
  - `updateCell` into a `UNIQUE` column a row already holds records the same way.
  - `deleteRow` refused by a `CHECK`-backed `BEFORE DELETE` trigger records the same way.
  - a refused write leaves the rows underneath it exactly as they were.
- `src/plugins/sql/activate.test.ts`: an `insert-row` intent whose answer is a `write` carrying
  `error` leaves the tab's error band on that message, its grid in place, the statement on the log,
  and the plugin enabled (no `reportFailure`).

## Out of scope

- `handleFor`, which calls `objectColumns` outside the `query`/`exportObject` try blocks. A schema
  read that throws is a different failure from a write the database refuses, and no plan or test
  here asserts anything about it.
- Any change to the message text, the notification surface, or the `WriteOutcome` type.
- The `[.not found]` placeholder: the insert form already leaves a `NOT NULL` column unnamed rather
  than sending it as null, so the refusal only reaches a table whose constraint the form cannot see.

## Specs / docs

`product/specs/sql-database.md` — the console section's "Nothing a grid or a console does disables
the plugin" is already true once this lands; the **Editing** section's sentence about a `NOT NULL`
column being refused is already true too. No wording changes; the spec states the behavior this
fix makes real. No `help.md` or `documentation/user-documentation/` page documents this, so no
documentation change.
