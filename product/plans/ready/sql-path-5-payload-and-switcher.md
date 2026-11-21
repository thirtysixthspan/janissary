# Path-backed payload contract and the read-only database switcher

**Complexity: 5/10** — ~28 added production lines across four files plus one pure label module, 10 requirements and 12 test scenarios (p=5.67).

## Goal

Give SQL tab payloads an explicit optional marker for a path-backed database, bump the payload schema and its client registration literal together, seed the marker when a path tab opens, and make `DatabaseSwitcher` show a read-only labelled span with the full path as a tooltip for those tabs while leaving named tabs' select unchanged.

## Design decisions and dependencies

The source plan is `./product/plans/complete/sql-path.md`. This subplan depends on `./product/plans/ready/sql-path-4-dock-removal.md` (and through it on subplans 1–3): the command, browser and tab opener are complete, so this subplan only changes the wire contract and the client view. Subplan 6 (`./product/plans/ready/sql-path-6-specs.md`) documents it. Land this subplan after subplan 4 and before subplan 6: the `open-tab.ts` seed edit below applies to the three-argument `openDatabase` that subplan 4 leaves behind, and the schema bump changes the wire contract, so every checkpoint must keep the shared constant, the manifest-derived declaration and the client literal in agreement.

- The new field is `databasePath?: string | null`, holding the resolved absolute path on a path-backed tab and absent on a named tab. The server writes only a string or omits it; `null` is in the type because the guard below admits it, the same way `grid`, `error` and `pending` are typed `| null` at `src/plugins/sql/shared.ts:131`, `:134` and `:135`. The client must not infer path-ness from the shape of `payload.database`: a named database whose file was deleted also leaves the dropdown list (`listDatabaseFiles` at `src/connections.ts:37` no longer lists it), so its name would look equally unlike any option. An explicit field is the only reliable signal.
- `isSqlPayload` accepts the field through the existing `isOptional(isString)` helper at `src/plugins/sql/shared.ts:151`, added to the `parts` array at `:250`; an omitted or `null` value is accepted as well as a string, and any other type is rejected. `payload.database` remains the identity used by topic actions (`src/plugins/sql/intents.ts:168`, `:179`, `:190`), request matching (`src/plugins/sql/tabs.ts:78`) and the tab key (`src/plugins/sql/request.ts:32`), so every read, write and notification path keeps working unchanged.
- `SQL_PAYLOAD_SCHEMA_VERSION` at `src/plugins/sql/shared.ts:1` moves from `1` to `2` and the `sql` literal in `clientPluginRegistry` (`web/src/plugins/registry.tsx:109`) moves with it in this same subplan. The server declaration `payloadSchemaVersion` at `src/plugins/sql/manifest.ts:11` already imports that constant, so it follows the bump with no edit; the host checks the envelope against that declaration (`ai/guidelines/plugins-tabs.md:60`, `:75`), while the parity test at `web/src/plugins/registry.test.tsx:48` checks the client literal against the constant — bumping the constant without the literal fails that test. Landing the two edits together keeps the contract matched at every checkpoint. Schema versions in the registry stay literals rather than imports, per `ai/guidelines/plugins-tabs.md:121`.
- `open-tab.ts` supplies the marker for a path tab by spreading the `emptyPayload(database, refs(databasesFrom(capabilities).databases))` seed at `src/plugins/sql/open-tab.ts:44` with `{ databasePath: database }` when `path.isAbsolute(database)`; named tabs produce the same object as before. Subplan 2 already added the `path.isAbsolute` discriminator and the basename title computation to this function; this subplan changes only the seed — not the signature, key, title or dispatch. `emptyPayload` at `src/plugins/sql/tabs.ts:39` itself needs no change.
- `DatabaseSwitcher` branches on `typeof payload.databasePath === 'string'`, not on `!== undefined`: the guard admits `null`, and a null value would otherwise take the path branch and break the span's title and label. For a path tab it renders no `<select>` at all — a plain read-only `<span className="sql-database" title={payload.databasePath}>` showing the derived label — so there is no misleading selectable list whose value has no matching option. An omitted or `null` field renders the existing select, options and `onOpen` behavior verbatim. The label is derived from the last `/`-separated segment of `databasePath` with one trailing `.sqlite` removed case-insensitively; an earlier `.sqlite` and any other extension (for example `.db`) are kept. That derivation goes in a small pure, import-free module beside the component, colocated under `web/src/plugins/sql/`: the tab title is computed server-side in subplan 2 (`src/plugins/sql/open-tab.ts`) and the browser bundle cannot use `node:path`, so the client derives its own label from the string.
- No key binding, focus order or layout change: the span uses the existing `sql-database` slot in the metadata row (`web/src/plugins/sql/SqlTab.tsx:61`), and `.sql-database` at `web/src/plugins/sql/sql.css:13` already styles a span the way it styles the select, so no CSS edit is needed and `SqlTab.tsx` itself is not edited. No new UI surface: no file picker, drag-and-drop, or database-dropdown entry for path-backed databases.
- `src/plugins/sql/shared.ts` is at 196 counted lines for `max-lines` (`eslint.config.mjs:62`, maximum 200 with blanks and comments skipped); the field declaration and one `parts` entry bring it to about 198. Add no other counted line there and no new helper function in that file — reuse `isOptional` in the entry. If more room is needed, extract into a new module rather than compacting code.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| `SqlPayload`, `isSqlPayload`, `isOptional`, `SQL_PAYLOAD_SCHEMA_VERSION` | `src/plugins/sql/shared.ts:108`, `:248`, `:151`, `:1` | Extended in place; the guard stays import-free and close to the `max-lines` ceiling. |
| `emptyPayload`, `instanceKeyFor` | `src/plugins/sql/tabs.ts:39`, `:59` | Reused unchanged; the marker is spread onto the seed in `open-tab.ts`. |
| Server schema declaration | `src/plugins/sql/manifest.ts:11` | Derives `payloadSchemaVersion` from `SQL_PAYLOAD_SCHEMA_VERSION`, so the constant bump updates it; no edit here. |
| Client entry guard | `web/src/plugins/sql/index.tsx:5` | Re-exports `isSqlPayload` as `isPayload`; no edit. |
| `clientPluginRegistry` literal and its parity test | `web/src/plugins/registry.tsx:109`, `web/src/plugins/registry.test.tsx:48` | Literal bumped in the same edit; the existing parity test needs no edit. |
| `DatabaseSwitcher` and its slot | `web/src/plugins/sql/DatabaseSwitcher.tsx`, `web/src/plugins/sql/SqlTab.tsx:61` | Branch added in the component; the caller is unchanged. |
| `sql-database` styling | `web/src/plugins/sql/sql.css:13` | Applies to a span as well as the select; no CSS edit. |
| Client component-test conventions and a well-formed payload builder | `web/src/plugins/sql/TableSwitcher.test.tsx:26`, `web/src/plugins/sql/fixture.ts:62` | Pattern for the new colocated `DatabaseSwitcher.test.tsx`; `DatabaseSwitcher` takes only `payload` and `onOpen`, so it needs no fake capabilities. |
| Payload guard cases | `src/plugins/sql/shared.test.ts` | Pattern for the new optional-field cases. |

## Proposed changes

- `src/plugins/sql/shared.ts`: add `databasePath?: string | null` to `SqlPayload` with a comment stating it is present only for a path-backed tab; validate it in the `parts` array of `isSqlPayload` with `isOptional(isString)` (the two added lines are the whole budget under `max-lines`); change `SQL_PAYLOAD_SCHEMA_VERSION` to `2`. Do not add a helper here.
- `web/src/plugins/registry.tsx`: change the `sql` registration to `clientPlugin(2, clientPluginLoaders.sql)`. `src/plugins/sql/manifest.ts` needs no edit because it imports the constant.
- `src/plugins/sql/open-tab.ts`: spread the marker onto the seeded payload when `path.isAbsolute(database)`; the named path produces exactly the previous `emptyPayload` result. No change to the signature, key, title or dispatch logic from subplans 2 and 4.
- `web/src/plugins/sql/database-label.ts` (new): a pure, import-free function that turns a `databasePath` string into the label text — last `/`-separated segment, one trailing `.sqlite` removed case-insensitively, an earlier `.sqlite` and other extensions kept.
- `web/src/plugins/sql/DatabaseSwitcher.tsx`: branch on `typeof payload.databasePath === 'string'`. A path tab renders the read-only labelled span with `title={payload.databasePath}`, `className="sql-database"` and the derived label, and no `<select>`; an omitted or `null` field keeps the current select verbatim. Does nothing with `onOpen` on a path tab, since there is nothing selectable.
- `src/plugins/sql/shared.test.ts`: add guard cases for a path payload with a string `databasePath`, a named payload without the field, a payload with `databasePath: null` still accepted, and a payload whose `databasePath` is a number or object being rejected.
- `web/src/plugins/sql/DatabaseSwitcher.test.tsx` (new): a path payload renders the span with the derived label and the full path in its tooltip, renders no select, and renders a named payload as the existing select that fires `onOpen` on change; `databasePath` set to `null` or omitted likewise renders the named select.
- `web/src/plugins/registry.test.tsx`: no edit; the existing assertion that the `sql` literal equals `SQL_PAYLOAD_SCHEMA_VERSION` must pass with both set to `2`.

## Tests

- `src/plugins/sql/shared.test.ts`: the four guard cases above, beside the existing payload-shape cases.
- `web/src/plugins/sql/DatabaseSwitcher.test.tsx` (new): label and tooltip for a path payload; a `.SQLITE` suffix stripped and a `.db` suffix kept in the label; no `<select>`; named select with options and `onOpen` called with the selected name; `databasePath` set to `null` or omitted treated as a named tab.
- `web/src/plugins/registry.test.tsx`: passes unchanged; do not hard-code a second `2` there.
- Run the full `src/plugins/sql/` and `web/src/plugins/sql/` suites, plus the browser and export tests from subplan 1, to confirm the schema bump breaks nothing.

## Verification

Run `$janissary/scripts/run.mjs check-diff`, then, once subplans 1–4 have landed, the manual walk in the running application: type `sql file <path>` for an existing SQLite file outside `.janissary/db/sqlite/`; confirm the tab opens in the centre, browses that file's objects, shows the basename with the full path in the metadata-row tooltip, focuses the same tab on a second invocation, and exports a table to `.janissary/db/exports/`. Also confirm `sql database <name>` still opens a named database with its ordinary select, bare `sql` still opens the last-used database, `sql <name>` and `sql file <path> left` both report the usage line, `sql file <missing>` reports `No database file at "<path>".`, `connections list` does not include the path-backed database, and a statement run in its console is notified on its own tab.

## Out of scope

- No command grammar, browser, tab-key or export change; those are subplans 1–4.
- No spec or documentation edit; that is subplan 6.
- No new UI surface and no changes to the grid, console, filters, export controls, key bindings, focus order or stylesheet.
- No change to the `openDatabase` signature, the tab title, the `instanceKeyFor` key or the dispatch logic; those belong to subplans 2 and 4.
- No reuse of `payload.database` shape as a path signal, and no path-backed database added to the dropdown, tab completion, the name registry, or a tab's own connections panel.
