# SQL database browser

**Complexity: 8/10** — a new subsystem (a read/write browser over the connection registry) behind a new host topic, roughly twenty new modules across both trees, and the first bundled plugin that *mutates* data: nine topic actions, opaque server-minted row tokens, bound-parameter filtering, two layouts, and a client chunk of its own. No new dependency and no new networked subsystem — the engine is the `node:sqlite` module the app already imports, and the transport is the plugin topic the app already carries.

Janissary can run SQL against a local SQLite database from a command bar — `db sqlite query notes "SELECT * FROM orders"` prints an aligned text table into a transcript (`product/specs/database.md`). That is the whole of it: a command, a paragraph of prose per invocation, and no way to see what a database *contains* before deciding what to query. A user who has just created a database has to know its table names from memory, and a user inspecting one table has to re-type the `SELECT` every time they want a different filter, sort, or page.

This adds a bundled tab plugin, reached by the `sql` command, that browses a database instead of querying it blind. The tab is one metadata row and one body. The row carries a database dropdown, a table dropdown listing every table, view, index, and trigger, and the tab's actions. The body is a data grid for the selected object, with per-column and all-column filtering, ordering, paging, cell editing, row insert and delete, column hiding, row highlighting and copy, CSV and JSON export, and following a foreign key into the row it names. The tab's bottom line is a SQL console. A statement's result, and every SQL failure, is reported to the notifications feed attributed to the database's tab rather than drawn in the tab. It is dockable into either sidebar like the schedules and sessions views, so it can live beside an agent tab rather than replacing it.

The plugin owns none of this. The connection registry, the name rules, the read/write split, and the file location are `src/connections.ts` and `src/database/`, and the plugin reaches them only through a new `databases` host topic — the same narrow, declared grant the conversations and sessions plugins use. Every statement the grid runs is a prepared statement with bound parameters, and every write is addressed by an opaque server-minted row token, so a client can neither inject a value into a statement nor name a row it was not handed.

## Design decisions

### The command and the tab

**The command is `sql`, not `db`.** `db` and `database` are already core commands (`src/commands/db.ts`, registered as `database` in `src/commands/index.ts`), and a plugin command claim colliding with a built-in is refused at startup — the plugin would be born disabled. `sql` collides with nothing in the built-in command set, the reserved words, or any bundled plugin's claim.

**The grammar is `sql [<name>] [left|right]`.** `sql` alone opens or focuses the tab for the database the registry most recently opened a connection to (`DatabasesView.lastOpened`, from `listOpenConnectionsInRecency()` in `src/connections.ts`), falling back to the first database by name when none is open, and undocks it back to the centre. `sql <name>` opens or focuses that database's tab and leaves its dock state alone. `sql left`/`sql right` and `sql <name> left|right` dock the tab into that sidebar — the `schedules [left|right]` grammar, so a database actually named `left` or `right` is unreachable by name, the same trade the conversations plugin documents. With no databases at all, `sql` reports `No databases. Create one with: db sqlite create <name>`. A name the registry's rule refuses is refused with `Invalid database name "<name>".`

**`sql` never creates a database.** A name the registry does not have is refused with `No database named "<name>". Create it with: db sqlite create <name>`, from the command and from the tab's database dropdown alike. A typed name is far more likely to be a typo than a wish for a new database, and reading a schema opens a connection, which is what creates the file. `db sqlite create` is the only way to make one. An earlier version offered a `New database…` field in the dropdown; it was removed so databases belong to the command line. The topic's `create` action remains on the host but the plugin never sends it.

**One tab per database, keyed by `sqlite:<name>`.** The instance key mirrors the connection id, so reopening focuses the tab already there and keeps its filters, page, and exports, and two databases can be browsed side by side. The tab's strip title is the database name and its label prefix is `sql`. Choosing another database in the dropdown opens or focuses *that* database's tab rather than repointing this one.

**A database deleted while its tab is open is told to its tab.** `db sqlite delete` marks the database deleted in `browser-state.ts`, and every read and write checks the file or an open connection *before* `getConnection`, because opening is what creates. The tab drops its grid and its header reads `Database "<name>" does not exist. Create it to start.` rather than keeping rows that describe a file which is gone, and **Refresh** says the same instead of bringing an empty database back. The tab is not closed.

### The topic and the request round trip

**A new `databases` host topic, not a new capability.** A server plugin may import only `../api.js`, `../files.js`, and two named opener helpers (`eslint.plugin-boundaries.mjs`), so the plugin cannot reach `src/connections.ts`. The addition is purely additive, so `TAB_PLUGIN_API_VERSION` stays at 1: `TabPluginNotificationTopic` gains `'databases'`, `NOTIFICATION_TOPICS` gains the matching `true`, `TabPluginNotification` gains a member carrying `DatabasesView`, and `TabPluginTopicAction` gains eight actions — `create`, `schema`, `query`, `run`, `updateCell`, `insertRow`, `deleteRow`, `export` — each carrying `topic: 'databases'`, the `database` it names, and the `requestId` it answers under. `actOnDatabases` in `src/plugins/topics.ts` delegates each to a `DatabaseManager.browse*` method and emits one `databases` `{ type: 'changed' }` bus event.

**The plugin mints the request id and the host echoes it.** The plugin mints it with `randomUUID()` (`src/plugins/sql/request.ts`); the host passes it through rather than issuing one, because two plugins on one topic would otherwise both mint `q1`. The plugin matches an answer on `requestId` and `database`.

**The tab's own state is its payload, and the request is recorded before it is sent.** `topicAction` returns nothing, so the answer arrives on the next `databases` delivery — and that delivery is synchronous, re-entering `notify` before `topicAction` returns. So `dispatch` writes the per-tab mirror and publishes the tab with its `pending` request *before* calling `topicAction`. `pending` carries the request id and the follow-up the answer implies (`schema`, `query`, `console`, or `export`), so "what happens once this lands" is part of the request rather than a guess. `fold.ts` does no I/O: it turns an answer into a new payload and an optional follow-up request. A schema answer keeps the selected object if it still exists, otherwise takes the first table, otherwise the first object, and asks for its page; a grid write re-reads the page; a console write re-reads the schema and then the page. The one thing the plugin keeps outside a payload is the last payload it wrote per tab, because a notification carries no payloads to fold into; that mirror is pruned against the open-tab set on every notification. An answer that never arrives — evicted, or a delivery that predates the request — is re-issued, a pending grid query as a query and anything else as a schema read, so a statement is never run twice.

**Results are a capped, most-recent-first list.** `DatabasesView` is `{ databases, results, lastOpened }`, where `databases` is every database the registry knows (disk files plus open connections, sorted, each once) and `results` is the most recent 32 answers across every request, newest first (`RESULT_LIMIT` in `src/database/browser-state.ts`). The cap bounds the payload on the hot broadcast path (`ai/guidelines/plugins.md`).

**The payload's page sizes are the payload's.** `pageSizes` (50, 100, 500) rides in the payload so the client and the intent guard agree, and `isSqlPayload` rejects a size the guard would refuse. The payload guard still accepts and ignores a legacy `stats` part, so a profile captured before statistics were removed still loads.

### Reading: filters, ordering, paging, totals

**Every value is bound; only identifiers are interpolated.** The grid's `SELECT`, `WHERE`, `ORDER BY`, and `LIMIT ? OFFSET ?` are built in `src/database/grid-sql.ts` from the schema the server itself read, so every object and column name is quoted with doubled `"` and never taken from the client. Values are bound through `StatementSync`, the first prepared-parameter path in this codebase. The operators are `contains` (`LIKE`), `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `isNull`, and `notNull`; a value that parses as a finite number binds as a number and one that does not binds as text; `isNull`/`notNull` bind nothing. `contains` escapes `\`, `%`, and `_` in the value and every grid `LIKE` carries `ESCAPE '\'`, so a value is a value and never a pattern.

**One filter per column, and a filter can be parked.** Setting a filter replaces that column's filter, and setting an identical one removes it, so experimenting does not accumulate a list. Double-clicking a filter chip switches it off and on (`set-filter-enabled`): a parked filter stays in the chip row, greyed out and struck through, its tooltip reading **Enable** where a live one reads **Disable**, and `gridQueryOf` leaves it out of the query. The flag never reaches the wire. **Clear filters** removes every filter and the search term.

**Search every column.** One term is matched against the whole row as a parenthesised group of `COALESCE(CAST("col" AS TEXT), '') LIKE ? ESCAPE '\'` per column joined with `OR` — the cast lets a number, a blob, and a string be searched alike, and the coalesce stops a null column hiding a row. The group comes first in the `WHERE`, `AND`ed with the per-column filters. It names no column, so it survives a switch to another object; an empty term removes it. Its chip reads `matches "<term>" anywhere`.

**A filter, an order, and a hidden column belong to one object.** Selecting another object (`payload-changes.ts`) drops the filters, hidden columns, and order naming columns it does not have — keeping them would build a statement naming a column that is not there — and keeps everything when the new object's columns are unknown. The server's `resolveOrder` also ignores an undeclared column.

**A grid with no sort still gets a deterministic one.** `LIMIT ? OFFSET ?` with no `ORDER BY` skips and repeats rows as the data changes, so the grid orders by the user's single chosen column (a header press cycles ascending, descending, none), and otherwise by the primary-key columns ascending, falling back to the first column.

**The grid pages, it does not scroll.** A page is 100 rows by default, chosen from 50, 100, or 500; changing the size returns to the first page. The range line reads `Rows 1–100 of 4,213 rows`, `Rows 1–100 of 12 of 4,213 rows` once a filter or a search term narrows the query, or `No rows.` The second figure counts the object with no filters: either kind of narrowing forces one unfiltered `COUNT(*)`, cached per object and cleared by a schema read, a console statement, and every write (`forgetTotals`), so it is right even when the first query for an object arrives already filtered and it never reports an object smaller than the filtered count.

**Following a foreign key.** `schema.ts` reads `PRAGMA foreign_key_list` into `references` on each column, resolving a null target column to the referenced table's single-column primary key. Such a cell is a link titled `<table>.<column>`; activating it sends one `select-object` carrying the column and value, which becomes an `eq` filter replacing any filter on that column. The filter rides inside the selection rather than following it, because a second intent would be answered against the object the user had just left. A null value, or a key whose target cannot be resolved to one column, offers nothing to follow.

### Writing

**Safe editing is structural, not advisory.** A row is named on the wire by an opaque `r<n>` key the server mints when it returns a page (`src/database/row-keys.ts`), one store per database, with the last eight pages resolvable. Every write takes a key; the manager resolves it and builds its own `WHERE` from the primary key it recorded, so a client cannot write a `WHERE`, cannot address a row it was not handed, and a key from another database is refused as stale. A write naming a superseded page is refused with `That row is no longer loaded. Refresh and try again.` Writes open through the same existence check as reads, so a write cannot recreate a deleted database.

**A view, a table with no primary key, and a statement's result are read-only.** With no primary key there is no statement that addresses one row rather than several, and `rowid` is not a safe answer because `VACUUM` reassigns it and a `WITHOUT ROWID` table has none. A statement typed into the console is not necessarily about one object, so its result is `keyless`. The grid bar reads `Read-only: "<name>" is a view.`, `Read-only: "<name>" has no primary key.`, or `Read-only: this is a statement's result, not a table.`, and offers no edit, insert, or delete control. Before sending a write the plugin checks its own payload says the object is writable (`requireWritable`), and an `insert-row` must name the object the tab is showing.

**A database's refusal is a result, not a failure.** `updateCell`, `insertRow`, and `deleteRow` catch SQLite's error (a `CHECK` or `NOT NULL` constraint, say) and record it on the answer, so it reaches the notifications feed and never disables the plugin.

**`NULL` is a distinct state, not the empty string.** A cell is `{ text, isNull }`; a null renders as a muted, italic `NULL`. The cell editor is the host's `InlineEditInput` plus a **NULL** toggle that is local to the edit: it takes effect when the editor commits (Enter or blur), Escape changes nothing, pressing it keeps the caret in the field, a cell that holds null opens with it on, and typing clears it so the typed text is the value.

**Insert row is a reviewable form.** It opens one input per column with a **NULL** toggle each, the `INSERT` it will run shown above **Save** and **Cancel**, and writes nothing until **Save**. A column left alone is not named by the statement, so the table's own `DEFAULT` runs for it; the primary key starts as an explicit null; turning a toggle off returns its column to unnamed. `insertStatement` in `shared.ts` mirrors `write.ts`'s statement shape and tests pin both. **Delete row** asks first through the host's `ConfirmDialog`, naming the table.

### The console and where results go

**The console is the application's own command bar, and the only place SQL is entered.** `SqlConsole` renders `CommandBarShell` labelled `SQL` with `useCommandBarKeys`: Enter sends and clears the line, Shift+Enter starts a new line, and ArrowUp/ArrowDown walk the last fifty statements typed in the tab (stored oldest-first as the hook expects, so ArrowUp recalls the newest). A statement is routed by the same `READ_QUERY` test `db sqlite query` uses, exported from `src/database/query.ts` and re-exported through the plugin API so the two surfaces cannot drift.

**A read fills the grid with at most 200 rows and files the whole result.** A console read is iterated once (`src/database/console-read.ts`): the grid takes the first 200 rows as a `keyless`, read-only result, and a longer one is cut off with the range line reading `First 200 rows of more than 200.` Every read is also written to `.janissary/db/exports/<database>-result-<timestamp>.txt` — a tab-separated header, the rows up to 1,000,000, and a count line — and reported as a one-line notification linking that file: `Query returned 12 rows.`, `Query returned 1 row.`, `Query returned no rows.`, or `Query returned more than 1,000,000 rows; the first 1,000,000 are in the file.` If the file cannot be written, the line carries the header and first forty rows instead and has no link, so a statement never loses what it returned.

**A write runs through `exec` and reports `OK.`** A console write goes through `DatabaseSync.exec`, matching `db sqlite query`, so it accepts a semicolon-separated script and reports `OK.` rather than a changed-row count. On success the tab then reads itself again — the object list, then the page — which is what makes a `CREATE`, `ALTER`, or `DROP` typed into the console show up without a **Refresh**. A read or a failed statement asks for no re-read. A write the grid makes itself re-reads its page and says nothing.

**The tab shows no SQL error.** A failure from a statement, a page read, a write, or an export is reported once to the notifications feed, compared against the payload's previous `error` so a repeated failure is not said twice. The tab's only band is the clipboard fallback, which is text the user asked for, not an error. An earlier error band across the grid was removed because it duplicated the notification.

**Every line names the database's tab.** The plugin API's `notifyUser` gains an options argument: `tab`, an instance key resolved only against the plugin's own open tabs (falling back to the invoking tab), and `openFile`, a file the line links to — the arrangement an auto-approved permission prompt's screen capture uses. A line said while handling a topic notification has no invoking tab, so without `tab` the feed would attribute it to nothing. The host's `notify` now leads a line and a toast with the tab's name (`tab.title ?? label`, recorded as `tabName`) while keeping the label for identity, colour, and folding, so a line reads `● 8:32pm shop: …` rather than `sql: …`.

### The tab's layout and interaction

**One metadata row, one body, in the centre and docked alike.** The row carries the database dropdown and the table dropdown (`Tables`, `Views`, `Indexes`, `Triggers`; an index or trigger is listed but cannot be chosen) on the left, and **Insert row** (writable objects only), **Columns**, **CSV**, **JSON**, the finished export links, and the host's split control on the right. The body is the grid bar (object name, range line, read-only reason), the column chooser and insert form when open, the search field and chip row, the grid, and the pager (**Previous**, the range line, **Next**, the `Rows` size, **Refresh**). A docked tab is the same tab, narrower, so there is no view switch. The first version's schema navigator, `Schema`/`Data` switch, and centre two-column layout were replaced by this, because the dropdown does the navigator's job and one body leaves nothing to switch.

**The grid highlights rows, never cells.** A row is the unit every action names. The first row is highlighted when a page arrives; a press anywhere in a row highlights it and a second press on a cell (a double-click) opens its editor; a shift-click, `Shift+ArrowUp/Down`, or `Shift+Home/End` extends the run; `ArrowUp/Down` move one row and stop at the ends; `Home/End` reach the page's ends; Escape clears the highlight. The left and right arrows are left to the application. The keys are the grid's only while the grid frame has the focus, and a bare `Tab` moves between the command bar and the grid (`Shift+Tab` stays the host's). The page scrolls to follow the highlight and counts the sticky header as out of sight (`reveal-row.ts`). The table has no focus ring. The first column holds **Delete row**, then an empty row header (no row numbers — the pager already says which rows these are).

**Copy is the platform's copy key, as tab-separated rows.** The highlighted rows copy one line each, every column including hidden ones, with a null as `NULL`. A text selection inside one cell is left to the browser. If the clipboard is unavailable the text is shown in a band with **Dismiss** rather than dropped. There is no copy button.

**Values that do not fit are cut off.** `column-fit.ts` finds one width cap by bisection over measured widths and sets it as `--sql-cell-cap`, so the widest values are cut first with an ellipsis and their full text in the cell's tooltip; a header is never cut, a table too wide even at header widths still scrolls sideways, the editing cell is exempt, and the fit is recomputed on resize.

**Columns can be hidden without changing the query.** The **Columns** control (an eye icon, titled `Columns (2 hidden)` when some are) lists the object's columns as toggles with **Show all** and **Done**. A hidden column is still selected and filtered, so this is about what is on screen, not what comes back.

### Export

**Export writes the whole filtered, ordered query and serves it through the allow-list.** `CSV` and `JSON` stream the full query with no limit through `StatementSync.iterate()` (`src/database/export.ts`), CSV with RFC 4180 quoting, JSON with `JSON.stringify`, to `.janissary/db/exports/<database>-<object>-<n>.<ext>` with the first free `n`. The directory comes from `dbExportDir()` in `src/connections.ts`, so nothing outside that module can name a path under the database directory. An object name is reduced to `[A-Za-z0-9._-]` so it can never leave that directory, and one left with no letter or digit is refused with `Cannot export "<name>": its name has no characters a file can carry.` An export over 1,000,000 rows is refused with `Export too large: <n> rows (limit 1,000,000). Add a filter and try again.` The plugin registers each file from the `updateTab` payload factory (`resources.registerFile`) and the client renders it as a download link through `capabilities.resourceUrl`; the last five are kept. Both buttons are unavailable while a request is pending or no object is selected.

### What was built and taken back out

The branch built, then removed, several things the first plan called for or review added, and the reasons are what keep them from being re-proposed:

- **Statistics** (the `stats` action, `stats.ts`, `StatsPanel`): a per-column distribution is a statement the console can run, and a control for it was one more thing between the user and the rows.
- **The generated-SQL drawer, its `Copy` and `Run`, the statement log, and the history picker:** a second place to see and run SQL, when the command bar's ArrowUp recall is the way back to what was typed and a result belongs in the notifications feed where it outlasts the tab.
- **A copy button:** it duplicated the platform copy key.
- **A go-to-row field in the pager:** a third way to navigate; the console's `LIMIT`/`OFFSET` reaches far rows.
- **Cell-level selection and a two-dimensional cursor:** a row is the unit.
- **The schema navigator and the `Schema`/`Data` switch**, **row numbers**, **the in-tab error band**, and **`New database…`:** covered above.

**The tab does not add a `sqlite:` row to its own connections panel.** Attribution is recorded when a `db` command runs *in* a tab, and a plugin tab runs none. The connection is global, so it appears in `connection list` and tab-completion app-wide, and `connection close sqlite:<name>` closes it.

**No live updates.** The grid re-reads on a user action and after a console statement, and on nothing else. A `db` command in another tab leaves the view showing what it last read; **Refresh** fixes it. Wiring the raw state broadcast in as a topic is forbidden (`ai/guidelines/plugins-tabs.md`).

## What already exists (reuse, don't rebuild)

| Piece | Where |
| --- | --- |
| The connection registry: open, close, list open, list files, path from name | `src/connections.ts` — `getConnection`, `closeConnection`, `listOpenConnections`, `listDatabaseFiles`, `databaseFileExists`, `dbPath` |
| The name rule that blocks path traversal | `src/connections.ts` `dbPath`; `src/database/parsing.ts` `VALID_NAME` |
| The read/write statement split every SQL surface shares | `src/database/query.ts` `READ_QUERY` (exported, not re-derived) |
| The manager that owns the connection facade and per-tab attribution | `src/database/manager.ts` `DatabaseManager` — gains browser methods, not a second manager |
| Topic declaration union, the keyed table, and the discriminated notification | `src/plugins/api-topics.ts`; `src/plugins/topics.ts` `TOPIC_SOURCES` |
| A topic whose `read` is an object with an `empty` fallback | `src/plugins/topics.ts` (the `conversations` entry) |
| The named low-frequency bus channel a topic subscribes to | `src/bus.ts` `BusChannels` |
| A plugin reached only by its own command, refusing files | `src/plugins/no-file-opener.ts` `noFileOpener` |
| The dock argument grammar | `src/plugins/dock-argument.ts` |
| The host command bar, its keymap, and its history walk | `web/src/plugins/api.ts` — `CommandBarShell`, `useCommandBarKeys` |
| The host inline-edit field and confirmation dialog | `web/src/plugins/api.ts` — `InlineEditInput`, `ConfirmDialog` |
| Registering a file for the authenticated `/open/` allow-list | `resources.registerFile` in a payload factory |
| A notification line that links a file | the auto-approved permission prompt's screen capture in `src/notifications/` |
| The published list-selection rule | `web/src/plugins/api.ts` `nextListSelection`, which `sql-keys.ts` `nextRowSelection` follows without wrapping |
| Client lazy-chunk registration and its schema-version pin | `web/src/plugins/registry.tsx` and its test |
| A plugin stylesheet loaded from its own entry | `web/src/plugins/schedules/schedules.css` |

## Proposed changes

**Wire types.** `src/protocol/database.ts` holds the browser's view types, re-exported from `src/protocol.ts` and, for plugins, from `src/plugins/api.ts`: `DatabaseRefView`, `DatabaseObjectView` with its `DatabaseColumnView` list (name, type, not-null, primary-key ordinal, optional `references`), `DatabaseCellView`, `DatabaseRowView`, `DatabaseGridQuery` (object, filters, `global`, order, limit, offset), `DatabaseGridView` (statement, parameters, columns, rows, total, unfiltered total, offset, limit, order used, `truncated?`, `keyless?`), `DatabaseStatementReport`, `DatabasesView`, and the `DatabaseResultView` union of `schema`, `query`, `write`, and `export`, each carrying its `requestId` and `database`. No RPC changes: results ride the existing topic notification.

**Server: the browser modules under `src/database/`.**

- `schema.ts` — the object list from `sqlite_schema`, each object's columns from `PRAGMA table_info`, its foreign keys from `PRAGMA foreign_key_list`, whether it is writable, and identifier quoting.
- `grid-sql.ts` — the grid statement, its bound values, the all-column group, `LIKE` escaping, and `resolveOrder`.
- `grid.ts` — runs a grid query with column names from `statement.columns()`, and the filtered and unfiltered totals.
- `row-keys.ts` — the per-database opaque key store, value coercion across the wire, and the `WHERE` a resolved key builds.
- `write.ts` — `updateCell`, `insertRow`, and `deleteRow`, each refusing a keyless table before preparing anything and taking its object from the key.
- `export.ts` — the streaming CSV and JSON writers, `safeFileName`, numbered names, the row ceiling, and the console result file.
- `console-read.ts` — one iteration of a console read into a 200-row grid, a result file, and the one-line report.
- `browser-state.ts` — the capped answer list, the database list, `lastOpened`, and the deleted-database marks.
- `browser.ts` — `DatabaseBrowser`, the stateful half: the key stores, the unfiltered-count cache, the existence check before every open, and one method per action.
- `manager.ts` gains `listFiles()`, one `browse*` method per action, and `readView()`; `closeAll` disposes the browser. Nothing existing changes. `query.ts` exports `READ_QUERY` and is otherwise untouched.

**Server: the registry, the topic, and notifications.** `src/connections.ts` gains `dbExportDir()` and `listOpenConnectionsInRecency()`. `src/bus.ts` gains the `databases` channel. `src/plugins/api-topics.ts`, `topics.ts`, and `api.ts` gain the topic, its actions, `actOnDatabases`, and the re-exports. `src/plugins/context.ts` and `api.ts` widen `notifyUser` to `notifyUser(text, { tab?, openFile? })`. `src/notifications/index.ts`, `queue.ts`, and `deliver.ts` lead a line and a toast with the tab's name and record `tabName`.

**Server: the plugin, `src/plugins/sql/`.** `manifest.ts` (id `sql`, version `1.0.0`, `tabLabelPrefix` `sql`, no `fileExtensions`, `command: 'sql'`, `notifications: ['databases']`, capabilities `openOrFocusTab`, `updateTab`, `dockTab`, `topicData`, `topicAction`, `notifyUser`, `rejectRequest`, `reportFailure`), registered in `src/plugins/catalog.ts` and `loaders.ts`. `shared.ts` holds the import-free payload contract, its guards, and `insertStatement`; `shared-intents.ts` the intent payload guards. `tabs.ts` holds instance keys, the empty payload, and the per-tab mirror; `request.ts` mints ids and dispatches; `open-tab.ts` opens or focuses a database's tab; `payload-changes.ts` applies a selection or filter change; `fold.ts` folds an answer and registers exports; `intents.ts` maps sixteen intents — `open`, `select-object`, `set-filter`, `set-filter-enabled`, `clear-filters`, `set-columns`, `set-global-filter`, `set-order`, `set-page`, `set-page-size`, `refresh`, `run`, `update-cell`, `insert-row`, `delete-row`, `export` — to topic actions; `activate.ts` wires the command, the notification fold, and the notifications the tab reports.

**Client: the plugin, `web/src/plugins/sql/`.** `index.tsx` (entry, payload predicate), `SqlTab.tsx` (the frame, metadata row, and pane focus), `DatabaseSwitcher.tsx`, `TableSwitcher.tsx`, `DataGrid.tsx`, `GridRow.tsx`, `CellEditor.tsx`, `Filters.tsx` (filter row, search field, chips), `Pager.tsx`, `ColumnChooser.tsx`, `InsertForm.tsx`, `DeleteRowDialog.tsx`, `ExportButtons.tsx`, `SqlConsole.tsx`, `selection.tsx` (row highlighting and copy), `sql-keys.ts`, `reveal-row.ts`, `column-fit.ts` and `useColumnFit.ts`, `grid-view.ts` (pure: range and count lines, read-only reasons, row ranges, visible columns, TSV, chip text), `fixture.ts`, and `sql.css`. The root carries `data-doc-shot="sql-tab"`. The lazy entry is registered in `web/src/plugins/registry.tsx` with its schema-version literal pinned by the registry test.

**Specs and docs.** A new `product/specs/sql-database.md`. A bundled-plugin section and the fourth host topic in `product/specs/tab-plugins.md`, with the widened `notifyUser` grant. A browsing note in `product/specs/database.md`, the global-connection note in `product/specs/connection.md`, and the file link and tab-name header in `product/specs/notifications.md`. The request-id round trip in `documentation/developer-documentation/tab-plugins.md` and `ai/guidelines/plugins-tabs.md`, and the tab-name header in `documentation/user-documentation/tab-types/notifications.md`.

## Tests

- `src/database/schema.test.ts` — objects in their groups with `sqlite_` internals excluded; columns with types, not-null, and key ordinals; an empty database; foreign keys single, composite, absent, a null target resolved to the referenced key, unresolvable, and self-referencing.
- `src/database/grid.test.ts` — each operator's clause and bindings; a quoted value bound, not interpolated; number-versus-text binding; ordering and `resolveOrder`'s fallbacks; totals; a page past the end; key round trips and superseded keys; the all-column group, its bindings and count; `LIKE` escaping against real rows.
- `src/database/write.test.ts` — each write touches exactly its row; keyless tables refused before any statement; superseded keys and unknown columns refused; an explicit null versus an omitted column on a `DEFAULT` table.
- `src/database/export.test.ts` — CSV quoting, JSON round trip, the whole filtered query, numbered names, `safeFileName` and a traversal name staying inside the directory, and the timestamped console result file.
- `src/database/console-read.test.ts` — the report line and file for many, one, and no rows; the million-row cap; the forty-line fallback; the 200-row grid; the statement prepared once.
- `src/database/browser.test.ts` — answers recorded and capped; a deleted database is refused without recreating its file; a key from another database is stale; the console cut-off; `lastOpened`; unfiltered totals across writes, console statements, and a first filtered query; refused writes recorded, not thrown; `keyless` only on console grids.
- `src/database/manager.test.ts` — `listFiles`, `create` in the registry, `readView`.
- `src/plugins/topics.test.ts`, `src/plugins/api-topics.test.ts` — the topic's routes carry the id, a real-manager round trip, and the keyed record matches the union.
- `src/plugins/notify-user.test.ts`, `src/notifications/index.test.ts` — attribution to the plugin's own tab and its fallbacks, the file link, and a line and toast leading with the tab's name while the record keeps the label.
- `src/plugins/sql/shared.test.ts` — payload and intent guards, including page sizes, foreign-key columns, `hidden`, `enabled`, `truncated`, `keyless`, and the legacy `stats` part.
- `src/plugins/sql/activate.test.ts` — the command grammar, refusals, and docking; every intent's action; follow-ups converging on a schema and a page; re-issue; object-switch drops; filter parking; failures notified once; refused writes keeping the plugin; console follow-ups; notification text, attribution, and file.
- `web/src/plugins/sql/grid-view.test.ts`, `DataGrid.test.tsx`, `Pager.test.tsx`, `Selection.test.tsx`, `SqlConsole.test.tsx`, `SqlTab.test.tsx`, `TableSwitcher.test.tsx`, `sql-keys.test.ts`, `reveal-row.test.ts`, `column-fit.test.ts`, `sql-style.test.ts` — the range and count lines and read-only reasons; foreign-key cells; search and chips; the cell editor's NULL toggle; the insert form; row highlighting, keys, copy, and the clipboard band; pane focus; the console's recall; export controls; the table dropdown; scrolling past the sticky header; the column fit; and the stylesheet's containment and the absence of removed controls.
- `web/src/plugins/registry.test.tsx` — the `sql` entry and its schema-version pin.

## Out of scope

- **Any engine but SQLite**, and **databases outside `.janissary/db/sqlite/`**: only the registry's own databases, by name, are reachable.
- **Creating a database from the tab.** `db sqlite create` is the only way.
- **Schema mutation from the grid.** The console is the way to `CREATE`, `ALTER`, or `DROP`.
- **Joins, a query builder, or following a key backwards.** The grid is one object at a time, and a key is followed one hop.
- **Editing a table with no primary key**, and minting keys for a console result.
- **Statistics, a generated-SQL view, a statement log, a copy button, and a go-to-row field** — built and removed, as recorded above.
- **Multiple result tabs for one database, persisted view state, or saved filters.**
- **Live updates from another tab's `db` command.**
- **Undo, paste, copying headers, or copying a whole object.**
- **Column reordering, freezing, resizing, or truncating headers.**
- **Removing old result and export files**, and a file attached to a count or a failure line.
- **Closing a tab when its database is deleted.**
- **PageUp/PageDown and type-ahead in the grid.**
- **A `sqlite:` row in the browser tab's own connections panel.**

## Open questions

- **Should the browser tab list itself in the connections panel?** No, for the reason recorded above. If it should, the change is one `tab` field on the write-shaped actions plus one line in `actOnDatabases`, weighed against letting a client name a tab.
- **Whether a table's `rowid` should be shown as a read-only column.** Left out: it is not a declared column, and showing it changes what `SELECT *` means to the user.

## Verification

- `./scripts/run.mjs check-diff` — lints the changed files, incrementally typechecks both projects, and runs the related server and web tests.
- Manual: from a project with no database, run `sql` and confirm it reports `No databases. Create one with: db sqlite create <name>`, and that `sql shop` reports `No database named "shop". Create it with: db sqlite create shop`. Run `db sqlite create shop`, then `sql shop`, and confirm a tab opens showing `No tables.` Type `CREATE TABLE orders (id INTEGER PRIMARY KEY, customer TEXT NOT NULL, status TEXT, total REAL)` into the `SQL` console and confirm `OK.` in the notifications feed attributed to `shop` and `orders` coming up as the grid's four headers without a **Refresh**. Insert rows from the console, then `SELECT * FROM orders` and confirm the notification links a result file and the grid reads `Read-only: this is a statement's result, not a table.` Choose `orders` again from the table dropdown; add a filter on `status`, double-click its chip to park it, and search every column. Double-click a `status` cell, type a value, and press Enter; toggle **NULL** on a `total` cell and confirm the muted `NULL`. **Insert row**, confirm the preview and that nothing is written until **Save**; **Delete row** and confirm the dialog. Create a table with no primary key and confirm `Read-only: "log" has no primary key.` with no edit, insert, or delete control. Export CSV and JSON and confirm both land in `.janissary/db/exports/` and download from the tab's links. Highlight a run of rows, copy, and paste into a spreadsheet. Run `sql shop left` to dock and bare `sql` to undock, and `sql shop` twice to confirm the same tab is focused.
