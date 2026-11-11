# ACP tool loop 10 — the shared loop driver module

**Complexity: 6/10** — ~100 added lines (mostly the new `drive-loop.ts`), 14 requirements, 11 scenarios, 2 edited files (p=5.93); above the series' 1–5 target, driven by the requirement count of the gate, event, and cancellation contracts the later subplans depend on

Run order: 10 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` ("One loop driver"; decisions 1, 6, 7, and 9, driver halves). Depends on subplans 7 and 8, both implemented (`product/plans/complete/move-janissarys-acp-tool-loop-7-run-snapshot-and-gate.md` and its pieces `…-7-run-snapshot-and-gate-{1,2,3}-*.md`; `product/plans/complete/move-janissarys-acp-tool-loop-8-core-loop-snapshot.md` and its fix plan `product/plans/complete/tool-table-allow-list-test-name.md`). Subplan 11 switches `runCorePrompt` to the driver, subplan 12 adds the agent kind, subplan 18 drives it on the far side, and subplan 23 adds its remote branch.

The far side has to run the same loop the local side runs, and it cannot load `Managers`. This subplan adds a new pure module, `src/acp/drive-loop.ts`, that owns the primer, the tool table, the extractor, the step cap, and the gate-then-route runner for a `core` run. It reaches the outside world only through an injected host and events. Nothing in production calls `driveToolLoop` or `runToolLoop` yet; only their tests do. The one production change is that `runCorePrompt` takes its primer from the new module, so the primer has a single source from this subplan on. Subplan 11 makes `runCorePrompt` call `runToolLoop`.

## Design decisions

- **Signatures.** All in `src/acp/drive-loop.ts`:
  - `driveToolLoop(session, prompt, snapshot, host, events, signal)` returns `void`, like `runAcpToolLoop`. `session` is `AcpLoopSession`, `prompt` the user's text, `snapshot` the core variant `Extract<AcpRunSnapshot, { kind: 'core' }>`, `host` an `AcpToolHost`, `events` an `AcpLoopHandlers`, and `signal` a required `AbortSignal`.
  - `runToolLoop(session, prompt, snapshot, host, events, signal)` has the same parameters and return, and in this subplan only calls `driveToolLoop`. It is the one entry point the local side will call (subplans 11 and 13). Subplan 23 adds the branch that hands a remote session to the far side and widens `session` to admit `RemoteAcpSession`.
  - The snapshot parameter is core-only here so no untested agent branch exists. Subplan 12 widens both functions to the full `AcpRunSnapshot` union when it adds the agent kind; that widening breaks no caller.
- **The core loop options.** `driveToolLoop` wraps `runAcpToolLoop` (`src/acp/loop.ts`, unchanged) and passes it, in `AcpLoopDeps`:
  - `tools`: `createAcpToolTable(snapshot.grants)`, or `[]` when `snapshot.withoutTools`, as `runCorePrompt` does at `src/acp/run-prompt.ts` "`snapshot.withoutTools ? [] : createAcpToolTable(snapshot.grants)`".
  - `primer`: `corePrimer(snapshot, tools)` (below).
  - `extractCommand`: `toolExtractor(tools)`.
  - `maxSteps`: `CORE_MAX_STEPS`, an exported constant of 8, passed explicitly. `runAcpToolLoop`'s own `?? 8` default stays as it is. Subplan 16 relies on the constant to send no step count, and subplan 21 calls `events.finished(reason, CORE_MAX_STEPS)` with it, so both sides use one value.
  - `signal`: the `signal` parameter.
  - `runCommand`: the gate-then-route runner below.
- **`corePrimer(snapshot, tools)`** is exported and returns today's primer from `runCorePrompt` exactly, sections joined by a blank line with empty ones dropped (today's `.filter(Boolean).join('\n\n')`):
  1. `toolPrimer(tools, allowList)`, where `allowList` is `NATIVE_ACP_COMMANDS` (`src/plugins/roles/shared.ts`) filtered to commands in `snapshot.grants` whose row in `snapshot.rows` does not have `effectiveAgentAccess === false`. The filter reads `effectiveAgentAccess` only, never `effectiveEnabled`, and a command with no row (including every command when `rows` is empty because settings were unavailable) stays allowed. This is today's `allowedCommands` rule in `runCorePrompt`, kept unchanged.
  2. `NO_BUILTIN_TOOLS_LINE` when `tools.length > 0 && allowList.length > 0`, else `NO_TOOLS_LINE` (both in `src/acp/internal-tools.ts`). This is today's `toolsAvailable`.
  3. `TELL_INSTRUCTION` when `snapshot.role === 'tell'`.
  4. `MARKDOWN_INSTRUCTION` (`src/acp/launch.ts`).
- **`TELL_INSTRUCTION` moves** here from `run-prompt.ts`, with its text unchanged, as a module-private constant. `src/acp/run-prompt.test.ts` already keeps its own copy of the literal, so nothing needs it exported.
- **`runCorePrompt` uses `corePrimer` now.** It replaces its inline `allowedCommands`, `toolsAvailable`, and primer array with `corePrimer(snapshot, tools)`, and drops its `TELL_INSTRUCTION`, `NO_BUILTIN_TOOLS_LINE`/`NO_TOOLS_LINE`, and `MARKDOWN_INSTRUCTION` imports. Its `NATIVE_ACP_COMMANDS` import stays, because `coreSnapshot` uses it. The existing `runCorePrompt role primer` cases in `src/acp/run-prompt.test.ts` pin the output, so they prove the move changed nothing. Everything else in `runCorePrompt` (its `coreToolRunner`, `dispatchNative`, handlers, and direct `runAcpToolLoop` call) is left for subplan 11.
- **The host** is a new exported type `AcpToolHost` in `src/acp/types.ts`, beside `AcpLoopHandlers`: `runCaller(command)` and `runWorkspace(command)`, each returning the step's output as `string | Promise<string>`, the same return type as `AcpLoopDeps.runCommand`. It lives in `types.ts` so `src/remote/acp-session.ts` (subplans 21–23) can import the type without importing the driver.
- **The runner.** For each command `runAcpToolLoop` hands it:
  1. It calls `gateCommand(snapshot, tools, command)` (`src/acp/tool-table.ts`) first, because `startCommand` needs the side. A gate throw (`No ACP tool matched command: …`) propagates out of `runCommand` synchronously, reaches `runAcpToolLoop`'s catch, and becomes the `error` event as today. No `startCommand` fires for it. Today `runCorePrompt` records the command before the gate throws, but the extractor only yields commands some tool owns, so the throw is unreachable in practice and the lost record line is not a behavior change anyone sees.
  2. It fires `events.startCommand?.(command, workspace)` before anything runs, refusals included. `workspace` is `decision.runsOn === 'workspace'`, and `false` for a refusal: a refused step ran nowhere, so it is never tagged as a remote workspace step (subplan 24). This matches today's `recordTool(command)` before the runner, which is what shows a step while a question is pending.
  3. A refusal returns its `refusal` text as the step's result, so it is one completed step that consumes one of the eight (source decision 6). Neither host function is called. The driver raises no notification; the `command-disabled` notification stays in `coreToolRunner` until subplan 11 moves it into the `ranCommand` handler on `refused === 'disabled'`.
  4. Otherwise it returns `host.runWorkspace(command)` or `host.runCaller(command)` by `decision.runsOn`.
  5. It remembers the step's `workspace` and `refused` in a closure variable. `runAcpToolLoop` runs one command at a time, so a single variable is enough.
- **Events.** The driver passes `runAcpToolLoop` a handlers object that forwards `startTurn`, `chunk`, `endTurn`, `finished`, and `error` to `events` unchanged. Its `ranCommand(command, result)` forwards as `events.ranCommand(command, result, workspace, refused)` from the remembered step. The driver adds no `active()` or abort guard of its own on events; see Cancellation.
- **`AcpLoopHandlers` gains two additive, optional members** (`src/acp/types.ts`):
  - `ranCommand` becomes `(command, result, workspace?, refused?)`, with `workspace?: boolean` and `refused?: 'disabled'` (the `refused` type of `AcpGateDecision` in `tool-table.ts`). An absent `workspace` means false. The driver always passes `workspace`, and passes `refused` only for a disabled refusal. Optional parameters keep `runAcpToolLoop`'s own two-argument call, `guardAcpHandlers`, the handler literals in `runCorePrompt` and `executeAgentRun` (`src/agent/execute.ts`), and every test handler compiling unchanged.
  - A new optional `startCommand?: (command: string, workspace: boolean) => void`. Optional, so `executeAgentRun`'s handler literal needs no placeholder before subplan 13 replaces it.
  - The parameter order is the one subplans 18 and 22 already use: `startCommand(command, false)`, `ranCommand(command, output, false)`, `ranCommand(command, result, workspace, refused)`.
- **`guardAcpHandlers` is untouched here** (`src/acp/guard-handlers.ts`). It forwards only `(command, result)` and has no `startCommand`, which is harmless because nothing routes driver events through it yet. Subplan 11 passes the new event and arguments through it.
- **Cancellation** (source decision 9, driver half). `runAcpToolLoop` already drops a late host *result*: after awaiting `runCommand` it returns without `ranCommand` or a follow-up turn when the signal aborted. A late host *rejection* is not dropped by the loop, whose catch calls `error` unconditionally. So the runner wraps a promise result: a rejection that arrives after the signal aborted resolves to an empty string instead, which the loop then discards on its abort check. A rejection before the abort still rejects and becomes `error`. A provider `onError` after the abort still reaches `events.error`; the consumers guard that, the local side through `guardAcpHandlers` and `active()` (subplan 11, as `runCorePrompt` and `executeAgentRun` do today), and the far side in its frame mapping (subplan 20).
- **Session.** The driver passes `session` to `runAcpToolLoop` as given. Any `active()` wrapper around a local session's provider callbacks stays the caller's job (subplan 11 keeps the one `runCorePrompt` builds today).
- **Purity.** `drive-loop.ts` imports only `./loop.js`, `./tool-table.js`, `./internal-tools.js`, `MARKDOWN_INSTRUCTION` from `./launch.js`, `NATIVE_ACP_COMMANDS` from `../plugins/roles/shared.js`, and types from `./types.js`. Each of those reaches no `Managers`: `loop.ts` imports `command-line.ts` and `error-text.ts`; `tool-table.ts` imports the primer and recognizer modules and `native-commands.ts`; `launch.ts` imports `bundled-adapters.ts` and `internal-tools.ts`. It never imports `Managers`, the command registry, `src/native-commands/policy.ts`, `src/application-commands.ts`, or `run-prompt.ts`, because the far side loads it in subplan 18. Imports carry `.js` extensions.
- **Agent kind and `extractAgentCommand`.** Out of this subplan. Subplan 12 adds the agent branch and moves `extractAgentCommand` and its fence helpers from `src/agent/command-tools.ts` to a pure `src/agent/command-extract.ts`; `drive-loop.ts` does not import `src/agent/` here.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The pure loop (turns, cold-start retry, step cap, display filtering, follow-up text, late-result drop on abort) | `runAcpToolLoop` in `src/acp/loop.ts` |
| Today's primer assembly, allow-list rule, and `TELL_INSTRUCTION` | `runCorePrompt` in `src/acp/run-prompt.ts` |
| Today's gate-then-route runner (the shape the driver's runner takes, minus the notification) | `coreToolRunner` in `src/acp/run-prompt.ts` |
| Primer lines | `NO_BUILTIN_TOOLS_LINE`, `NO_TOOLS_LINE` in `src/acp/internal-tools.ts`; `MARKDOWN_INSTRUCTION` in `src/acp/launch.ts` |
| Command vocabulary for the allow-list | `NATIVE_ACP_COMMANDS` in `src/plugins/roles/shared.ts` |
| Table, primer, extractor, gate, gate decision type | `createAcpToolTable`, `toolPrimer`, `toolExtractor`, `gateCommand`, `AcpGateDecision` in `src/acp/tool-table.ts` |
| Event, session, deps, and snapshot types | `AcpLoopHandlers`, `AcpLoopSession`, `AcpLoopDeps`, `AcpRunSnapshot` in `src/acp/types.ts` |
| Event guard (untouched here) | `guardAcpHandlers` in `src/acp/guard-handlers.ts` |
| Scripted fake session and recording handlers for tests | `makeSession`, `makeHandlers` in `src/acp/loop.test.ts` (copy the pattern) |

## Proposed changes

Land in this order; each step keeps typecheck and tests green.

1. `src/acp/types.ts`: the optional `workspace` and `refused` parameters on `AcpLoopHandlers.ranCommand`, the optional `startCommand`, and the `AcpToolHost` type. The file is at 120 lines, so it stays well under the limit.
2. New `src/acp/drive-loop.ts`: `CORE_MAX_STEPS`, the private `TELL_INSTRUCTION`, `corePrimer`, the runner, `driveToolLoop`, and `runToolLoop`. About 90 lines.
3. `src/acp/run-prompt.ts`: use `corePrimer`, drop `TELL_INSTRUCTION` and the now-unused imports. It shrinks from 155 lines.

## Tests

New `src/acp/drive-loop.test.ts`, over a scripted fake session in the style of `src/acp/loop.test.ts`, with a real tool table from `createAcpToolTable` and recording `vi.fn()` host functions. Snapshots are built inline (`kind: 'core'`, `role`, `roleName`, `grants`, `rows`, `withoutTools`).

- routing: a `db sqlite query …` reply calls `runCaller` with that command, and a granted `file read …` reply calls `runWorkspace`; each result is fed into the follow-up prompt;
- events in order for one step: `startTurn(true)`, `chunk`, `endTurn`, `startCommand(command, false)`, `ranCommand(command, result, false, undefined)`, then `startTurn(false)` for the follow-up turn, then `finished('answered', 8)`; a workspace step reports `true` in both;
- refusals: an agent-off row (`effectiveAgentAccess: false`) gives one step whose result is `Command is disabled: <command>.` with `refused: 'disabled'` and `workspace: false`; an ungranted command whose tool is present (a role granted `db sqlite list` emitting `db sqlite query …`) gives `Command not allowed for role "<roleName>": db sqlite query.` with no `refused`; neither calls a host function;
- `corePrimer`: the exact four-part order for `tell`, no tell instruction for `ask`, an agent-off command left out of the allow-list, and a `withoutTools` snapshot giving `NO_TOOLS_LINE` and `MARKDOWN_INSTRUCTION` only, with no slices;
- the step cap: a session that always emits a command ends with `finished('capped', 8)` after eight `ranCommand` events;
- cancellation: aborting while a `runCaller` promise is pending, then resolving it, gives no `ranCommand` and no further turn; aborting and then rejecting it gives no `error` either;
- a rejecting host before any abort gives the `error` event with the rejection text and no `ranCommand`.

No driver test covers a gate throw. The driver's extractor only yields a command some tool in the same table recognizes, and that tool's `match` claims it, so the throw cannot be reached through `driveToolLoop`. The throw itself is covered by `src/acp/tool-table.test.ts`, and a throwing `runCommand` becoming `error` by `src/acp/loop.test.ts`.

`src/acp/run-prompt.test.ts` needs no new case: its existing `runCorePrompt role primer` cases cover the `corePrimer` switch and must pass unchanged.

## Out of scope

Switching `runCorePrompt` to `runToolLoop`, moving the `command-disabled` notification into `ranCommand`, and updating `guardAcpHandlers` (subplan 11). The agent kind and the `extractAgentCommand` move (subplan 12). `executeAgentRun` (subplan 13). The far-side frame mapping and its abort guard (subplans 18 and 20). The remote branch of `runToolLoop` (subplan 23). Host tags (subplan 24).

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Nothing user-visible changes; by hand, `ask` and `tell` on a local tab still send the same primer (the `runCorePrompt role primer` tests pin it).
