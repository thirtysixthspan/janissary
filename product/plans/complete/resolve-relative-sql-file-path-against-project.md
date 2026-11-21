# Resolve relative `sql file` paths against the project directory

**Complexity: 3/10** — a small SQL-plugin-only change: ~18 added lines across 2 production files, 5 requirements, 6 scenarios, 2 new helpers (p=4.67).

## Goal

`sql file <relative path>` must open and browse the SQLite file under the application's project directory even when the app was launched from another working directory (the scratch-launch / `janus <project-dir>` case). Absolute paths must keep passing through byte-for-byte, and a path containing `..` must resolve to the same absolute file and focus the same single tab. No other behavior of the `sql` command changes.

## Design decisions

- The SQL plugin already runs inside the host and reaches project state only through its declared capabilities. The existing v3 capability `projectFileList()` returns `{ root, paths }`, where `root` is `managers.tab.launchDir` — the same project/launch directory `initDbDir` bases `.janissary/db/sqlite/` on. That `root` is the correct base for a relative `file` value, so the plugin asks for it rather than reading `process.cwd()` (which is the launcher's directory) or reaching into host modules.
- `projectFileList` is asynchronous, so only the relative-value branch becomes asynchronous. The command handler is already typed `void | Promise<void>` and the host awaits it (`host.runCommandResult` → `runPluginCommand` → `runGuarded`), so returning a promise is within the existing contract. An absolute value needs no lookup: it is taken verbatim and the branch stays synchronous, which also keeps every existing absolute-path test and all named/bare command forms synchronous.
- `path.resolve(root, value)` is the resolution step. For a relative value it anchors to the project directory; `..` segments are normalized by `path.resolve`, so `fixtures/../fixtures/shop.sqlite` lands on the same file as `fixtures/shop.sqlite`. Because the absolute branch is taken first, an absolute value is never re-based.
- Existence is still checked with `existsSync` on the resolved path before opening, and the refusal message still prints that resolved absolute path. The tab key, basename title, path-backed label, and payload marker are unchanged — they already derive from the resolved absolute path.
- The global process cwd, `src/connections.ts`, the plugin API version, and every host/plugin API file outside the SQL plugin are untouched. No trailing dock-word special-casing is introduced or reintroduced: the value is still the trimmed remainder taken verbatim.

## Implementation steps

1. `src/plugins/sql/manifest.ts`: add `'projectFileList'` to the declared `capabilities` array.
2. `src/plugins/sql/activate.ts`: change `runCommand` to return `void | Promise<void>`. In the `keyword === 'file'` branch, if `path.isAbsolute(value)` open it as today; otherwise return a small async `openRelativeFile` helper that awaits `capabilities.projectFileList()` and resolves against its `root`. Extract the existence check plus `openDatabase` call into one small `openExistingFile(database, capabilities, tabs)` helper used by both branches so the resolved-path error line has a single owner. Update the `command` handler to return `runCommand`'s result.
3. Verify with `$janissary/scripts/run.mjs check-diff`.

## Tests

- `src/plugins/sql/activate.test.ts`: add `projectFileList` to `fakeCapabilities`, answering `async () => ({ root: projectDir, paths: [] })` where `projectDir` is a temp directory that differs from `process.cwd()` and holds `fixtures/shop.sqlite`. Make the `outcome` helper async (awaiting the command) and await its callers in the grammar block. Update the two existing "relative path" cases to expect resolution against `projectDir` instead of `process.cwd()`.
- Add cases asserting: `sql file fixtures/shop.sqlite` opens exactly one centre tab keyed `sqlite:<projectDir>/fixtures/shop.sqlite` with title `shop` and the resolved path as the schema action's database; `sql file fixtures/../fixtures/shop.sqlite` resolves to that same absolute path and focuses the existing shop tab rather than opening a second one; an absolute `file` value still opens unchanged.
- `src/plugins/sql/manifest.test.ts`: pin that `projectFileList` is among the declared capabilities.

## Out of scope

- Changing the process cwd, `src/connections.ts`, the plugin API version, or any host/plugin API file outside `src/plugins/sql/`.
- Reintroducing trailing dock-word handling, docking, or any change to the other command forms (`database`, bare `sql`, usage errors).
- New UI, new columns/files, or changes to the tab's payload, key, title, switcher label, exports, or specs — the behavior was always described as resolving against the project directory; only the base used was wrong.
