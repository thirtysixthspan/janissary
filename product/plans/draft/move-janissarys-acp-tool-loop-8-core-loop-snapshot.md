# ACP tool loop 8 — core loop on the per-prompt snapshot, with the `file` tool

**Complexity: 5/10** — ~50 added lines in 2 files, 9 requirements, 11 scenarios (p=5.44)

Run order: 8 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` ("Tool catalog and gate", the `runCorePrompt` half of "Per-prompt snapshot"; decisions 2, 4, 5, 6, 13, and 19). Depends on subplans 1, 5, 6, and 7 (`move-janissarys-acp-tool-loop-1-file-read-parser.md`, `move-janissarys-acp-tool-loop-5-typed-file-command.md`, `move-janissarys-acp-tool-loop-6-file-read-vocabulary.md`, `move-janissarys-acp-tool-loop-7-run-snapshot-and-gate.md`). Subplan 9 grants the tool by default. Subplans 10 and 11 move the loop wiring this subplan leaves in `runCorePrompt` into the shared driver.

This is where per-prompt settings take effect and where `file read` becomes a working ACP tool. The tool table becomes a pure module both hosts can import. `runCorePrompt` builds one snapshot per prompt, gates every emitted command against it with `gateCommand`, and runs the allowed ones on their side.

## Design decisions

- **Pure tool table** ("Tool catalog and gate").
  - `AcpTool` drops `run`, keeping `primer`, `match`, `isCommandLine`, and `runsOn`.
  - `createAcpToolTable(grants)` keeps its owner filtering but no longer takes `managers`, a role, or a signal.
  - The database entry takes `DB_PRIMER` and `isDatabaseCommandLine` from `src/database/primer.ts` directly, instead of `managers.database.primer` and `managers.database.isCommandLine`.
  - The owner list keeps its shape with a `file` entry added: primer `FILE_READ_PRIMER`, `match` on `^file\b`, `isCommandLine` from `isFileReadCommandLine`, and `runsOn: 'workspace'`.
  - The order is browser, question, file, database. Database stays last as the fall-through, because its `match` accepts anything.
  - `toolPrimer` and `toolExtractor` stay as they are.
  - `toolRunner` is deleted. With it go every import of `Managers`, `src/application-commands.ts`, `src/native-commands/dispatch-policy.ts`, `src/native-commands/policy.ts`, notifications, and the invocation context from `tool-table.ts`.
- **`dispatchNative` moves** into `src/acp/run-prompt.ts`, its only caller, because it needs `Managers`. Its behavior is unchanged.
- **Snapshot per prompt** (source decision 4). `runCorePrompt` builds the `core` snapshot in a few lines:
  - role and role name from `request`;
  - grants from `request.commands`;
  - `withoutTools` from `runtime.acpWithoutTools`;
  - one row per native command, from `effectiveCommandSetting` over `managers.nativeCommandSettings?.current()`. A missing settings manager gives an empty row list.
  
  The tool table, the primer's allow-list line (granted commands whose row is not agent-off, in vocabulary order), the extractor, and the gate all use that one snapshot for the whole prompt. A settings change made mid-prompt takes effect from the next prompt. This replaces today's per-call re-read of current settings.
- **Running by side.**
  - A refusal from `gateCommand` is the step's result. When it carries `refused: 'disabled'`, `runCorePrompt` raises `notify(managers, 'command-disabled', label, refusal)`, the notification `toolRunner` raised (source decision 6).
  - A `caller` command runs through `dispatchNative`, so it still passes `dispatchNativeLine`'s general disabled-command guard, which reads current settings (source decision 5). Disabling a command mid-prompt therefore still blocks the next caller-side run of it, while an agent-access change waits for the next prompt.
  - A `workspace` command runs through `readFileInTab` from subplan 5, so it uses the typed command's root rule (source decision 13). On a remote tab, until subplan 23 hands the loop to the far side, that read already goes through the remote port, so it reads the remote clone and not the local disk.
- **Primer slice** (source decision 19). `FILE_READ_PRIMER` appears only when `file read` is granted, because the table filters owners by the granted vocabulary.
- **Unchanged here**: the step cap, the capped paragraph, the cold-start retry, display filtering, transcript entries, records, and settle calls. Subplans 10 and 11 move them into the driver.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Today's table, runner, and dispatch | `createAcpToolTable`, `toolRunner`, `dispatchNative` in `src/acp/tool-table.ts` |
| Gate and snapshot | `gateCommand`, `AcpRunSnapshot` (subplan 7) |
| Primer and recognizer for each tool | `DB_PRIMER`, `isDatabaseCommandLine` in `src/database/primer.ts`; `BROWSER_PRIMER` in `src/browser/command.ts`; `QUESTION_PRIMER` in `src/question-command.ts`; `FILE_READ_PRIMER`, `isFileReadCommandLine` (subplan 1) |
| Effective settings | `effectiveCommandSetting` in `src/native-commands/policy.ts` |
| Tab reader | `readFileInTab` in `src/file-read/tab-read.ts` (subplan 5) |

## Proposed changes

- `src/acp/tool-table.ts`: the pure table above, with `toolRunner` removed.
- `src/acp/run-prompt.ts`, changed as follows:
  - `dispatchNative` moved in;
  - the snapshot built per prompt;
  - the loop's `runCommand` reimplemented as the gate, then a refusal with its notification, a caller dispatch, or a workspace read;
  - the primer's allow-list read from the snapshot.

## Tests

- `src/acp/tool-table.test.ts`:
  - the table order is browser, question, file, database;
  - granted-owner filtering includes `file` only when `file read` is granted;
  - the primer includes the file slice and lists `file read` in the allow-list line;
  - extraction finds a trailing `file read notes/a.md`;
  - the `toolRunner` cases become `gateCommand` cases, and the settings-change-within-a-prompt case is rewritten to the per-prompt rule: one snapshot, two calls, unchanged outcome.
- `src/acp/run-prompt.test.ts`:
  - a `db` step produces the same transcript entries, records, notifications, and settled replies as before;
  - a granted `file read` step on a local tab returns numbered lines from the tab's `workspaceDir`, and from the project directory when the tab has none;
  - a mid-prompt agent-access change applies from the next prompt;
  - a mid-prompt disable still blocks the next caller run through the dispatcher's guard;
  - a disabled refusal raises `command-disabled`;
  - a `withoutTools` tab builds no table.

## Out of scope

Default grants (subplan 9). The driver module and the event changes (subplans 10 and 11). Agent runs (subplans 12 and 13). Host tags (subplan 24).

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then, by hand, on a local tab whose role grants `file read`:
- `tell read README.md and summarize it` shows a `file read README.md` tool step and a correct summary;
- `tell create a sqlite database named probe` still works.
