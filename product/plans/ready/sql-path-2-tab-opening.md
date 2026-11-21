# Path-backed tab opening in the SQL plugin

**Complexity: 3/10** — one existing production file, ~10 added lines, 6 requirements and 8 scenarios, all in `openDatabase`'s path branch and title rule (p=4.58).

## Goal

Make `openDatabase` accept an absolute path as a database identity: skip the registry-membership check for it, key its tab by that path, title the tab from the file's basename, and seed the payload with the path as `payload.database`. Dock behavior and the payload contract stay as they are in this subplan so existing tests and types keep passing.

## Design decisions and dependencies

The source plan is `./product/plans/complete/sql-path.md`. This subplan depends on `./product/plans/ready/sql-path-1-connection-identity.md`, which already makes the browser read and write a path-backed database. Subplan 3 (`./product/plans/ready/sql-path-3-command-grammar.md`) routes `sql file <path>` here; subplan 5 (`./product/plans/ready/sql-path-5-payload-and-switcher.md`) adds the explicit payload marker.

- `path.isAbsolute(database)` is the discriminator, the same test the browser uses in subplan 1. For a path, the registry-membership check is skipped: this function does no existence check and never touches the filesystem. Subplan 3's command refuses a missing path with `No database file at "<path>".` before it reaches `openDatabase`, and subplan 1's browser reports a file that vanished after opening through the ordinary schema read, so there is nothing for the opener to validate. `UNKNOWN_DATABASE` and the membership refusal remain for names, unchanged.
- `openDatabase` has three existing callers and none needs an edit here: `runCommand` in `src/plugins/sql/activate.ts:48` calls it at `:56` (a name that passed `isValidDatabaseName`, `src/plugins/sql/shared-intents.ts:78`) and at `:63` (the registry's `lastOpened ?? databases[0]` name), and the `open` intent at `src/plugins/sql/intents.ts:67` calls it with a name gated by `isOpenIntent` (`src/plugins/sql/shared-intents.ts:82`). Names are the only values those gates admit, so the path branch stays reachable only by direct callers until subplan 3 routes `sql file <path>` here. Land this subplan after subplan 1 and before subplans 3–5; neither the command surface nor the payload contract changes at this checkpoint, so typecheck and the existing tests stay green.
- `instanceKeyFor(database)` in `src/plugins/sql/tabs.ts` already returns `sqlite:${database}`. A path key `sqlite:/abs/path/to/shop.sqlite` therefore cannot collide with a name key `sqlite:shop`, the same path reopened produces the same key and focuses one tab, and two different paths whose files share a basename produce two distinct tabs. No new key scheme is needed.
- The title for a path is computed in `openDatabase` (`src/plugins/sql/open-tab.ts:26`) as `path.basename(database)` with exactly one trailing `.sqlite` removed case-insensitively; an earlier `.sqlite` in the basename and any other extension (for example `.db`) stay in place. Named tabs keep their current name as the title. No title helper module or new function is added: `node:path` is already the tool the command uses, and Node built-ins are permitted across the plugin boundary in `eslint.plugin-boundaries.mjs` — its `no-restricted-imports` patterns match relative `../` host imports, not bare Node specifiers — unlike a host import such as `../connections.js`. Follow the repo's default-import convention for `path` (`src/database/export.ts:2`).
- `emptyPayload(database, refs(databasesFrom(capabilities).databases))` (`src/plugins/sql/tabs.ts:39`) is seeded with the absolute path as `payload.database`, so every existing topic action, tab key, request id and notification keeps working unchanged; the host echoes the same string back on results. Keep the `databases` refs name-only — do not insert the path into that list: it is the name-keyed dropdown data, and subplan 5 makes path tabs render a read-only label instead. The explicit optional field that tells the client a tab is path-backed belongs to subplan 5, together with the schema bump; this subplan does not change `SqlPayload`, `isSqlPayload`, or the client registration.
- The `dock` parameter and both `dockTab` calls stay in place here. Subplan 3 stops the command from supplying a dock side, and subplan 4 (`./product/plans/ready/sql-path-4-dock-removal.md`) removes the dead parameter and capability together, so no intermediate checkpoint breaks the existing docking tests.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| `openDatabase` | `src/plugins/sql/open-tab.ts:26` | Modified in place; the file is 52 lines (30 counted code lines), far under the 200-line `max-lines` limit. |
| `UNKNOWN_DATABASE` | `src/plugins/sql/open-tab.ts:10` | Kept for the name branch only, word for word. |
| `instanceKeyFor`, `emptyPayload`, `refs`, `databasesFrom`, `SqlTabs` | `src/plugins/sql/tabs.ts` | Reused unchanged; only the title and the seed call change. |
| `dispatch`, `planRequest` | `src/plugins/sql/request.ts` | Reused unchanged: the tab is still opened before the schema answer arrives, and reopening still keeps its payload. |
| `fakeCapabilities` | `src/plugins/sql/activate.test.ts:35` | Pattern for the new direct-call test's fake server capabilities. |

## Proposed changes

In `src/plugins/sql/open-tab.ts`:

- Import default `path` from `node:path`.
- In `openDatabase`, when `database` is absolute, skip the `databasesFrom(capabilities).databases.some(...)` membership check and compute the tab title from `path.basename(database)` with exactly one trailing `.sqlite` removed case-insensitively, leaving an earlier `.sqlite` and any other extension alone. When `database` is a name, keep the current membership check, refusal, and `database` as the title. Add no existence check here.
- Use the computed title in both `openOrFocusTab` factories (the focused existing tab and the freshly seeded tab) in place of `database`. Keep `tabs.prune`, the `tabs.read` reuse branch, `emptyPayload`, `dispatch` and `planRequest` untouched.
- Keep the `dock: Dock` parameter and both `if (dock !== undefined) capabilities.dockTab(key, dock)` calls exactly as they are; subplan 4 removes them.

Add `src/plugins/sql/open-tab.test.ts`, a new colocated test file with a fake capabilities object modeled on `fakeCapabilities` in `src/plugins/sql/activate.test.ts:35` and its own `SqlTabs`, so `openDatabase` can be called directly before the command routes to it. The fake needs `topicData('databases')` to return a view with both `databases` and `results` arrays (the shape `databasesFrom` / `isDatabasesData` require at `src/plugins/sql/tabs.ts:22`), `rejectRequest` that throws, and `ownTabKeys` that reports the keys opened so far — otherwise `tabs.prune` discards the payload the reopen case must observe. `topicAction` can be a no-op: these tests assert tab keys, titles, the seeded payload and dock calls, not the schema fold.

## Tests

In the new `src/plugins/sql/open-tab.test.ts`:

- An absolute path opens a tab with key `sqlite:<path>` and a title of the basename with `.sqlite` removed.
- A path ending in `.SQLITE` is stripped case-insensitively, while a path ending in `.db` keeps its extension in the title.
- Opening the same path a second time focuses one tab and keeps its payload (seed a distinguishable payload in the `SqlTabs` mirror at that key before the second call); opening two different paths whose files share a basename yields two distinct tabs.
- A named database still refuses a name the registry lacks with `UNKNOWN_DATABASE` and keeps its name as the title.
- Passing a dock side still calls `dockTab` with that side, pinning the contract subplan 4 deliberately removes; subplan 4 rewrites this case along with the signature.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. The existing `src/plugins/sql/activate.test.ts` cases must pass with no edits because the command has not changed yet. Read the diff to confirm no payload type or `SqlPayload` guard was touched, that the `refs` list stayed name-only, and that the name branch of `openDatabase` is unchanged. Manual end-to-end check at this checkpoint: in the running application open a named database with `sql shop`, confirm its tab is titled `shop`, dock it with `sql shop left`, and open it again to confirm one tab keeps its state. The new path branch has no command route until subplan 3, so its end-to-end walk belongs to subplan 3 and the full walk to subplan 5 (`./product/plans/ready/sql-path-5-payload-and-switcher.md`).

## Out of scope

- No command grammar and no `sql file` route; the path branch is reachable only by direct callers until subplan 3.
- No dock removal, no manifest change, no call-site change in `intents.ts` or `activate.ts`.
- No payload field, schema version bump, client registration change, or `DatabaseSwitcher` change.
- No browser, export, spec, or documentation change.
