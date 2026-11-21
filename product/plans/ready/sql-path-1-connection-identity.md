# Path-keyed connection identity in the database browser

**Complexity: 5/10** — ~35 added lines, one existing file edited plus one new module, 10 requirements and 12 scenarios (p=5.32), driven by the 200-line-limit extraction and the path-keyed handle lifecycle.

## Goal

Give `DatabaseBrowser` a second, path-keyed identity so that a database named by an absolute filesystem path is read, written, and exported through a handle the browser owns privately, while every name-backed database keeps today's behavior. This is the server mechanism the rest of the feature builds on; it changes no command, payload, or UI.

## Design decisions and dependencies

The source plan is `./product/plans/complete/sql-path.md`. This subplan depends on no earlier subplan. It lands before the command grammar so that a path-capable browser exists and is tested before anything routes a path to it; subplan 2 (`./product/plans/ready/sql-path-2-tab-opening.md`) makes the SQL tab opener use this identity, and subplan 3 (`./product/plans/ready/sql-path-3-command-grammar.md`) exposes it through `sql file <path>`. Paths name each plan's final location; this run moves the source to `complete/` and promotes the subplans to `ready/` as it goes.

- `isAbsolute(database)` (imported from `node:path`) is the only discriminator between a path and a name. A registry name can never be absolute: `dbPath` in `src/connections.ts` validates against `/^[\w-]+$/`, and `isValidDatabaseName` in `src/plugins/sql/shared-intents.ts` re-checks `/^[A-Za-z0-9_-]+$/`. No new marker has to travel from the command to the host, and the browser needs no knowledge of plugins.
- Path handles live in a `Map<string, DatabaseSync>` owned by a new `PathHandles` instance that `DatabaseBrowser` holds as a single field (see the file-size decision below). This is still browser-private: `src/connections.ts` is untouched, and `getConnection`, `closeConnection`, `listOpenConnections`, `databaseRefs` (`src/database/browser-state.ts`) and `lastOpenedDatabase` keep their name-keyed behavior, so a path-backed database cannot enter `connections list`, the database dropdown, tab completion, or the choice made by bare `sql`. `connections close sqlite:<name>` cannot close one.
- Existence is checked before opening, with `existsSync` on the absolute path and no file-type pre-check. A missing path returns the exact string `Database "${database}" does not exist. Create it to start.`, the text the name branch uses when a database was deleted (`src/database/browser.ts:82`). The difference is deliberate: the name branch keeps the `isConnectionOpen` grace for a file removed while a handle is live (`src/database/browser.test.ts:481`), while the path branch has no such grace, so a file that disappears after it was opened is reported as missing even if a handle for it is cached. `allowCreate` is ignored by the path branch: the only caller that passes it is `create` (`src/database/browser.ts:114`, reached through `src/plugins/topics.ts:124`), which today carries a name, and subplan 3's `sql file` route goes to the opener rather than to `create`. The path branch therefore never creates a file, whatever the caller passes.
- A directory, a non-SQLite file, or a file another process holds locked is opened and fails on its first read. `schemaRead`, `query`, `run`, `attempted` and `exportObject` already catch SQLite errors into results, so no new error handling is needed and a bad file never disables the plugin.
- Exports and statement results must be named from `basename(database)` (also from `node:path`), not the absolute path. `exportRows` in `src/database/export.ts:115` builds `${databaseName}-${object}-n.ext` under `dbExportDir()` (`src/database/export.ts:139`) and applies `safeFileName` only to the object, so an absolute `databaseName` would put separators into the candidate path and fail; `openResultFile` (`src/database/export.ts:161`) does apply `safeFileName` to the database name, so the same path would degrade into a long dashed name. The two call sites are in `src/database/browser.ts`: `exportObject` (`src/database/browser.ts:253`) passes the basename to `exportRows`, and the `readStatement` callback in `run` (`src/database/browser.ts:195`) passes it to `openResultFile`. `src/database/export.ts` itself needs no edit — the callers supply the basename. The source plan lists `export.ts` under Proposed changes; the actual calls are in `browser.ts`, and this subplan makes the change there while preserving the requirement exactly.
- `dispose()` calls `PathHandles.close()`, which closes each path handle with errors ignored the way `closeConnection` (`src/connections.ts:70`) closes a named handle, then clears the map. Named connections stay owned by `closeAllConnections` at app exit (`src/database/manager.ts:119`).
- The 200-line limit forces the extraction. `eslint.config.mjs:62` enforces `max-lines` at 200 with blanks and comments skipped, and `src/database/browser.ts` is already at 187 counted code lines, leaving 13. Inlining the map, the import changes, the `open` branch and the `dispose` loop would add roughly 17 counted lines and break the build. So the map and its open/close logic go in one new focused module, `src/database/path-handles.ts`, exporting a `PathHandles` class; `DatabaseBrowser` owns one instance and delegates to it. Keep `browser.ts` itself to around five added counted lines. Per `ai/guidelines/code-guidelines.md`, extract a cohesive group rather than compacting code or stripping comments to fit. The new module is not a barrel: `browser.ts` imports `PathHandles` directly from `./path-handles.js` per NodeNext.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| `DatabaseBrowser.open` and its existence-before-open guard | `src/database/browser.ts:81` | Gains a one-line `isAbsolute` branch delegating to `PathHandles`; the name branch is left byte-for-byte. The file is at 187 counted code lines (limit 200), which is why the path logic is extracted. |
| Per-database maps and their teardown | `src/database/browser.ts:37` (`keys`), `:38` (`unfiltered`), `:264` (`dispose`) | Pattern for the extracted `PathHandles` map and its `close()`; `DatabaseBrowserState` (`src/database/browser-state.ts:17`) is the existing example of a small state class owner in its own module. |
| `schemaRead`, `handleFor`, `query`, `run`, `attempted`, `exportObject` | `src/database/browser.ts` | Receive the database string unchanged; only the two export-naming call sites in `run` and `exportObject` change. |
| `errorText` | `src/error-text.ts` | Reused for both branches' catches. |
| `safeFileName`, `exportRows`, `openResultFile`, `dbExportDir` | `src/database/export.ts:54`, `:115`, `:161`, `:80`; `src/connections.ts:20` | Reused unchanged; the basename is supplied by the callers in `browser.ts`. |
| `databaseFileExists`, `getConnection`, `isConnectionOpen`, `closeConnection` | `src/connections.ts` | Reused unchanged for names, never called for paths; `closeConnection` is the ignore-errors teardown pattern `PathHandles.close()` copies. |

## Proposed changes

Add `src/database/path-handles.ts`, exporting a `PathHandles` class that owns a `Map<string, DatabaseSync>` and exposes two methods:

- `open(path)` returns either the opened handle or an error string. It checks `existsSync(path)` first and returns `Database "${path}" does not exist. Create it to start.` when the file is gone; otherwise it reuses the cached handle or opens one with `new DatabaseSync(path)` and stores it, wrapping the open in a try/catch that converts the error with `errorText` (`src/error-text.ts`). It takes no `allowCreate` argument and never creates a file.
- `close()` closes every cached handle with errors ignored, the way `closeConnection` does, then clears the map.

Then, in `src/database/browser.ts`:

- Import `PathHandles` from `./path-handles.js` and `{ basename, isAbsolute }` from `node:path`. Keep the existing type-only `import type { DatabaseSync } from 'node:sqlite'` — construction now lives in `PathHandles`, so no value import is needed here. Relative imports stay NodeNext with `.js` extensions.
- Add one new field on `DatabaseBrowser` holding a single `PathHandles` instance.
- In `open`, test `isAbsolute(database)` first; for a path, delegate to that `PathHandles` instance and return its result. Keep the name branch exactly as it is, including `allowCreate`, `databaseFileExists` and `isConnectionOpen`.
- In `run`, pass `basename(database)` as the first argument of `openResultFile` inside the `readStatement` callback.
- In `exportObject`, pass `basename(database)` as the `databaseName` argument of `exportRows`.
- In `dispose`, call `close()` on the `PathHandles` instance; all three existing clears stay.

## Tests

- `src/database/browser.test.ts` (added cases beside the existing ones, using its real temporary-directory pattern): `schema` and `query` with an absolute path to a seeded SQLite file return the same objects and grid as the named case; a second `schema` reuses the same handle rather than opening a second one; after `dispose()` the handle is closed; `databaseRefs()` and the name-keyed `listOpenConnections()` do not include the path. The existing name tests stay as they are. Seed the path file by opening `new DatabaseSync(absolutePath)` directly and running the SHOP script — the file already imports `DatabaseSync` at `src/database/browser.test.ts:2`, and the existing `seeded()` helper at `:42` creates only the named `shop`. Prove the handle was released by spying on that handle's `close` before `dispose()`; a later `schema` only proves a fresh handle can be opened.
- `src/database/browser-faults.test.ts`: a directory path and a path holding non-SQLite bytes record the SQLite error in the result rather than throwing or disabling the plugin; a path removed after it was opened reports `Database "<path>" does not exist. Create it to start.`, even though a handle was cached — unlike the name branch's live-handle grace, which `src/database/browser.test.ts:481` keeps as a separate, unchanged case.
- `src/database/export.test.ts`: `exportObject` for an absolute path writes `<basename>-<object>-1.csv` (and the JSON counterpart) under `dbExportDir()` and reports that name; a console `run` whose result needs a file writes `<basename>-result-*.txt` under the same directory, with the basename rather than the absolute path in the file name.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Read the diff to confirm the name branch of `open` is unchanged, that `src/connections.ts` and `src/database/export.ts` are not edited, that both export-naming call sites use `basename`, and that `src/database/browser.ts` stays at or under 200 counted code lines with the path logic in the new `src/database/path-handles.ts`. There is no user-visible command yet, so the manual end-to-end walk belongs to subplan 5 (`./product/plans/ready/sql-path-5-payload-and-switcher.md`); this subplan's manual check is the test run above. The final path is `./product/plans/ready/sql-path-1-connection-identity.md`.

## Out of scope

- No command grammar, no `sql file` route, no change to `activate.ts` or the SQL manifest.
- No tab opening, payload field, schema bump, or client change.
- No UI, spec, or documentation edit.
- No change to `src/connections.ts` or `src/database/export.ts`. The only new production file is the line-limit-driven `src/database/path-handles.ts`; no other module, and no new export on `DatabaseBrowser`.
