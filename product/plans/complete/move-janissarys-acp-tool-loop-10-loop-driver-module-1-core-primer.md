# ACP tool loop 10.1 — the core primer in the driver module

**Complexity: 3/10** — ~25 added lines (a ~22-line new module plus the import swap), 7 requirements, 5 scenarios, 1 edited file (p=4.74)

Run order: piece 1 of 3 of subplan 10 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop-10-loop-driver-module.md` (decomposed from it; the `corePrimer`, `TELL_INSTRUCTION` move, and `runCorePrompt` switch decisions, plus the module's purity rule). Canonical plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` ("One loop driver"; decisions 1, 6, 7, and 9, driver halves). Depends on subplans 7 and 8, both implemented (`product/plans/complete/move-janissarys-acp-tool-loop-7-run-snapshot-and-gate.md` and its pieces `…-7-run-snapshot-and-gate-{1,2,3}-*.md`; `product/plans/complete/move-janissarys-acp-tool-loop-8-core-loop-snapshot.md` and its fix plan `product/plans/complete/tool-table-allow-list-test-name.md`). Piece 10.2 adds the driver to the module this piece creates; piece 10.3 adds its cancellation handling.

The far side has to run the same loop the local side runs, and it cannot load `Managers`. Subplan 10 adds a new pure module, `src/acp/drive-loop.ts`, that owns the primer, the tool table, the extractor, the step cap, and the gate-then-route runner for a `core` run. This piece creates the module with its primer only: `corePrimer(snapshot, tools)` and the moved `TELL_INSTRUCTION`. `runCorePrompt` takes its primer from it, so the primer has a single source from this piece on. This is the source plan's one production change; the driver functions in pieces 10.2 and 10.3 are called only by their tests until subplan 11.

## Design decisions

- **`corePrimer(snapshot, tools)`** is exported from `src/acp/drive-loop.ts`. `snapshot` is the core variant `Extract<AcpRunSnapshot, { kind: 'core' }>` and `tools` the `AcpTool[]` the caller built. Type `tools` as plain `AcpTool[]`, not `readonly AcpTool[]`: `toolPrimer` (`src/acp/tool-table.ts:79` "`toolPrimer(tools: AcpTool[], allowList: readonly string[])`") takes a mutable array, so a readonly parameter would not typecheck when passed through, and `tool-table.ts` is not edited in this piece. The return type is `string`. It returns today's primer from `runCorePrompt` exactly, sections joined by a blank line with empty ones dropped (today's `.filter(Boolean).join('\n\n')`):
  1. `toolPrimer(tools, allowList)`, where `allowList` is `NATIVE_ACP_COMMANDS` (`src/plugins/roles/shared.ts`) filtered to commands in `snapshot.grants` whose row in `snapshot.rows` does not have `effectiveAgentAccess === false`. The filter reads `effectiveAgentAccess` only, never `effectiveEnabled`, and a command with no row (including every command when `rows` is empty because settings were unavailable) stays allowed. This is today's `allowedCommands` rule in `runCorePrompt`, kept unchanged.
  2. `NO_BUILTIN_TOOLS_LINE` when `tools.length > 0 && allowList.length > 0`, else `NO_TOOLS_LINE` (both in `src/acp/internal-tools.ts`). This is today's `toolsAvailable`.
  3. `TELL_INSTRUCTION` when `snapshot.role === 'tell'`.
  4. `MARKDOWN_INSTRUCTION` (`src/acp/launch.ts`).

  `corePrimer` does not build the tool list and never reads `snapshot.withoutTools`; it uses `tools` exactly as given, so an empty `tools` alone produces the no-tools primer (`toolPrimer` returns `''` for an empty table, which the filter drops). The caller passes `createAcpToolTable(snapshot.grants)`, or `[]` when `snapshot.withoutTools`, as `runCorePrompt` does today at `src/acp/run-prompt.ts:87` "`snapshot.withoutTools ? [] : createAcpToolTable(snapshot.grants)`"; piece 10.2's driver builds it the same way. The allow-list rule to copy is `src/acp/run-prompt.ts:88-89` "`const allowedCommands = NATIVE_ACP_COMMANDS.filter(…)`", and the assembly is the `primer:` array at `src/acp/run-prompt.ts:110-115`.
- **`TELL_INSTRUCTION` moves** here from `run-prompt.ts`, with its text unchanged, as a module-private constant (today `src/acp/run-prompt.ts:21` "`const TELL_INSTRUCTION = 'The user is instructing you…'`"). `src/acp/run-prompt.test.ts:23` already keeps its own copy of the literal, so nothing needs it exported; `drive-loop.test.ts` keeps its own copy the same way.
- **`runCorePrompt` uses `corePrimer` now.** It replaces its inline `allowedCommands`, `toolsAvailable`, and primer array with `corePrimer(snapshot, tools)`, and drops its `TELL_INSTRUCTION` constant, the `NO_BUILTIN_TOOLS_LINE`/`NO_TOOLS_LINE` import line (`./internal-tools.js`), the `MARKDOWN_INSTRUCTION` import line (`./launch.js`), and `toolPrimer` from its `./tool-table.js` import, which keeps `createAcpToolTable`, `gateCommand`, `toolExtractor`, and `type AcpTool` (all still used by `coreToolRunner` and the loop deps). Its `NATIVE_ACP_COMMANDS` import stays, because `coreSnapshot` uses it. Its `tools` line (`snapshot.withoutTools ? [] : createAcpToolTable(snapshot.grants)`) stays, because `coreToolRunner` and `toolExtractor(tools)` still use it. The existing `runCorePrompt role primer` cases in `src/acp/run-prompt.test.ts` pin the output, so they prove the move changed nothing. Everything else in `runCorePrompt` (its `coreToolRunner`, `dispatchNative`, handlers, and direct `runAcpToolLoop` call) is left for subplan 11.
- **Purity (shared with pieces 10.2 and 10.3).** The full module may import only `./loop.js`, `./tool-table.js`, `./internal-tools.js`, `MARKDOWN_INSTRUCTION` from `./launch.js`, `NATIVE_ACP_COMMANDS` from `../plugins/roles/shared.js`, and types from `./types.js`. This piece needs only `./tool-table.js` (`toolPrimer`, and the `AcpTool` type), `./internal-tools.js`, `./launch.js`, `../plugins/roles/shared.js`, and the `AcpRunSnapshot` type from `./types.js`. Each of those reaches no `Managers`: `tool-table.ts` imports the primer and recognizer modules (`src/browser/command.ts`, `src/question-command.ts`, `src/database/primer.ts`, `src/file-read/command.ts`), `command-line.ts`, `shared.ts`, and `native-commands.ts`, which themselves import only `command-line.ts`, `shared.ts`, and types; `launch.ts` imports `bundled-adapters.ts` and `internal-tools.ts` (which imports only `value-guards.ts`) plus types; `shared.ts` imports nothing. The module never imports `Managers`, the command registry, `src/native-commands/policy.ts`, `src/application-commands.ts`, or `run-prompt.ts`, because the far side loads it in subplan 18. Imports carry `.js` extensions.
- **Agent kind.** Out of scope; subplan 12 adds the agent primer path when it widens the module. `drive-loop.ts` does not import `src/agent/`.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Today's primer assembly, allow-list rule, and `TELL_INSTRUCTION` | `runCorePrompt` in `src/acp/run-prompt.ts` |
| Primer lines | `NO_BUILTIN_TOOLS_LINE`, `NO_TOOLS_LINE` in `src/acp/internal-tools.ts`; `MARKDOWN_INSTRUCTION` in `src/acp/launch.ts` |
| Command vocabulary for the allow-list | `NATIVE_ACP_COMMANDS` in `src/plugins/roles/shared.ts` |
| Tool primer and table | `toolPrimer`, `createAcpToolTable`, `AcpTool` in `src/acp/tool-table.ts` |
| Snapshot type | `AcpRunSnapshot` in `src/acp/types.ts` |
| Primer pins | the `runCorePrompt role primer` cases in `src/acp/run-prompt.test.ts` |

## Proposed changes

One commit, green on its own.

1. New `src/acp/drive-loop.ts`: the private `TELL_INSTRUCTION` and the exported `corePrimer`. About 20 lines. Knip accepts the export because `run-prompt.ts` imports it; `knip.json` needs no change.
2. `src/acp/run-prompt.ts` (155 lines): import `corePrimer` from `./drive-loop.js`, pass `primer: corePrimer(snapshot, tools)` to `runAcpToolLoop`, and drop `TELL_INSTRUCTION`, `allowedCommands`, `toolsAvailable`, the now-unused `NO_BUILTIN_TOOLS_LINE`, `NO_TOOLS_LINE`, and `MARKDOWN_INSTRUCTION` imports, and `toolPrimer` from the `./tool-table.js` import. The `tools` line stays. It shrinks by about ten lines.

## Tests

New `src/acp/drive-loop.test.ts`, under `describe('corePrimer', …)`, with a real tool table from `createAcpToolTable` and core snapshots built inline (`kind: 'core'`, `role`, `roleName`, `grants`, `rows`, `withoutTools`). Import the expected strings from their sources (`DB_PRIMER` from `src/database/primer.ts`, `BROWSER_PRIMER` from `src/browser/command.ts`, `NO_BUILTIN_TOOLS_LINE`/`NO_TOOLS_LINE` from `./internal-tools.js`, `MARKDOWN_INSTRUCTION` from `./launch.js`) and keep a local copy of the `TELL_INSTRUCTION` literal. No `vi.mock`. Pieces 10.2 and 10.3 add their cases to this file. `corePrimer` cases:

- the exact four-part order for `tell` with grants `['db sqlite query']` and `rows: []`: `DB_PRIMER`, `Only these commands are allowed: db sqlite query.`, `NO_BUILTIN_TOOLS_LINE`, the tell instruction, `MARKDOWN_INSTRUCTION`, joined by blank lines (the same expectation as "places the tell instruction after available tool text and before Markdown" in `src/acp/run-prompt.test.ts`; `rows: []` also proves a command with no row stays allowed);
- no tell instruction for `ask` (same grants; starts with `DB_PRIMER`, ends with `MARKDOWN_INSTRUCTION`);
- an agent-off command left out of the allow-list: grants `['browser goto', 'db sqlite query']` with a `browser goto` row of `effectiveEnabled: true, effectiveAgentAccess: false` keeps `BROWSER_PRIMER` and `DB_PRIMER`, lists only `db sqlite query`, and keeps `NO_BUILTIN_TOOLS_LINE` (mirrors "excludes an agent-off command from the allow-list but keeps its owner primer" in `run-prompt.test.ts`);
- a `withoutTools: true` `ask` snapshot with tools `[]` (the test passes `[]`, as the caller would) giving exactly `NO_TOOLS_LINE` and `MARKDOWN_INSTRUCTION`, with no tool slices.

`src/acp/run-prompt.test.ts` needs no new case: its existing `runCorePrompt role primer` cases cover the `corePrimer` switch and must pass unchanged.

## Out of scope

`AcpToolHost`, the `AcpLoopHandlers` additions, `CORE_MAX_STEPS`, the runner, `driveToolLoop`, and `runToolLoop` (piece 10.2). The after-abort rejection handling (piece 10.3). Switching `runCorePrompt` to `runToolLoop`, moving the `command-disabled` notification, and updating `guardAcpHandlers` (subplan 11). The agent kind and the `extractAgentCommand` move (subplan 12).

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Confirm the `runCorePrompt role primer` cases pass unchanged and that `src/acp/drive-loop.ts` imports nothing outside the purity list. Nothing user-visible changes; by hand, `ask` and `tell` on a local tab still send the same primer (the `runCorePrompt role primer` tests pin it).
