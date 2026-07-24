# Add test coverage for src/database/query.ts

**Complexity: 2/10** — a new colocated test file for an existing, self-contained module; no
source changes needed. `src/database/manager.test.ts` already establishes the exact pattern for
setting up a temp sqlite dir and running real queries against it.

## Goal

`src/database/query.ts` has no test file despite two functions with real untested edge cases:

- `queryDatabase()`'s `READ_QUERY` regex classification, which decides between
  `database.prepare(query).all()` (read path) and `database.exec(query)` (write path).
- `formatRows()`'s column-width/padding table formatter, including its zero-row and
  mixed-type-cell handling.

Add `src/database/query.test.ts` covering both.

## Approach

Follow the pattern in `src/database/manager.test.ts`: create a temp directory with
`mkdtempSync(path.join(tmpdir(), 'janus-query-'))`, call `initDbDir(dir)`, and clean up
open connections/the temp dir in `afterAll`/`afterEach`. Call `queryDatabase(name, query)`
directly against a real (temp, on-disk) sqlite database — no mocking needed since the module
is already fully exercised through `getConnection`/`databaseFileExists` from `../connections.js`.

## Implementation steps

No source code changes — this is test-only.

## Tests

`src/database/query.test.ts`:

- **Missing database** — `queryDatabase('nope', 'select 1')` returns the "does not exist" message
  when the db file doesn't exist and no connection is open.
- **Read classification** — each of `select`, `pragma`, `with`, `explain` (case-insensitive,
  leading whitespace) routes through the read path and returns a formatted table.
- **Write classification** — `create table`, `insert`, `update`, `delete` route through the write
  path and return `'OK.'`.
- **Query error** — an invalid query (e.g. malformed SQL) on an existing database returns a
  `Query error: ...` message rather than throwing.
- **`formatRows` zero-row case** — a `select` that matches zero rows returns `(0 rows)` (exercised
  via `queryDatabase` against a real empty result set).
- **`formatRows` mixed-type cells** — a row containing `null`, a number, and a string cell renders
  `null`/`undefined` as an empty cell and other values via `String(v)`, with columns padded to the
  widest cell (exercised via `queryDatabase` against a table with mixed column types).

## Verification

- `./scripts/run.mjs check-diff` — lint, incremental typecheck, and the new/related server tests.

## Out of scope

- Any change to `queryDatabase()` or `formatRows()` themselves — this item is test coverage only,
  per the backlog entry's own scope ("add src/database/query.test.ts covering...").
- Testing `errorMessage()` directly — it's exercised indirectly through the error-path tests above.
