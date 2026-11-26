# Execute the import and export commands locally
**Complexity: 5/10** — ~95 added lines, 1 file edited, 9 requirements, 8 scenarios (p=5.31)

## Goal

Run the parsed `hosts import` and `hosts export` verbs through one shared local-operation path: parse first in `runCommand` so a valid verb bypasses subplan 9's usage-line checkpoint, refuse in a remote tab before any file is touched, resolve the operand, call the operation, publish on a catalog change, and answer in the transcript. It is the tenth piece of `import-openssh-aliases-into-the-hosts-tab.md`, named by file name so the reference survives that plan's promotion. `import-openssh-aliases-into-the-hosts-tab-11-intent-registration.md` adds the two intents that reuse the same runner.

## Requirements

1. `hosts import [file]` and `hosts export [file]` run against `~/.ssh/config` when the operand is empty, or against the operand resolved by `resolveSshConfigTarget` from `import-openssh-aliases-into-the-hosts-tab-5-path-resolution.md` using the typing tab's cwd, the project root, and the workspace container `<root>/.janissary/workspace` — not `originTab().workspace.dir`, which names a single clone ("`hosts import <file>` command to allow for other files", "Button + `hosts export`", "cwd, then project").
2. Neither verb opens or focuses the Hosts tab; a successful import publishes the written catalog to an already open tab, and each verb answers in the transcript it was typed in ("the dialog the verbs used to open is gone", "Like `hosts add`, each refreshes an open Hosts tab").
3. Typed in a remote tab, both verbs refuse with `hosts import and hosts export work only in local tabs.` before reading or writing anything ("Refuse in remote tabs").
4. A missing or unreadable file to import is reported as `Cannot read ssh config <path>: <problem>.`, with the display path abbreviated as `~` or `$root` ("Cannot read / Nothing to", "One summary line").
5. An import that added hosts is a `mutation`-style outcome that publishes and then notes its text (source plan Design decisions).
6. An import that added nothing but succeeded is an `output` note carrying subplan 7's `No aliases to import from <path>.` text; only a failure outcome is a `refusal`. A successful export is an `output` note and a failed export is a `refusal` (source plan Design decisions).
7. One shared runner in a new `src/plugins/hosts/ssh-intents.ts` resolves the operand with `resolveSshConfigTarget` from `./ssh-config-target.js`, calls `importSshHosts` from `./import-ssh.js` (subplan 7) or `exportSshHosts` from `./export-ssh.js` (subplan 8), publishes through the existing helper only when the catalog changed, and selects note or refusal by mode so the command path uses `capabilities.note` and `capabilities.rejectRequest` (source plan Implementation step 6; Assumptions 1 to 3).
8. The payload shape and its schema version are unchanged, a repeated click while an operation runs is not guarded, and the runner passes the resolver's display path into the operations so their own text carries it: `importSshHosts` wraps read failures as `Cannot read ssh config <path>: <problem>.` (subplan 7 Requirement 9) and `exportSshHosts` wraps write failures as `Could not write ssh config <path>: <problem>.` (subplan 8 Requirement 10). The runner adds no second wrapper (source plan Design decisions).
9. A valid `hosts import` or `hosts export` typed in a local tab executes through the runner: `runCommand` parses with `parseCatalogCommand` first and dispatches those two variants itself, so subplan 9's usage-line checkpoint in `runCatalogCommand` is never the answer for a well-formed command (subplan 9 Design decisions).

## Design decisions

Depends on `import-openssh-aliases-into-the-hosts-tab-5-path-resolution.md`, `import-openssh-aliases-into-the-hosts-tab-6-ssh-config-file-access.md`, `import-openssh-aliases-into-the-hosts-tab-7-import-operation.md`, `import-openssh-aliases-into-the-hosts-tab-8-export-operation.md`, and `import-openssh-aliases-into-the-hosts-tab-9-command-verbs.md` being implemented, not merely promoted: `src/plugins/hosts/ssh-config-target.ts`, `ssh-config-file.ts`, `import-ssh.ts`, `export-ssh.ts`, and the new `import`/`export` `CatalogParse` variants must all exist before step 1 can compile. `import-openssh-aliases-into-the-hosts-tab-11-intent-registration.md` adds the intent table entries that call the shared runner, so it lands after this one.

- `runCommand` in `activate.ts` is the single command execution site. It calls `parseCatalogCommand` (`src/plugins/hosts/catalog-commands.ts:52`) before `runCatalogCommand` and, when the variant is `import` or `export`, hands the parsed `operand` to the shared runner and returns; every other variant keeps today's `runCatalogCommand` path and outcome handling. The second parse inside `runCatalogCommand` is harmless because the parser is pure, and leaving `catalog-commands.ts` and its tests untouched is what keeps subplan 9's checkpoint and its pins green while a valid command still executes (Requirement 9). The runner owns the `originTab().remote` refusal, so the command path and subplan 11's intent path share one check before any resolver or file call (Requirement 3, Assumption 4).
- The runner lives in `src/plugins/hosts/ssh-intents.ts` so the next subplan can reuse it without duplicating resolution or reporting. It must not import `publish` or `readNotify` back from `activate.ts`: `eslint.config.mjs:139` `'import-x/no-cycle': 'error',` and `activate.ts` imports the runner, so the caller injects those helpers as callbacks instead (Assumption 6). `activate.ts` currently sits at 147 lines; this subplan adds two imports and one dispatch branch and lands near 165 code lines, under `max-lines` (Assumption 5). If implementation passes 180, move the dispatch branch into `ssh-intents.ts` rather than compacting.
- No new module beyond `ssh-intents.ts`, no new state, and no declaration or manifest change. The parsed variants come from subplan 9 unchanged, including its usage-line checkpoint. Because subplan 9 deliberately does not extend `CatalogOutcome`, the runner does not return an outcome to `runCommand`; it publishes and reports itself with the same primitives `runCommand` uses today.
- Command mode reports success through `capabilities.note` and failure through `capabilities.rejectRequest`; intent mode reports both through `notify` from `readNotify(capabilities, true)`, as subplan 11 requires. The runner forwards that same `notify` to `exportSshHosts` for the unusable-catalog notice (subplan 8 Requirement 11).
- A successful import publishes the written catalog: `importSshHosts` returns hosts and text but no hosts-file path (subplan 7 Requirement 14), so the runner calls `readHostsFile` (`src/plugins/hosts/hosts-file.ts:87`) after the write and passes that read to the injected publish callback, which calls the existing `publish` with `payloadOf(read)`. Export never publishes because it does not change the catalog.
- The three preserved-behavior tests below must keep passing: the row-open, save, and mutation-refusal cases in `activate.test.ts`. Subplan 9's three `catalog-commands.test.ts` pins (list JSON, case-folded add, malformed requests) must also stay green; leaving `catalog-commands.ts` and its test untouched is what keeps them passing.

## Preserved behavior

1. Opening a Hosts row launches ssh with the stored spelling. The new verbs must not change how a saved host is launched or which spelling reaches `ssh`. Pinned by `src/plugins/hosts/activate.test.ts` › `dispatches the stored spelling of an offered row and stays quiet on success`.
2. Creating, editing, and renaming through the host form writes one sorted catalog. The new command path must not change the `save` intent's duplicate, missing-host, or rename handling. Pinned by `src/plugins/hosts/activate.test.ts` › `renames a host by case alone in one write`.
3. A refused catalog mutation leaves the payload unchanged. A failed import must not publish a payload or write the hosts file. Pinned by `src/plugins/hosts/activate.test.ts` › `leaves the payload alone when a mutation is refused`.

## Assumptions

1. A catalog-changing command publishes and then notes its text: `src/plugins/hosts/catalog-commands.ts:21` `| { kind: 'mutation'; text: string; hosts: SavedHost[]; path: string };` and `src/plugins/hosts/activate.ts:71` `if (outcome.kind === 'mutation') {`.
2. Catalog publishes go through one helper: `src/plugins/hosts/activate.ts:38` `function publish(capabilities: TabPluginServerCapabilities, payload: HostsPayload): void {`.
3. Hosts-tab notifications are attributed by one helper: `src/plugins/hosts/activate.ts:48` `function readNotify(capabilities: TabPluginServerCapabilities, owned: boolean): (message: string) => void {`.
4. A plugin learns cwd, root, and remote from `originTab()`: `src/plugins/api-origin-tab.ts:22` `export type TabPluginOriginTab = {`, with `remote?: true;` at `:29`.
5. `max-lines` is 200 with blank lines and comments skipped: `eslint.config.mjs:62` `'max-lines': ['error', { max: 200, skipBlankLines: true, skipComments: true }]`.
6. A new hosts plugin module cannot import helpers back from `activate.ts`: `eslint.config.mjs:139` `'import-x/no-cycle': 'error',` and `activate.ts:135` `export function activate(): TabPluginActivation {` is the module that will import the runner, so an inverse import of `publish` or `readNotify` would close a cycle.

## Existing functionality

1. The mutation outcome that publishes then notes: `src/plugins/hosts/catalog-commands.ts:21` `| { kind: 'mutation'; text: string; hosts: SavedHost[]; path: string };`.
2. The single publish helper: `src/plugins/hosts/activate.ts:38` `function publish(`.
3. The single notification-attribution helper: `src/plugins/hosts/activate.ts:48` `function readNotify(`.
4. The pure command parser used before dispatch: `src/plugins/hosts/catalog-commands.ts:52` `export function parseCatalogCommand(argument: string): CatalogParse {`.
5. The parsed `import` and `export` variants with their `operand` string from `import-openssh-aliases-into-the-hosts-tab-9-command-verbs.md`.
6. The operand resolver `resolveSshConfigTarget` from `src/plugins/hosts/ssh-config-target.ts`, delivered by `import-openssh-aliases-into-the-hosts-tab-5-path-resolution.md`.
7. The import operation `importSshHosts` from `src/plugins/hosts/import-ssh.ts`, delivered by `import-openssh-aliases-into-the-hosts-tab-7-import-operation.md`.
8. The export operation `exportSshHosts` from `src/plugins/hosts/export-ssh.ts`, delivered by `import-openssh-aliases-into-the-hosts-tab-8-export-operation.md`.
9. The hosts-file read that supplies the published path: `src/plugins/hosts/hosts-file.ts:87` `export function readHostsFile(`.

## Implementation steps

Every step ends green under `$janissary/scripts/run.mjs check-diff`. This subplan changes three files: `src/plugins/hosts/ssh-intents.ts` (new), `src/plugins/hosts/activate.ts`, and `src/plugins/hosts/activate.test.ts`. Every module the runner imports exists once subplans 5 through 9 have been implemented, which is a prerequisite; nothing is deferred to subplan 11.

1. Add `src/plugins/hosts/ssh-intents.ts` with the shared local-operation runner. It takes the parsed `import`/`export` variant and its `operand` (empty means `~/.ssh/config`), the capability object, the caller's `notify` callback, and an injected publish callback; it reads cwd, root, and remote from `originTab()`, refuses remote tabs first with Requirement 3's exact message, resolves with `resolveSshConfigTarget` passing the workspace container `<root>/.janissary/workspace`, calls `importSshHosts` or `exportSshHosts`, forwards `notify` to `exportSshHosts`, and publishes only after a successful import that added hosts. In command mode it reports through `capabilities.note` or `capabilities.rejectRequest`; in intent mode it reports through `notify`. Import project modules as `./ssh-config-target.js`, `./import-ssh.js`, `./export-ssh.js`, and `./hosts-file.js` (the `.js` form required by `eslint.config.mjs:135`) and never import `activate.ts` (Assumption 6). Build with `$janissary/scripts/run.mjs check-diff`.
2. In `src/plugins/hosts/activate.ts`, import `parseCatalogCommand` and the runner, keep `originRoot`'s existing null-origin refusal, and in `runCommand` parse the argument before calling `runCatalogCommand`; for `kind: 'import'` or `kind: 'export'` call the runner with `readNotify(capabilities, false)` and a publish callback built from the existing `publish` and `payloadOf`, then return. Leave `runCatalogCommand` and its checkpoint unchanged. Keep `publish` and `readNotify` themselves unchanged and the file under 200 code lines. Build with `$janissary/scripts/run.mjs check-diff`.
3. Extend `src/plugins/hosts/activate.test.ts` with the command cases listed under Tests, leaving every existing case unchanged, including the case that proves a valid verb executes rather than returning subplan 9's usage-line refusal. Build with `$janissary/scripts/run.mjs check-diff`.
4. Read the diff of `src/plugins/hosts/activate.ts` once to confirm no existing handler changed, then run `$janissary/scripts/run.mjs check-diff` again and confirm the whole server test project passes, including all three preserved-behavior pins.

## UI design

1. No new client surface in this subplan. The command path is available; buttons and intents arrive in `import-openssh-aliases-into-the-hosts-tab-11-intent-registration.md` and `import-openssh-aliases-into-the-hosts-tab-12-client-buttons.md`.

## Tests

In `src/plugins/hosts/activate.test.ts`:

- A local `hosts import` notes the summary without opening or focusing a tab, and publishes the written catalog to an already open Hosts tab; a successful export notes its report without publishing (Requirements 1, 2, 5).
- A valid `hosts import` and a valid `hosts export` typed in a local tab reach the runner and execute instead of returning the subplan 9 usage-line refusal; a malformed form still refuses in the transcript (Requirement 9).
- An import that added nothing notes the empty report; a failed import refuses in the transcript without publishing or writing (Requirement 6, preserved behavior 3).
- A local `hosts export` notes its report or refuses on failure without opening a tab (Requirement 6).
- A remote origin refuses both verbs with the exact message, and no file is read or written (Requirement 3).
- A missing or unreadable import file is reported as `Cannot read ssh config <path>: <problem>.`, with an abbreviated path (Requirement 4).
- A relative operand resolves against tab cwd first, then root (Requirement 1).
- The row-open, save, and mutation-refusal cases pass unchanged (preserved behaviors 1 to 3).

## Out of scope

- No grammar change; the verbs and usage lines come from `import-openssh-aliases-into-the-hosts-tab-9-command-verbs.md`.
- No intent table entries, no client buttons, no dialog, and no payload field or schema change.
- No new ssh parsing, section work, path logic, file access, or operation logic; those are subplans 1 through 8.

## Verification

Run `$janissary/scripts/run.mjs check-diff`; lint, typecheck, and both test projects must pass with only these three files changed.

Then, against the running app in a scratch home, run `hosts import nowhere` in a local tab and confirm the transcript refuses with `Cannot read ssh config <path>: no such file.` with the path abbreviated. Run `hosts import` from a remote tab and confirm `hosts import and hosts export work only in local tabs.` appears before any file is read. Finally run `hosts import` in a local tab with a scratch config holding `Host web1` and confirm the transcript notes the summary — not `Usage: hosts import [file]` — no new tab opens, and an already open Hosts tab shows the new row. A failure looks like the checkpoint usage line for a valid command, an opened tab, a refusal in the wrong surface, or an unabbreviated path.
