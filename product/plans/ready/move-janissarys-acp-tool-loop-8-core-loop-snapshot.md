# ACP tool loop 8 — core loop on the per-prompt snapshot, with the `file` tool

**Complexity: 5/10** — ~55 added lines in 2 files, 11 requirements, 13 scenarios (p=5.67)

Run order: 8 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` ("Tool catalog and gate", the `runCorePrompt` half of "Per-prompt snapshot"; decisions 2, 4, 5, 6, 7, 13, and 19). Depends on subplans 1, 5, 6, and 7, all landed: `FILE_READ_PRIMER` and `isFileReadCommandLine` in `src/file-read/command.ts`; `readFileInTab` and `localReadRoot` in `src/file-read/tab-read.ts`; `file read` in `NATIVE_ACP_COMMANDS` (`src/plugins/roles/shared.ts`) with owner `file` in `nativeCommandTool` (`src/acp/native-commands.ts`); `AcpTool.runsOn`, `gateCommand`, `AcpGateDecision` in `src/acp/tool-table.ts`, and `AcpRunSnapshot`/`AcpRunSnapshotRow` in `src/acp/types.ts`. Subplan 9 grants the tool by default. Subplans 10 and 11 move the loop wiring this subplan leaves in `runCorePrompt` into the shared driver.

This is where per-prompt settings take effect and where `file read` becomes a working ACP tool. The tool table becomes a pure module both hosts can import. `runCorePrompt` builds one snapshot per prompt, gates every emitted command against it with `gateCommand`, and runs the allowed ones on their side.

## Design decisions

- **Pure tool table** ("Tool catalog and gate").
  - `AcpTool` drops `run`, keeping `primer`, `match`, `isCommandLine`, and `runsOn`.
  - `createAcpToolTable(grants)` keeps its owner filtering (`NATIVE_ACP_COMMANDS.filter(...)` then `nativeCommandTool(command) === owner`) but no longer takes `managers`, the unused `_role`, or `signal`. Its one parameter is `grants: readonly string[]`.
  - The database entry takes `DB_PRIMER` and `isDatabaseCommandLine` from `src/database/primer.ts` directly, instead of `managers.database.primer` and `managers.database.isCommandLine` (both return exactly those today: `get primer()` and `isCommandLine` in `src/database/manager.ts`). `DatabaseManager.primer` and `DatabaseManager.isCommandLine` stay; they have their own tests in `src/database/manager.test.ts`, and removing them is not this subplan's job.
  - A `file` entry is added to `ownedTools`: owner `'file'`, primer `FILE_READ_PRIMER`, `match` testing `/^file\b/i` (same style as the browser and question entries), `isCommandLine` delegating to `isFileReadCommandLine`, and `runsOn: 'workspace'`.
  - The order is browser, question, file, database. Database stays last as the fall-through, because its `match` accepts anything.
  - `toolPrimer`, `toolExtractor`, `gateCommand`, `gateCoreCommand`, `gateAgentCommand`, and `AcpGateDecision` stay as they are.
  - `toolRunner` and `dispatchNative` leave the file. With them go the imports of `Managers`, `resolveApplicationCommand` (`../application-commands.js`), `refuseDisabledCommand` (`../native-commands/dispatch-policy.js`), `effectiveCommandSetting` (`../native-commands/policy.js`), `notify`, and `createInvocationContext`. After this change `tool-table.ts` imports only the three command modules (browser, question, file-read), `src/database/primer.ts`, `./command-line.js`, `./native-commands.js`, `NATIVE_ACP_COMMANDS`, and the `AcpRunSnapshot` type — none of which load `Managers` or the command registry.
- **`dispatchNative` moves** into `src/acp/run-prompt.ts` as a module-private function, its only caller, because it needs `Managers`. Its signature `(managers, label, command, signal?)` and behavior are unchanged; `runCorePrompt` passes `request.abort.signal`, as `createAcpToolTable` did.
- **Snapshot per prompt** (source decision 4). A module-private helper in `run-prompt.ts`, `coreSnapshot(managers, runtime, request)`, returns an `AcpRunSnapshot` of kind `core`:
  - `role: request.role`, `roleName: request.roleName`, `grants: request.commands`, `withoutTools: runtime.acpWithoutTools === true`;
  - `rows`: when `managers.nativeCommandSettings` is undefined, `[]`; otherwise one row per entry of `NATIVE_ACP_COMMANDS`, named by the native name (`file read`, `db sqlite query`), with `effectiveEnabled` and `effectiveAgentAccess` from `effectiveCommandSetting(settings, name)` over one `managers.nativeCommandSettings.current()` read. Copy the two booleans field by field so the row is plain data.

  `runCorePrompt` reads `current()` **exactly once** per call (inside `coreSnapshot`) and derives everything else from the snapshot:
  - tools: `snapshot.withoutTools ? [] : createAcpToolTable(snapshot.grants)`;
  - the primer's allow-list: `NATIVE_ACP_COMMANDS` filtered to commands in `snapshot.grants` whose row is absent or has `effectiveAgentAccess` true — today's rule (`effectiveAgentAccess` only, not `effectiveEnabled`; an absent row allows, matching `effectiveCommandSetting`'s defaults);
  - `toolsAvailable`, the extractor, and the gate.

  A settings change made mid-prompt takes effect from the next prompt. This replaces `toolRunner`'s per-call re-read. A fallback retry to the role's next harness entry calls `runCorePrompt` again with the same request and so takes a fresh snapshot, as it already re-reads settings for the allow-list today (`src/acp/manager.test.ts` pins three `current()` reads across first prompt, retry, and next prompt; that count must stay 3).
- **Running by side.** A module-private helper in `run-prompt.ts`, `coreToolRunner(managers, label, snapshot, tools, signal)`, returns the `(command) => string | Promise<string>` that `runCorePrompt`'s existing `runCommand` wrapper calls where it calls `toolRunner`'s result today (the wrapper's `active()` check, `recordTool(command)` before the call, and `recordTool(result)` after stay as they are). Keeping the runner out of `runCorePrompt`'s body keeps that function under `sonarjs/cognitive-complexity`. The runner calls `gateCommand(snapshot, tools, command)` and then:
  - a gate throw (`No ACP tool matched command: …`) propagates unchanged to `runAcpToolLoop`'s catch, which turns it into the `error` event as today;
  - a `{ refusal }` decision returns the refusal text **synchronously** as the step's result. When it carries `refused: 'disabled'`, the runner first raises `notify(managers, 'command-disabled', label, decision.refusal)`, the notification `toolRunner` raised (source decision 6). A not-allowed refusal raises nothing, as today;
  - `{ runsOn: 'caller' }` returns `dispatchNative(managers, label, command, signal)`. It still passes `dispatchNativeLine`'s general disabled-command guard (`refuseDisabledCommand` in `dispatchLine`, `src/command/manager.ts`), which reads current settings (source decision 5). So disabling a command mid-prompt still blocks the next caller-side run of it — the dispatcher returns `Command is disabled: <name>.` as the output, appends that refusal line to the tab, and raises `command-disabled` itself — while an agent-access change waits for the next prompt;
  - `{ runsOn: 'workspace' }` returns `readFileInTab(managers, label, command)`, passing the whole command line (it parses `file read <path> …` itself, resolves to the text to print, and never rejects).
- **Why `readFileInTab` and not `localReadRoot` + `readWorkspaceLines`** (source decision 13). `readFileInTab` is exactly what the typed `file` command runs (`src/commands/file.ts`), so typed and agent reads share one root rule (tab `workspaceDir`, else `managers.tab.launchDir`), one usage/error text, and one remote path. Calling it directly also avoids `dispatchNative`, which would route through the `file` command's `appendCommandOutput` and add a typed-command transcript entry beside the `acp: true` one. On a remote tab, until subplan 23 hands the loop to the far side, `localReadRoot` returns undefined and the read goes through the remote port to the remote clone, never the local disk. The workspace side has no live disabled guard; a mid-prompt disable of `file read` waits for the next prompt, the same rule the far side will have.
- **Primer slice** (source decision 19). `FILE_READ_PRIMER` appears only when `file read` is granted, because the table filters owners by the granted vocabulary. It sits after the question slice and before the database slice.
- **Unchanged here** (source decision 7): the step cap, the capped paragraph, the cold-start retry, display filtering, transcript entries, records, settle calls, the `guardAcpHandlers` handlers, and the primer's order (`toolPrimer`, then `NO_BUILTIN_TOOLS_LINE`/`NO_TOOLS_LINE`, then `TELL_INSTRUCTION` for `tell`, then `MARKDOWN_INSTRUCTION`). Subplans 10 and 11 move them into the driver.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Today's table, runner, and dispatch | `createAcpToolTable`, `toolRunner`, `dispatchNative` in `src/acp/tool-table.ts` |
| Gate and snapshot | `gateCommand`, `AcpGateDecision` in `src/acp/tool-table.ts`; `AcpRunSnapshot`, `AcpRunSnapshotRow` in `src/acp/types.ts` |
| Primer and recognizer for each tool | `DB_PRIMER`, `isDatabaseCommandLine` in `src/database/primer.ts`; `BROWSER_PRIMER`, `isBrowserCommandLine` in `src/browser/command.ts`; `QUESTION_PRIMER`, `isQuestionCommandLine` in `src/question-command.ts`; `FILE_READ_PRIMER`, `isFileReadCommandLine` in `src/file-read/command.ts` |
| Effective settings | `effectiveCommandSetting` in `src/native-commands/policy.ts` (already imported by `run-prompt.ts`) |
| Tab reader | `readFileInTab` in `src/file-read/tab-read.ts`, used the same way by `src/commands/file.ts` |
| Disabled notification | `notify(managers, 'command-disabled', label, text)` from `src/notifications/index.ts` (already imported by `run-prompt.ts`) |
| Live caller guard | `refuseDisabledCommand` inside `dispatchLine` in `src/command/manager.ts`; covered by `src/command/manager.test.ts` ("refuses a disabled command before its effects and records the refusal") |

## Proposed changes

Sizes are counted lines (non-blank, non-comment, as `max-lines` counts them). `src/acp/tool-table.ts` is 155 today and lands near 115 (toolRunner, dispatchNative, and six imports out; the file entry and two imports in). `src/acp/run-prompt.ts` is 99 today and lands near 140 (dispatchNative, `coreSnapshot`, `coreToolRunner`, and four imports in). Both stay under 200; no extraction is needed.

- `src/acp/tool-table.ts`: the pure table above, with `run`, `toolRunner`, and `dispatchNative` removed and the `file` entry added.
- `src/acp/run-prompt.ts`: `dispatchNative` moved in; `coreSnapshot` and `coreToolRunner` added; `runCorePrompt` builds the snapshot once, builds tools and the allow-list from it, and passes `coreToolRunner`'s runner where it used `toolRunner`. New imports: `gateCommand` (replacing `toolRunner` in the `./tool-table.js` import), `createInvocationContext` from `../command/invocation.js`, `readFileInTab` from `../file-read/tab-read.js`, and `import type { AcpRunSnapshot }` added to the existing `./types.js` type import — all with `.js` extensions.

Callers of the changed signature, all updated in the same commit:
- `src/acp/run-prompt.ts` (production; the only `toolRunner` and `createAcpToolTable` production caller);
- `src/acp/tool-table.test.ts` (`setup()`);
- `src/native-commands/feature.integration.test.ts` (`createAcpToolTable(managers, 'ask', grants)` becomes `createAcpToolTable(grants)`).

### Ordering — two commits, each green

1. **refactor: pure tool table and per-prompt core snapshot.** Everything except the `file` entry: drop `run` and the three extra parameters, switch the database entry to `DB_PRIMER`/`isDatabaseCommandLine`, delete `toolRunner`, move `dispatchNative`, add `coreSnapshot` and `coreToolRunner` (the `workspace` branch is present but unreachable, since no tool is `workspace` yet), and make every test change listed under commit 1 below. Removing `run` breaks the `gateCommand` test literals and the signature change breaks every caller, so all of these land together.
2. **feat: `file` tool on the core loop.** Add the `file` entry and its two imports, and the commit-2 tests below. Granted `file read` now runs.

## Tests

Server tests (vitest project `server`), colocated.

### Commit 1

- `src/acp/tool-table.test.ts`:
  - `setup()` builds `createAcpToolTable(grants)`; its `managers`, `dispatchNativeLine`, `isCommandLine` spy, `settings`, and `signal` go. Remove `settingsWith`, the `NativeCommandSettingsManager` import, the `notify` mock and import, and the fs/os/path imports once nothing uses them (the two primer cases that passed settings only exercise `toolPrimer` with an explicit allow-list, so they drop the settings argument and keep their assertions).
  - Expected database primer text becomes `DB_PRIMER` (imported from `../database/primer.js`) wherever the cases expect `'db primer text'`.
  - "reaches the database entry through its manager predicate" becomes "recognizes a database line through `isDatabaseCommandLine`": `db sqlite list` is extracted and `db sqlite bogus` is not.
  - The whole `describe('toolRunner')` block is deleted. Its refusal cases are already covered by `describe('gateCommand')`; its dispatch and notification cases move to `run-prompt.test.ts` below.
  - The two `gateTools` literals in `describe('gateCommand')` drop their `run: () => 'unused'` property.
  - New: `createAcpToolTable` is callable with grants alone, and `tool-table.ts`'s module has no `Managers` dependency (a construct-from-grants case with no managers object is enough; the import removal is checked by `knip`/lint, not a test).
- `src/acp/run-prompt.test.ts` (captures `AcpLoopDeps` from the mocked `runAcpToolLoop`, as the `primer()` helper does; extend the managers stub with `command.dispatchNativeLine`, `tab.byLabel`, and `tab.launchDir` where a case needs them, and mock `../notifications/index.js`):
  - expectations of `'database primer'` become `DB_PRIMER` (the `database` stub on managers no longer feeds the primer);
  - a granted `db sqlite query shop SELECT 1` routes to `dispatchNativeLine(label, command, objectContaining({ acpTool: true, awaitResult: true, signal: request.abort.signal }))` and resolves to its output (moved from `toolRunner`'s dispatch cases);
  - a snapshot row with `effectiveEnabled` false (and, as a second case, `effectiveAgentAccess` false) returns `Command is disabled: <native>.` synchronously, raises `notify(managers, 'command-disabled', label, that text)`, and never calls `dispatchNativeLine`;
  - an ungranted enabled command returns the role refusal and raises no notification;
  - `select 1` makes `runCommand` throw `No ACP tool matched command: select 1`;
  - **per-prompt rule, agent access:** start a prompt with `db sqlite query` agent access on, then change the settings stub to agent access off and call the captured `runCommand` — it still dispatches; a second `runCorePrompt` call afterwards gets the refusal and an allow-list without `db sqlite query`;
  - **dispatcher guard stays:** start a prompt with `browser goto` enabled, flip the stub to `effectiveEnabled` false, call `runCommand('browser goto https://x')` — the gate passes on the snapshot and the call reaches `dispatchNativeLine` (whose live guard, tested in `src/command/manager.test.ts`, is what refuses);
  - `settings.current` is read once per `runCorePrompt` call even when `runCommand` runs several times;
  - with no `nativeCommandSettings` on managers, a granted command runs (empty rows allow) and appears in the allow-list;
  - a `withoutTools` tab builds no tools: `extractCommand` returns null for a granted command line and the primer starts with `NO_TOOLS_LINE`.
- `src/acp/manager.test.ts`:
  - every `'db primer'` assertion (`toContain` and `not.toContain`) becomes `DB_PRIMER`, so the negative ones are not vacuous;
  - "keeps one role grant snapshot through retries and reads the next prompt afresh": its final block, which flips `db sqlite query` agent access off mid-prompt and expects `next.runCommand` to refuse, is rewritten to the per-prompt rule — `next.runCommand` now resolves to `'db ran'`, `dispatchNativeLine` is called twice, and no `command-disabled` notification is raised. `settingsCurrent` stays at three calls.
- `src/acp/plugin-session.test.ts` "returns the %s refusal to the loop even when notifications are suppressed" sets the setting before the prompt, so the snapshot sees it; it must pass unchanged (the notification now comes from `coreToolRunner`).
- `src/native-commands/feature.integration.test.ts`: the one call-site change; its assertions stay.

### Commit 2

- `src/acp/tool-table.test.ts`:
  - the first case ("keeps the existing table order and appends the canonical allow-list") expects `'browser primer text'`, `'question primer text'`, `FILE_READ_PRIMER`, `DB_PRIMER`, then the allow-list line, in that order;
  - the side case expects `['caller', 'caller', 'workspace', 'caller']` with all grants;
  - granted-owner filtering includes the file entry only when `file read` is granted (grants `['file read']` give one tool with `runsOn: 'workspace'` and primer `FILE_READ_PRIMER`; grants without it have no file slice);
  - the database entry stays last and the file entry does not claim `anything at all` or `db sqlite list`;
  - extraction finds a trailing `file read notes/a.md` and a `File Read a.md` (case-insensitive), and a reply ending in `file read` on a table without the file entry returns null.
- `src/acp/run-prompt.test.ts`:
  - a granted `file read a.txt` on a local tab whose `byLabel` returns `{ workspaceDir: <temp dir> }` resolves to the numbered lines of `<temp dir>/a.txt`, without calling `dispatchNativeLine`;
  - the same with `workspaceDir` undefined reads from `managers.tab.launchDir`;
  - on a tab with `remote` set and no `managers.remote`, it resolves to `Remote connection unavailable.` (the remote path, never the local disk);
  - an ungranted `file read` returns `Command not allowed for role "<roleName>": file read.`

## Out of scope

Default grants (subplan 9). The driver module, `TELL_INSTRUCTION`'s move, and the event changes (subplans 10 and 11). Agent runs and the agent snapshot (subplans 12 and 13). The far-side loop and its wire frames (subplans 14–23). `[host]` tags on steps (subplan 24). Removing `DatabaseManager.primer`/`isCommandLine`. Specs and user docs (subplan 26).

## Verification

Run `$janissary/scripts/run.mjs check-diff` after each commit. Confirm `src/acp/tool-table.ts` no longer imports `Managers`, `application-commands`, `dispatch-policy`, `native-commands/policy`, notifications, or `command/invocation`.

Then, by hand, on a local tab whose role grants `file read` and `db sqlite create`:
- `tell read README.md and summarize it` shows a `file read README.md` tool step whose output is numbered lines, and a correct summary;
- `tell create a sqlite database named probe` still works;
- in the commands tab, turn off agent access for `file read` while a `tell` prompt is waiting on the agent; that prompt can still read, and the next prompt's primer no longer lists `file read` and its read is refused with `Command is disabled: file read.` plus a disabled-command notification.
