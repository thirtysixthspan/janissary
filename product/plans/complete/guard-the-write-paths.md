# Refuse a write before opening a connection

**Complexity: 4/10** — two methods route through a helper that already exists, and the write path
stops being able to name a database at all, which reaches the row key store and the grid that fills
it.

## Goal

`DatabaseBrowser.open()` checks `databaseFileExists` and `isConnectionOpen` before reaching
`getConnection`, because opening is what creates. `schema`, `query`, `stats`, `exportObject`, `run`,
`create`, and `insertRow` all go through it. `updateCell` and `deleteRow` do not: they call
`this.columnsOf(database)` and `this.connectionOf()`, both of which call `getConnection` directly.

So a user who runs `db sqlite delete shop` — which closes the connection and removes the file — and
then clicks a row's delete button in the tab they left open has the file recreated, empty, before
the write is refused for want of a primary key. The browser then lists the name as an existing empty
database. A destructive act is undone with no message, and a name the user believed was free is
taken.

`product/plans/complete/deleted-database-tells-its-tab.md` states the rule this restores: "Checking
*before* opening is the whole difference: opening is what creates."

The same two methods carry a second problem. `updateCell` and `deleteRow` in `src/database/write.ts`
receive a `databaseOf: (name: string) => DatabaseSync` and call it with `target.database` — the
database the **row key** names — while the existence guard checked the database the **tab** named.
One shared key store lets a key minted while browsing one database resolve against another.

Handing the write the handle it already has closes the first half: a handle is not a name and cannot
be re-resolved, so nothing on a write path can open a connection. The second half needs the store
itself to be per-database, so a key from elsewhere simply does not resolve and is refused as the
stale row it now is.

## Approach

Route both writes through `open()` and pass the handle it returned, all the way down, and hold one
`RowKeyStore` per database so a key cannot cross from one to another. Nothing on a write path can
then open a connection, name a database, or resolve a row it was not handed.

## Implementation steps

1. **`src/database/browser.ts`** — `updateCell` and `deleteRow` each begin with `const opened =
   this.open(database)`, record the refusal and return when it is an error, and pass `opened.handle`
   down. Delete `columnsOf` and `connectionOf` outright: with the handle in hand nothing needs a
   closure, and nothing needs a name. Hold the key store in a `Map<string, RowKeyStore>` keyed by
   database name, created on demand, and clear it in `dispose()`.
2. **`src/database/write.ts`** — `updateCell` and `deleteRow` take `database: DatabaseSync` in place
   of the `databaseOf` callback, and use the `target` for its object and values only. `RowKeyStore`'s
   database field is then read by nothing, so it goes too.
3. **`src/database/row-keys.ts`** — drop `database` from `RowTarget` and from `mint`'s parameters,
   and say in the module comment why a key names neither a database nor a value it can construct:
   the store holding it belongs to one database, and the write is handed a handle.
4. **`src/database/grid.ts`** — `runGrid` drops its `databaseName` parameter and the argument it
   passed to `mint`.

## Tests

- `src/database/browser.test.ts` — the file already covers the read path refusing a deleted database
  and a database whose file is gone but whose connection is still open. Add the same two cases for a
  write: seed a database, take a row key from a grid page, delete the database with
  `runDatabaseCommand('db sqlite delete shop')`, then `updateCell` and `deleteRow` with that key, and
  assert each is refused and that `databaseFileExists('shop')` is still false. Add a third case
  asserting that a key minted against one database cannot write through a browser pointed at
  another — the write must be refused rather than reaching the key's own database.
- `src/database/write.test.ts` and `src/database/grid.test.ts` — the call sites change shape with the
  signatures; every existing case keeps its assertion.

`product/specs/sql-database.md` needs no change: it already says a database deleted while its tab is
open is not an ordinary read failure and that the tab reports it is gone, and it already says a
write cannot address a row the client was not handed.
