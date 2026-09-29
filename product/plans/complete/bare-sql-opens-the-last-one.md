# Open the database a bare `sql` most recently opened

**Complexity: 4/10** — one ordered accessor in the registry, one field on the topic's slice, and
one line in the command. The information already exists in the registry; it is sorted away.

## Goal

`product/specs/sql-database.md` says a bare `sql` opens or focuses the tab for "the most recently
used database", and the plan says "the most recently opened one from `topicData`". `runCommand` in
`src/plugins/sql/activate.ts` actually picks `data.databases.find((entry) => entry.open)?.name` — the
first **alphabetically** among the open ones, because `databaseRefs` in
`src/database/browser-state.ts` sorts by name before publishing.

With one database open the three agree. With two, the command lands on whichever sorts first, which
is not the one the user was last in, and the specification is the only place a reader would learn
that.

`src/connections.ts` keeps open connections in a `Map`, whose key order is exactly open order, and
`listOpenConnections()` sorts that away. The information is present and discarded.

## Approach

Publish the recency rather than re-deriving it, and leave the database switcher's order alone —
alphabetical is right for a list a user picks from, and wrong for a shortcut that means "where I
was".

## Implementation steps

1. **`src/connections.ts`** — add `listOpenConnectionsInRecency()`, returning the map's keys reversed.
   `listOpenConnections()` keeps its sorted contract; other callers depend on that order.
2. **`src/protocol/database.ts`** — `DatabasesView` gains `lastOpened: string | null`. Additive, so
   `TAB_PLUGIN_API_VERSION` does not move, and the field is on the topic's slice rather than on the
   tab payload, so `SQL_PAYLOAD_SCHEMA_VERSION` does not move either.
3. **`src/database/browser-state.ts`** — `databaseRefs` keeps returning name-sorted entries; add a
   sibling that reads the recency order for `DatabaseBrowser.view()` to publish.
4. **`src/plugins/sql/activate.ts`** — `runCommand` picks `data.lastOpened` and falls back to the
   first database by name when nothing is open, which is the case where the shortcut is all the user
   has.
5. **`src/plugins/sql/shared.ts`** — the `isDatabasesData` guard checks the two arrays today; leave
   it, since the fallback in the command covers a slice that predates the field.

## Tests

- `src/database/browser.test.ts` — a case that opens two databases and asserts `view().lastOpened`
  names the second, and that it is null with nothing open.
- `src/plugins/sql/activate.test.ts` — a case that routes a bare `sql` with two open databases named
  in the reverse of alphabetical order, and asserts the tab opened is the one the slice names. The
  fixture's `topicData` is where the field goes.

Every existing case keeps passing; the one-database case is unchanged either way.
