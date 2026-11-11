# ACP tool loop 10.2 — the gate-and-route loop driver

**Complexity: 5/10** — ~60 added lines, 13 requirements (the gate, event, handler, and host contracts), 7 scenarios, 2 edited files (p=5.61)

Run order: piece 2 of 3 of subplan 10 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop-10-loop-driver-module.md` (decomposed from it; the signatures, core loop options, host, runner, events, `AcpLoopHandlers`, `guardAcpHandlers`, and session decisions). Canonical plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` ("One loop driver"; decisions 1, 6, 7, and 9, driver halves). Depends on piece 10.1 (`product/plans/draft/move-janissarys-acp-tool-loop-10-loop-driver-module-1-core-primer.md`) for `src/acp/drive-loop.ts`, `corePrimer`, the purity rule, and `src/acp/drive-loop.test.ts`; and on subplans 7 and 8, both implemented (`gateCommand`, `AcpGateDecision`, `AcpRunSnapshot`). Piece 10.3 adds the after-abort rejection handling to this piece's runner. Subplan 11 switches `runCorePrompt` to the driver, subplan 12 adds the agent kind, subplan 18 drives it on the far side, and subplan 23 adds its remote branch.

This piece adds the driver to `src/acp/drive-loop.ts`: the gate-then-route runner for a `core` run, reaching the outside world only through an injected host and events. Nothing in production calls `driveToolLoop` or `runToolLoop` yet; only their tests do.

## Design decisions

- **Signatures.** All in `src/acp/drive-loop.ts`:
  - `driveToolLoop(session, prompt, snapshot, host, events, signal)` returns `void`, like `runAcpToolLoop`. `session` is `AcpLoopSession`, `prompt` the user's text, `snapshot` the core variant `Extract<AcpRunSnapshot, { kind: 'core' }>`, `host` an `AcpToolHost`, `events` an `AcpLoopHandlers`, and `signal` a required `AbortSignal`.
  - `runToolLoop(session, prompt, snapshot, host, events, signal)` has the same parameters and return, and in this subplan only calls `driveToolLoop`. It is the one entry point the local side will call (subplans 11 and 13). Subplan 23 adds the branch that hands a remote session to the far side and widens `session` to admit `RemoteAcpSession`.
  - The snapshot parameter is core-only here so no untested agent branch exists. Subplan 12 widens both functions to the full `AcpRunSnapshot` union when it adds the agent kind; that widening breaks no caller.
- **The core loop options.** `driveToolLoop` wraps `runAcpToolLoop` (`src/acp/loop.ts`, unchanged) and passes it, in `AcpLoopDeps`:
  - `tools`: `createAcpToolTable(snapshot.grants)`, or `[]` when `snapshot.withoutTools`, as `runCorePrompt` does at `src/acp/run-prompt.ts` "`snapshot.withoutTools ? [] : createAcpToolTable(snapshot.grants)`".
  - `primer`: `corePrimer(snapshot, tools)` (piece 10.1).
  - `extractCommand`: `toolExtractor(tools)`.
  - `maxSteps`: `CORE_MAX_STEPS`, an exported constant of 8, passed explicitly. `runAcpToolLoop`'s own `?? 8` default stays as it is. Subplan 16 relies on the constant to send no step count, and subplan 21 calls `events.finished(reason, CORE_MAX_STEPS)` with it, so both sides use one value.
  - `signal`: the `signal` parameter.
  - `runCommand`: the gate-then-route runner below.
- **The host** is a new exported type `AcpToolHost` in `src/acp/types.ts`, beside `AcpLoopHandlers`: `runCaller(command)` and `runWorkspace(command)`, each returning the step's output as `string | Promise<string>`, the same return type as `AcpLoopDeps.runCommand`. It lives in `types.ts` so `src/remote/acp-session.ts` (subplans 21–23) can import the type without importing the driver.
- **The runner.** For each command `runAcpToolLoop` hands it:
  1. It calls `gateCommand(snapshot, tools, command)` (`src/acp/tool-table.ts`) first, because `startCommand` needs the side. A gate throw (`No ACP tool matched command: …`) propagates out of `runCommand` synchronously, reaches `runAcpToolLoop`'s catch, and becomes the `error` event as today. No `startCommand` fires for it. Today `runCorePrompt` records the command before the gate throws, but the extractor only yields commands some tool owns, so the throw is unreachable in practice and the lost record line is not a behavior change anyone sees.
  2. It fires `events.startCommand?.(command, workspace)` before anything runs, refusals included. `workspace` is `decision.runsOn === 'workspace'`, and `false` for a refusal: a refused step ran nowhere, so it is never tagged as a remote workspace step (subplan 24). This matches today's `recordTool(command)` before the runner, which is what shows a step while a question is pending.
  3. A refusal returns its `refusal` text as the step's result, so it is one completed step that consumes one of the eight (source decision 6). Neither host function is called. The driver raises no notification; the `command-disabled` notification stays in `coreToolRunner` until subplan 11 moves it into the `ranCommand` handler on `refused === 'disabled'`.
  4. Otherwise it returns `host.runWorkspace(command)` or `host.runCaller(command)` by `decision.runsOn`.
  5. It remembers the step's `workspace` and `refused` in a closure variable. `runAcpToolLoop` runs one command at a time, so a single variable is enough.

  Piece 10.3 wraps step 4's promise result for the after-abort rejection case; until then a host rejection, before or after an abort, reaches `runAcpToolLoop`'s catch and becomes `error`, as it does for any `runCommand` today.
- **Events.** The driver passes `runAcpToolLoop` a handlers object that forwards `startTurn`, `chunk`, `endTurn`, `finished`, and `error` to `events` unchanged. Its `ranCommand(command, result)` forwards as `events.ranCommand(command, result, workspace, refused)` from the remembered step. The driver adds no `active()` or abort guard of its own on events (see piece 10.3 for cancellation).
- **`AcpLoopHandlers` gains two additive, optional members** (`src/acp/types.ts`):
  - `ranCommand` becomes `(command, result, workspace?, refused?)`, with `workspace?: boolean` and `refused?: 'disabled'` (the `refused` type of `AcpGateDecision` in `tool-table.ts`). An absent `workspace` means false. The driver always passes `workspace`, and passes `refused` only for a disabled refusal. Optional parameters keep `runAcpToolLoop`'s own two-argument call, `guardAcpHandlers`, the handler literals in `runCorePrompt` and `executeAgentRun` (`src/agent/execute.ts`), and every test handler compiling unchanged.
  - A new optional `startCommand?: (command: string, workspace: boolean) => void`. Optional, so `executeAgentRun`'s handler literal needs no placeholder before subplan 13 replaces it.
  - The parameter order is the one subplans 18 and 22 already use: `startCommand(command, false)`, `ranCommand(command, output, false)`, `ranCommand(command, result, workspace, refused)`.
- **`guardAcpHandlers` is untouched here** (`src/acp/guard-handlers.ts`). It forwards only `(command, result)` and has no `startCommand`, which is harmless because nothing routes driver events through it yet. Subplan 11 passes the new event and arguments through it.
- **Session.** The driver passes `session` to `runAcpToolLoop` as given. Any `active()` wrapper around a local session's provider callbacks stays the caller's job (subplan 11 keeps the one `runCorePrompt` builds today).
- **Purity** (shared with pieces 10.1 and 10.3; the rule is stated in 10.1). This piece adds `runAcpToolLoop` from `./loop.js` (which imports `command-line.ts` and `error-text.ts`, neither reaching `Managers`), `createAcpToolTable`, `toolExtractor`, and `gateCommand` from `./tool-table.js`, and the `AcpLoopSession`, `AcpLoopHandlers`, and `AcpToolHost` types from `./types.js`. Nothing outside the 10.1 list.
- **Agent kind and `extractAgentCommand`.** Out of this subplan. Subplan 12 adds the agent branch and moves `extractAgentCommand` and its fence helpers from `src/agent/command-tools.ts` to a pure `src/agent/command-extract.ts`; `drive-loop.ts` does not import `src/agent/` here.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The pure loop (turns, cold-start retry, step cap, display filtering, follow-up text, late-result drop on abort) | `runAcpToolLoop` in `src/acp/loop.ts` |
| Today's gate-then-route runner (the shape the driver's runner takes, minus the notification) | `coreToolRunner` in `src/acp/run-prompt.ts` |
| The core primer | `corePrimer` in `src/acp/drive-loop.ts` (piece 10.1) |
| Table, extractor, gate, gate decision type | `createAcpToolTable`, `toolExtractor`, `gateCommand`, `AcpGateDecision` in `src/acp/tool-table.ts` |
| Event, session, deps, and snapshot types | `AcpLoopHandlers`, `AcpLoopSession`, `AcpLoopDeps`, `AcpRunSnapshot` in `src/acp/types.ts` |
| Event guard (untouched here) | `guardAcpHandlers` in `src/acp/guard-handlers.ts` |
| Scripted fake session and recording handlers for tests | `makeSession`, `makeHandlers` in `src/acp/loop.test.ts` (copy the pattern) |

## Proposed changes

Land in this order; each step keeps typecheck and tests green.

1. `src/acp/types.ts` (120 lines): the optional `workspace` and `refused` parameters on `AcpLoopHandlers.ranCommand`, the optional `startCommand`, and the `AcpToolHost` type. It stays well under the limit.
2. `src/acp/drive-loop.ts`: `CORE_MAX_STEPS`, the runner (module-private), `driveToolLoop`, and `runToolLoop`, beside 10.1's `corePrimer`. About 55 more lines, so the file stays near 75.

Knip: `driveToolLoop` and `runToolLoop` are consumed only by `src/acp/drive-loop.test.ts` until subplan 11, which knip accepts because test files are entry points (as `gateCommand` was before subplan 8). `CORE_MAX_STEPS` is used in its own file (`ignoreExportsUsedInFile` in `knip.json`) and by the tests. `AcpToolHost` is used by `drive-loop.ts`.

## Tests

Extend `src/acp/drive-loop.test.ts` (from piece 10.1) with a scripted fake session in the style of `src/acp/loop.test.ts`, a real tool table from `createAcpToolTable`, and recording `vi.fn()` host functions. Do not mock `./loop.js` here. Snapshots are built inline (`kind: 'core'`, `role`, `roleName`, `grants`, `rows`, `withoutTools`).

- routing: a `db sqlite query …` reply calls `runCaller` with that command, and a granted `file read …` reply calls `runWorkspace`; each result is fed into the follow-up prompt;
- events in order for one step: `startTurn(true)`, `chunk`, `endTurn`, `startCommand(command, false)`, `ranCommand(command, result, false, undefined)`, then `startTurn(false)` for the follow-up turn, then `finished('answered', 8)`; a workspace step reports `true` in both;
- refusals: an agent-off row (`effectiveAgentAccess: false`) gives one step whose result is `Command is disabled: <command>.` with `refused: 'disabled'` and `workspace: false`; an ungranted command whose tool is present (a role granted `db sqlite list` emitting `db sqlite query …`) gives `Command not allowed for role "<roleName>": db sqlite query.` with no `refused`; neither calls a host function;
- the step cap: a session that always emits a command ends with `finished('capped', 8)` after eight `ranCommand` events.

No driver test covers a gate throw. The driver's extractor only yields a command some tool in the same table recognizes, and that tool's `match` claims it, so the throw cannot be reached through `driveToolLoop`. The throw itself is covered by `src/acp/tool-table.test.ts`, and a throwing `runCommand` becoming `error` by `src/acp/loop.test.ts`.

## Out of scope

The after-abort rejection handling and the cancellation tests (piece 10.3). Switching `runCorePrompt` to `runToolLoop`, moving the `command-disabled` notification into `ranCommand`, and updating `guardAcpHandlers` (subplan 11). The agent kind and the `extractAgentCommand` move (subplan 12). `executeAgentRun` (subplan 13). The far-side frame mapping and its abort guard (subplans 18 and 20). The remote branch of `runToolLoop` (subplan 23). Host tags (subplan 24).

## Verification

Run `$janissary/scripts/run.mjs check-diff` (lint, typecheck, knip-relevant exports, and the server tests for `src/acp/`). Confirm the existing `src/acp/loop.test.ts`, `src/acp/run-prompt.test.ts`, and `src/agent/` tests compile and pass unchanged with the optional handler members, and that `src/acp/drive-loop.ts` imports nothing outside the purity list. Nothing user-visible changes, so there is no manual check.
