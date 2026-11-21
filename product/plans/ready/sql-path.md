# sql <path> opens the sql tab and opens the named sql database

**Complexity: 7/10** — ~70 added lines across 9 production files, 20 behavioral requirements and 29 test scenarios, driven by the path-keyed connection identity that must stay out of every name-keyed list (p=6.92).

`sql file <path>` should open the SQL browser tab and browse the SQLite database at the given filesystem path. Today the `sql` command only reaches databases the registry holds under a validated name, with a path derived from that name under `.janissary/db/sqlite/`; a `.sqlite` file anywhere else on disk is explicitly out of reach. This feature widens the command with an explicit file form so an existing database file is browsable without copying it into the project's database directory, while keeping the name-based form unambiguous under its own keyword.

## Design decisions

- The feature text establishes that the command opens the SQL browser tab (the same tab reached by `sql` and `sql <name>` today) and that the database it opens is the one named by the path.
- The command uses explicit keywords instead of guessing what an argument means: `sql file <path>` opens a database by filesystem path, and `sql database <name>` opens a database by its registry name with all of today's name behavior. The bare `sql <name>` form is removed, so no logic is needed to tell a file from a database name — the first word of the argument says which it is.
- Bare `sql` still opens or focuses the most recently reached open database, or the first by name when none is open.
- Docking is removed from the `sql` command entirely: none of `sql`, `sql file <path>`, or `sql database <name>` accepts a `left`/`right` dock word, and `sql left`/`sql right` no longer dock. Every SQL tab opened by the command lands in the centre. This removes the existing `sql <name> [left|right]` grammar rather than carrying it forward.
- An unrecognized argument — including an old bare name such as `sql shop` and a removed dock word such as `sql left` — is refused with the exact line `Usage: sql [file <path>|database <name>]`, with no special-casing of names or dock words. A keyword with no value (`sql file` or `sql database`) gets that same usage line.
- A path that does not exist is refused with the exact line `No database file at "<path>".` and opens no tab; no file is created.
- A relative path resolves against the project directory — the same base `initDbDir(process.cwd())` already uses for `.janissary/db/sqlite/` — independent of which tab the command is typed in.
- A path-opened database is identified by its resolved absolute path: the tab key and connection are keyed by that path, and the tab is titled with the file's basename without the `.sqlite` extension. The same path reopened focuses one tab; two different paths with the same basename remain distinct tabs. It is not added to the name-keyed registry, the database dropdown, or `connections list`.
- A path under `.janissary/db/sqlite/` is treated as a path like any other, so `sql file .janissary/db/sqlite/shop.sqlite` opens a path-keyed tab distinct from the `sql database shop` tab even though both point at the same file.
- Existing spec behavior still applies to a path whose file cannot be read (not a SQLite database, a directory, or a file another process holds locked): the object list, pages, and exports fail with the SQLite error as notifications and the tab carries on, as `product/specs/sql-database.md` already states.
- Only the `sql file <path>` command opens a path-backed database. The tab's database dropdown keeps listing named databases only; no picker, drag-and-drop, or other surface gains a file-opening ability in this version.
- The change is confined to the `sql` command. `db sqlite query/create/delete/list` keep their name-only behavior, and a path-opened database is reachable only through its SQL tab and console. The SQL plugin still claims no file extensions (`src/plugins/sql/manifest.ts` `fileExtensions: {}`): there is no `open <file>` route, only the command form.
- The keywords `file` and `database` are recognized in lower case only, matching the existing lower-case-only dock words. The value is the remainder of the argument after the keyword, taken verbatim (trimmed at the ends) so a path holding spaces survives; there is no trailing dock word to separate it from.
- Path connections are held by `DatabaseBrowser` in `src/database/browser.ts`, in a map beside the key and row-count maps it already owns, keyed by the resolved absolute path. `src/connections.ts` is untouched: its name-keyed registry and every function in it stay as they are, so a path-backed database cannot enter `connections list`, tab completion, the dropdown (`databaseRefs()` in `src/database/browser-state.ts`), or the choice made by bare `sql`. `connections close sqlite:<name>` cannot close one; `DatabaseBrowser.dispose()`, already called at app exit, closes them. The browser tells the two apart with `path.isAbsolute` — a valid name can never be an absolute path — so no new marker has to travel to the host.
- Existence is checked with `existsSync` on the resolved absolute path before opening; there is no file-type pre-check. A directory or a non-SQLite file is opened and fails on its first read as `product/specs/sql-database.md` already describes, rather than being refused at the command.
- Export and result files for a path-backed database are named from the same basename used for the tab title, reduced with `safeFileName` in `src/database/export.ts`, so they land in `.janissary/db/exports/` like any other export. Passing the absolute path through to `exportRows` would build a name containing path separators and fail.
- Existing behavior, established in `product/specs/sql-database.md`, `product/specs/database.md`, and the code:
  - `sql [name] [left|right]` is parsed by `parseSqlArgument` in `src/plugins/sql/shared-intents.ts`; the trailing `left`/`right` is the dock side (lower case only) and the remaining words are the database name.
  - A name must satisfy `VALID_NAME` (`/^[A-Za-z0-9_-]+$/`, re-checked in `src/plugins/sql/shared-intents.ts` and `/^[\w-]+$/` in `src/connections.ts`). `dbPath` in `src/connections.ts` derives the file path as `.janissary/db/sqlite/<name>.sqlite`.
  - A name the registry has never heard of is refused with `No database named "<name>". Create it with: db sqlite create <name>` (`UNKNOWN_DATABASE` in `src/plugins/sql/open-tab.ts`); a name the rule refuses is rejected with `Invalid database name "<name>".` in `src/plugins/sql/activate.ts`.
  - One tab per database, keyed by `instanceKeyFor(database)` in `src/plugins/sql/tabs.ts`, titled with the database name, and opened/focused by `openDatabase` in `src/plugins/sql/open-tab.ts`. Reopening an open tab focuses it and keeps its payload.
  - SQLite connections are global and keyed by database name in `src/connections.ts`; `getConnection` opens `new DatabaseSync(dbPath(name))` and creates the file when missing.
  - The browser's reads and writes travel over the existing `databases` topic; the server plugin (`src/plugins/sql/`) sends tab payloads to the client plugin (`web/src/plugins/sql/`) through the normal plugin-tab mechanism.

## What already exists (reuse, don't rebuild)

| Concern | Where it already lives |
| --- | --- |
| Parsing the `sql` command's name and dock words | `src/plugins/sql/shared-intents.ts` `parseSqlArgument`, `parseDockArgument` in `src/plugins/api.ts` |
| Name validation and the derived path rule | `src/plugins/sql/shared-intents.ts` `isValidDatabaseName`, `src/connections.ts` `dbPath` / `VALID_DB_NAME` |
| Opening a connection and caching it by identity | `src/connections.ts` `getConnection`, `closeConnection`, `listOpenConnections` |
| Opening/focusing one database's tab and reading its schema | `src/plugins/sql/open-tab.ts` `openDatabase`, `src/plugins/sql/tabs.ts` `instanceKeyFor` / `emptyPayload` |
| Refusing an unknown or malformed database | `src/plugins/sql/open-tab.ts` `UNKNOWN_DATABASE`, `src/plugins/sql/activate.ts` `runCommand` |
| The browser's existence guard and connection lookup | `src/database/browser.ts` `open`, `databaseFileExists`, `getConnection` |
| Safe file naming for exports and result files | `src/database/export.ts` `safeFileName`, `exportRows`, `openResultFile` |
| Name-only database lists and recency | `src/database/browser-state.ts` `databaseRefs`, `lastOpenedDatabase` |
| Payload schema versioning and its client counterpart | `src/plugins/sql/shared.ts` `SQL_PAYLOAD_SCHEMA_VERSION`, `web/src/plugins/registry.tsx` `sql` literal |
| Declared server capabilities | `src/plugins/sql/manifest.ts` |
| The tab the path is browsed in | `web/src/plugins/sql/` (metadata row, database/table dropdowns, data grid, SQL console) |
| The spec describing the command and the tab | `product/specs/sql-database.md`, `product/specs/database.md` |

## Proposed changes

Land the changes in this order, so each checkpoint typechecks and the payload contract never has a mismatched client.

### 1 — Command grammar

- `src/plugins/sql/shared-intents.ts`: delete `parseSqlArgument`; `parseDockArgument` stays where it is for the other plugins that share it. Keep `isValidDatabaseName` for the `database` form and for the `isOpenIntent` guard the dropdown uses.
- `src/plugins/sql/activate.ts` `runCommand`: do the grammar inline — inspect the first word of the argument for lower-case `file` or `database`, take the remainder verbatim as the value, and route to the file opener, the unchanged name opener, or the existing bare `lastOpened ?? databases[0]` choice. Refuse an unrecognized argument and a missing value with the usage line. The file form resolves the value with `node:path` against the process directory (the base `initDbDir` is given at startup) and checks it with `node:fs` `existsSync` before opening; both are Node modules, which the plugin boundary in `eslint.plugin-boundaries.mjs` allows, unlike a host import such as `../connections.js`. This replaces the old ~16-line `dock`/name routing with a comparable amount, so the file stays under 200 lines; no new parser module is warranted.
- `src/plugins/sql/manifest.ts`: drop `dockTab` from `capabilities` — after this change no server-side SQL code calls it. Leave `fileExtensions: {}` and the command registration as they are, and update the comment that currently says a path is unservable: the `open` route is still unclaimed, but the command now serves one.

### 2 — Connection identity

- `src/database/browser.ts`: `open` currently runs `databaseFileExists(database)` then `getConnection(database)`; branch on `path.isAbsolute(database)`: for a path, check `existsSync` on it and open or reuse a handle from a `Map<string, DatabaseSync>` held on the browser, closing those handles in `dispose()`; for a name, keep the existing two calls untouched. Keep the same "existence before opening" order and the same error text for a file that vanished. Every other method — `schema`, `query`, `run`, the write methods, `exportObject` — already receives the database string and needs no change once `open` resolves it. This is the smallest way to keep path connections out of the name registry by construction, and it follows the browser's existing per-database map pattern; no new host module or exported helper is needed.

### 3 — Tab opening and exports

- `src/plugins/sql/open-tab.ts`: `openDatabase` keeps its current contract minus the `dock` parameter and the two `dockTab` calls. For a path it skips the registry-membership check (the command already refused a missing path), seeds `emptyPayload` with the resolved absolute path plus the path marker, and titles the tab with `path.basename` after removing a trailing `.sqlite` (case-insensitively), leaving any other extension in place; `node:path` is already the tool the command uses, so no title helper is added. `instanceKeyFor` in `src/plugins/sql/tabs.ts` already prefixes `sqlite:`, so a path key `sqlite:<absolute path>` cannot collide with a name key.
- `src/database/export.ts`: in `exportObject`, pass `path.basename(database)` rather than the absolute path into `exportRows` and `openResultFile`, reduced with the existing `safeFileName` helper, so the numbered export lands in `dbExportDir()` instead of failing on a name containing `/`. `openResultFile` already applies `safeFileName`, so only the basename needs supplying.

### 4 — Client and specs

- `src/plugins/sql/shared.ts` and `web/src/plugins/registry.tsx`: add the optional path field to `SqlPayload`, accept it in `isSqlPayload`, and bump `SQL_PAYLOAD_SCHEMA_VERSION` and the client registration literal together from `1` to `2`.
- `web/src/plugins/sql/DatabaseSwitcher.tsx`: branch on the new field — render the read-only labelled span with the path tooltip when present, otherwise keep the current select and its `onOpen` behaviour. Add a `DatabaseSwitcher.test.tsx` beside it; none exists yet.
- Specs: update the command section and the two relevant bullets of "What it does not do" in `product/specs/sql-database.md`, the registry description in `product/specs/database.md`, the SQL dock-grammar sentence in `product/specs/tab-plugins.md`, and the connection-list wording in `product/specs/connection.md`. `product/specs/launcher.md` keeps the SQL entry running bare `sql`, which is unchanged.

## UI design

The feature extends the existing SQL browser tab in `web/src/plugins/sql/` — the same surface reached by `sql`, `sql file <path>`, and `sql database <name>`, with its metadata row (database and table dropdowns), data grid, and SQL console. No other UI surface is established by the feature text.

For a path-backed tab, `DatabaseSwitcher` in `web/src/plugins/sql/DatabaseSwitcher.tsx` does not render a `<select>` at all: it shows a plain, read-only label with the database's basename in the existing `sql-database` slot and styling, with a title/tooltip carrying the full absolute path. There is no misleading selectable list whose value has no matching option. For a named tab the existing select is unchanged. No key binding, focus order, or other layout changes are introduced; the tab keeps its existing two-pane `Tab` toggle and the metadata row's existing shape, so the label follows the row's current visual convention.

The client must not have to guess this from the shape of `payload.database`, because a named database whose file was deleted also leaves the dropdown list. `SqlPayload` in `src/plugins/sql/shared.ts` gains an optional field holding the absolute path when the tab is path-backed; it is absent for a named tab. `isSqlPayload` accepts the optional field, `SQL_PAYLOAD_SCHEMA_VERSION` moves from `1` to `2`, and the `sql` literal in the client registration table at `web/src/plugins/registry.tsx` moves with it, as other plugins with bumped payloads already do. `payload.database` remains the identity the topic actions and tab key use, so every existing read, write, and notification path keeps working unchanged.

## Tests

Mirroring the existing colocated conventions (`src/**/*.test.ts`, `web/src/**/*.test.tsx`):

- `src/plugins/sql/activate.test.ts`, first block: `file` and `database` forms produce their values; a path with spaces is preserved; upper-case keywords fall through to usage; the old bare name and `left`/`right` produce the usage outcome; a missing value produces it too; a relative path resolves against the project directory before the existence check.
- `src/plugins/sql/activate.test.ts`, using its existing fake capabilities: `sql file <path>` opens a tab keyed and titled as decided, `sql database <name>` behaves exactly as the old name form, bare `sql` still chooses the last-opened or first name, an unrecognized argument reports `Usage: sql [file <path>|database <name>]`, a missing path reports `No database file at "<path>".`, and `dockTab` is never called. Add a case where the same path is opened twice (one tab) and two paths share a basename (two tabs).
- `src/database/browser.test.ts` and `src/database/browser-faults.test.ts`: a schema read and a query succeed against a path-backed database; its handle lives only on the browser, is absent from `connections list` and the name registry, and is closed by `dispose()`; a directory or non-SQLite path records the SQLite error rather than throwing or disabling the plugin.
- `src/database/export.test.ts`: an export and a statement result for a path-backed database are named from the sanitized basename and stay under the export directory.
- `web/src/plugins/sql/DatabaseSwitcher.test.tsx` (new): a path-backed payload renders the read-only label with the full path in its tooltip; a named payload still renders the select and fires `onOpen`.
- `web/src/plugins/registry.test.tsx`: the `sql` literal matches the new `SQL_PAYLOAD_SCHEMA_VERSION`.

## Out of scope

- Docking from the `sql` command: no form accepts `left`/`right`, and no tab is docked as a side effect of opening one.
- No new UI surface: no file picker, no drag-and-drop, no database-dropdown entry for path-backed databases, and no changes to the grid, console, filters, or export controls.
- No extension of the `db sqlite` command family to paths, and no `.sqlite` file-extension claim for the `open` command.
- No path-backed database in `connections list`, tab completion, the name-keyed registry, or a tab's own connections panel, and no way for `connections close sqlite:<name>` to close one.
- No creation of a database at a missing path.
- All other boundaries from `product/specs/sql-database.md` remain in force: the tab does not change a schema from the grid, does not join tables or build queries, shows no statistics panel, and adds no `sqlite:` row to its own connections panel.

## Verification

- `$janissary/scripts/run.mjs check-diff`
- Manual: in the running application, type `sql file <path>` for an existing SQLite file outside `.janissary/db/sqlite/`; confirm the tab opens in the centre, browsers that file's objects, shows the basename with the full path in the metadata-row tooltip, focuses the same tab on a second invocation, and exports a table to `.janissary/db/exports/`.
- Manual: confirm `sql database <name>` still opens a named database with its ordinary select, bare `sql` still opens the last-used database, `sql <name>` and `sql file <path> left` both report the usage line, and `sql file <missing>` reports `No database file at "<path>".`.
- Manual: run `connections list` and confirm the path-backed database is absent; run a statement in its console and confirm the notification is attributed to its tab.
