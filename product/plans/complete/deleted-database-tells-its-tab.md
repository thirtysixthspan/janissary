# Tell an open browser tab when its database is deleted

**Complexity: 4/10** — one bus channel, one field in the topic's slice, and a guard on the read that
would otherwise recreate the file. The shape is small; the reason it matters is that a read is
destructive here.

## Goal

`deleteDatabase` in `src/database/index.ts` closes the connection and removes the file, and
`DatabaseManager.forgetConn` drops the name from every tab's attribution — but nothing tells a `sql`
tab that its database went away. The tab keeps the grid it last read, and its **Refresh** issues a
schema read, which reaches `getConnection` and recreates the empty file. A user who deletes a
database they have finished with, presses Refresh in a tab they left open, and gets a new empty
database back under the same name with no indication that anything was deleted.

There are two things to fix, and the second is the one that would keep happening without the first:
the tab has to be *told*, and the read it issues in response must not be the thing that brings the
database back.

## Approach

Record the deletion in the browser state, where `readView` already composes the answer, and have the
topic carry it. That is the same route the browser already uses for everything else it learns, so no
new subscription is introduced.

The read guard is the part worth being careful about. `DatabaseBrowser.schema`, `query`, `stats`, and
`exportObject` all reach `getConnection` through one helper, so putting the existence check in that
helper fixes every path at once — and it is the check `queryDatabase` already makes for the `db`
surface. Checking *before* opening is the whole difference: opening is what creates.

## Implementation steps

1. **`src/database/connections.ts` (the `src/connections.ts` registry)** — nothing. The guard needs
   `databaseFileExists`, which is already exported and already the right question.
2. **`src/database/browser.ts`** — add a `deleted` set to `DatabaseBrowserState` with `markDeleted`
   and a `isDeleted` query. `databaseRefs` already reports `exists` per name, so the slice itself
   needs no new field; what changes is that a deleted name stops being listed as existing.
3. **`src/database/index.ts`** — after a successful delete, mark the name. `deleteDatabase` already
   knows the name and already closed the connection, so this is one call, and it must run only on the
   success path so a failed delete does not make a live database look gone.
4. **`src/database/browser-service.ts`** — have `open` return the missing-database refusal when
   `databaseFileExists` is false *and* no connection is open, which is the same guard
   `src/database/query.ts` uses and the reason it must run before `getConnection`.
5. **`src/plugins/sql/fold.ts` and `src/plugins/sql/activate.ts`** — a tab whose database has stopped
   existing drops its grid and shows `Database "<name>" does not exist.` in the error band, rather
   than keeping rows the file no longer holds. Reopening the same name from the switcher clears it,
   since that path creates again and the next read succeeds.
6. **`src/plugins/sql/open-tab.ts`** — a tab opened for a name the registry now reports as absent
   starts in that state, so the user sees the message immediately rather than after a failed read.

## Tests

`src/database/browser.test.ts` gains: a schema read for a database that was deleted records the
missing-database error and does not recreate the file; a name marked deleted stops appearing in
`readView` as existing; and a create of the same name again works and answers. The existing create and
query cases must pass unchanged — they are what would catch the guard being too broad.

`src/plugins/sql/activate.test.ts` gains a case that a tab whose database has been deleted folds the
missing-database answer into an empty grid and the message, and one that a create of the same name
clears it.

## Out of scope

- Closing the tab. The database is gone; the tab is the user's, and a plugin never closes a tab the
  user can see without being asked.
- Re-reading the database list in a tab that has never been open. The guard lives on the read, so
  there is nothing to do until a tab asks.
- Restoring a deleted database. Nothing in this repository has ever kept one.
