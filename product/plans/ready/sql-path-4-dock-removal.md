# Remove docking from the SQL plugin's server surface

**Complexity: 3/10** — 6 requirements across 4 production files and 7 test scenarios, with only ~4 added lines (two comment rewrites) and the rest deletions (p=4.76).

## Goal

Delete the last server-side docking surface from the SQL plugin: the `dock` parameter and `dockTab` calls in `openDatabase`, its call sites, the `Dock` type, and the `dockTab` capability in the manifest. After this subplan no SQL code path can dock a tab, and the manifest stops asking for a capability nothing uses.

## Design decisions and dependencies

The source plan is `./product/plans/complete/sql-path.md`. This subplan depends on `./product/plans/ready/sql-path-3-command-grammar.md`, which already stopped the command from supplying a dock side: all three `runCommand` routes pass `undefined`. It lands after that so the grammar change and the dead-code removal are separate, each with its own green checkpoint; reversing the order breaks the typecheck, because subplan 3 still calls the four-argument `openDatabase`. Subplan 5 (`./product/plans/ready/sql-path-5-payload-and-switcher.md`) changes only the payload and client contract, and subplan 6 (`./product/plans/ready/sql-path-6-specs.md`) only documents the final grammar, including the spec sentence that removes SQL from the shared dock grammar. Neither reintroduces a dock parameter or capability.

- `openDatabase` at `src/plugins/sql/open-tab.ts:26` becomes `(database: string, capabilities: TabPluginServerCapabilities, tabs: SqlTabs): void`. Both `openOrFocusTab` factories — the reopened-tab branch and the fresh-tab dispatch callback — lose their trailing `if (dock !== undefined) capabilities.dockTab(key, dock)` line (currently `open-tab.ts:41` and `:50`). The `Dock` type at `open-tab.ts:7` (`export type Dock = 'left' | 'right' | null | undefined`) becomes unused once subplan 3 drops the `import type { Dock }` at `src/plugins/sql/shared-intents.ts:3`, and is deleted; no other module imports it.
- There are four call sites to update: the three in `runCommand` in `src/plugins/sql/activate.ts` (the `file`, `database` and bare routes subplan 3 leaves, each passing `undefined` as the dock argument) and the one in the `open` intent's `run` callback at `src/plugins/sql/intents.ts:67` (`openDatabase(value.name, undefined, capabilities, tabs)`). All four drop the second argument. No behavior changes at any of them: the bare route keeps its `lastOpened ?? databases[0]` choice and the file route keeps the path-resolution and existence check subplan 3 added before the call.
- `src/plugins/sql/manifest.ts`: remove `'dockTab'` from `capabilities` (currently `:22`). Keep `fileExtensions: {}` (`:16`) and `command: 'sql'` (`:17`) exactly as they are: there is still no `open <file>` route, but the command now serves a path. Rewrite the comment above `fileExtensions` (`:13`–`:15`) — it currently says a path is unservable because `dbPath` derives one from a name — so it states that the `open` route is still unclaimed while the command now serves a path; do not add an extension claim.
- Other plugins keep their own docking. `parseDockArgument` (`src/plugins/api.ts:450`, implemented in `src/plugins/dock-argument.ts:5`), the `dockTab` capability (`src/plugins/api-capabilities.ts:18` and `:72`), and every other plugin's manifest and command are untouched. No host change is needed: the host rejects an undeclared capability use (`src/plugins/dock-tab.test.ts:127`), so removing the declaration is safe only because no SQL code calls `dockTab` after this edit.
- Keep the `dockTab` recorder in the fake capabilities at `src/plugins/sql/activate.test.ts:64` and the never-called assertion subplan 3 leaves there; no test should expect a dock from any SQL command. Add a new colocated `src/plugins/sql/manifest.test.ts` (vitest `describe`/`it`/`expect`, per `src/**/*.test.ts`) pinning the declaration, following the `expect(...).not.toContain('dockTab')` assertion at `src/plugins/commands/manifest.test.ts:24` and the `expect(...fileExtensions).toEqual({})` assertion at `src/plugins/sessions/shared.test.ts:91`.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| `openDatabase` | `src/plugins/sql/open-tab.ts` | Signature simplified in place; no new module. |
| `runCommand` call sites | `src/plugins/sql/activate.ts` | Updated to the new signature; logic unchanged. |
| `open` intent | `src/plugins/sql/intents.ts:64` | Updated to the new signature; its name is still gated by `isOpenIntent` (`src/plugins/sql/shared-intents.ts:82`), while an unregistered name is refused by `openDatabase` through `UNKNOWN_DATABASE`. |
| `sqlManifest` | `src/plugins/sql/manifest.ts:7` | One capability removed and one comment corrected. |
| Manifest-test pattern | `src/plugins/commands/manifest.test.ts`, `src/plugins/scripts/manifest.test.ts` | Pattern for the new `src/plugins/sql/manifest.test.ts`. |

## Proposed changes

- `src/plugins/sql/open-tab.ts`: delete `export type Dock = ...` at `:7`, drop the `dock` parameter and both `dockTab` calls from `openDatabase` (`:26`), and update its doc comment at `:13`–`:25`, which still describes how a dock side is passed through. Keep the rest of the comment, including the note that an open tab keeps its payload.
- `src/plugins/sql/activate.ts`: change the three `openDatabase(...)` calls in `runCommand` to the three-argument form; leave the file-route resolution and the bare-route choice untouched.
- `src/plugins/sql/intents.ts`: in the `open` intent's `run` callback at `:66`–`:67`, change `openDatabase(value.name, undefined, capabilities, tabs)` to `openDatabase(value.name, capabilities, tabs)`. Nothing else in the file changes.
- `src/plugins/sql/manifest.ts`: remove `'dockTab'` from `capabilities` and rewrite the `fileExtensions` comment as described, keeping `fileExtensions: {}` and `command: 'sql'`.
- `src/plugins/sql/activate.test.ts`: keep the `dockTab` recorder in `fakeCapabilities` (`:64`) and the never-called assertion from subplan 3; no test should still expect a dock from any SQL command.
- `src/plugins/sql/manifest.test.ts` (new): assert `sqlManifest.capabilities` does not contain `'dockTab'`, that `fileExtensions` is `{}`, and that the declared command is `'sql'`.

## Tests

- The existing `src/plugins/sql/activate.test.ts` command and intent cases pass with the new signature and still assert `dockTab` was never called.
- The new `src/plugins/sql/manifest.test.ts` fails if `dockTab` is reintroduced or an extension claim is added.
- Run `src/plugins/sql/open-tab.test.ts` added by subplan 2: delete the case that passes a dock side and expects a `dockTab` call — the contract it pins no longer exists, and rewriting it to the new signature would only duplicate the path and name cases. The path and name cases are otherwise unchanged.

## Verification

Run `$janissary/scripts/run.mjs check-diff`, including the full `src/plugins/sql/` suite. Grep `src/plugins/sql/` for `dockTab`: no production file should match, and the only test matches should be the never-called spy in `activate.test.ts` and the negative assertion in the new `manifest.test.ts`. Grep for `Dock`: no occurrence should remain under `src/plugins/sql/`. Read the activation diff to confirm `sqlManifest.capabilities` lists only capabilities the activation uses, so no capability lookup fails. Manual end-to-end check: in the running application open a database with `sql database <name>` and with `sql file <path>` — both land in the centre — and confirm there is no SQL command that docks a tab (`sql <name> left` reports the usage line from subplan 3). No user-visible behavior changes at this checkpoint; the removed capability and type are internal.

## Out of scope

- No change to the command grammar; that is subplan 3.
- No payload, schema, client or UI change; that is subplan 5.
- No spec edits; that is subplan 6.
- No change to any other plugin's docking, to `parseDockArgument`, or to the host's dock capability set.
