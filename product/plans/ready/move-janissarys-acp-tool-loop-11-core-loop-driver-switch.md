# ACP tool loop 11 — the core loop runs through the shared driver

**Complexity: 4/10** — ~25 added lines in 2 edited files, 8 requirements, 9 scenarios (p=5.18)

Run order: 11 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (the local half of "Local side: one entry point for both session kinds", its "handlers … moved unchanged" paragraph; decisions 1, 6, 7, and 9, local core halves). Depends on subplan 10, implemented as `product/plans/complete/move-janissarys-acp-tool-loop-10-loop-driver-module-{1-core-primer,2-gate-and-route-driver,3-driver-cancellation}.md` (source: `…-10-loop-driver-module.md`, whose contract notes this plan folds in). Subplan 13 makes the same switch for agent runs, subplan 23 adds the remote branch behind the same call, and subplan 24 tags remote workspace steps in the handlers this plan moves.

`runCorePrompt` (`src/acp/run-prompt.ts`) still drives `runAcpToolLoop` itself, through its own gate-and-route runner `coreToolRunner` and a `runCommand` wrapper that records each step. This subplan replaces that with one call to `runToolLoop` from `src/acp/drive-loop.ts`. `runCorePrompt` keeps only what is local by nature: the snapshot it builds, a host made of its caller and workspace runners, the `active()`-guarded session, and the transcript, notification, record, and settle handlers. Behavior on every tab stays exactly as it is today.

## Design decisions

- **One call.** `runCorePrompt` builds the snapshot with `coreSnapshot` as today and calls `runToolLoop(guardedSession, request.prompt, snapshot, host, guardAcpHandlers(events, active), request.abort.signal)`. Deleted from `run-prompt.ts`: the direct `runAcpToolLoop` call, the `corePrimer(snapshot, tools)` call, the `tools` table, `coreToolRunner`, the inline `runCommand` wrapper, and `recordAsyncResult`. `coreSnapshot` and `dispatchNative` stay. Imports that become unused go with them: `runAcpToolLoop` (`./loop.js`), `createAcpToolTable`, `gateCommand`, `toolExtractor`, and `AcpTool` (`./tool-table.js`), and `corePrimer`; `runToolLoop` is imported from `./drive-loop.js`. `readFileInTab`, `createInvocationContext`, `notify`, and `NATIVE_ACP_COMMANDS` stay in use.
- **What the driver now owns** (already implemented in `driveToolLoop`, `src/acp/drive-loop.ts`, so `runCorePrompt` must not repeat it): the tool table (empty when `snapshot.withoutTools`), the primer via `corePrimer`, the extractor via `toolExtractor`, `maxSteps: CORE_MAX_STEPS` (8), the gate via `gateCommand`, and dropping a host rejection that arrives after the signal aborted. Today `runCorePrompt` passes no `maxSteps` and relies on `runAcpToolLoop`'s default of 8 (`src/acp/loop.ts`, `dependencies.maxSteps ?? 8`), so the cap is unchanged. The cold-empty-first-reply retry and the final-command-line removal live in `runAcpToolLoop` and are reached unchanged through the driver.
- **`corePrimer` stays exported.** After the switch its only production caller is `driveToolLoop` in the same file, but `src/acp/drive-loop.test.ts` imports it directly for its `corePrimer` cases. `knip.json` puts test files in the project (`src/**/*.{ts,tsx}`, and knip's vitest plugin treats them as entries), so the export is not reported unused. Do not make it private.
- **Host** (`AcpToolHost`, `src/acp/types.ts`). Built inline in `runCorePrompt`:
  - `runCaller(command)` throws `new Error('ACP: prompt cancelled.')` when `active()` is false, otherwise returns `dispatchNative(managers, label, command, request.abort.signal)`.
  - `runWorkspace(command)` throws the same error when `active()` is false, otherwise returns `readFileInTab(managers, label, command)`.
  - Both are plain (non-`async`) functions so the cancellation throw is synchronous, exactly like today's `runCommand` wrapper at `run-prompt.ts` (`if (!active()) throw new Error('ACP: prompt cancelled.')`). `runAcpToolLoop` catches it and calls `error`, which the guard drops because the prompt is no longer active.
  - A refusal never reaches the host (the driver's `gatedRunner` returns it first), so the host has no refusal branch.
- **Handlers move unchanged in behavior** (source decision 7). The events object passed to `guardAcpHandlers` is today's literal plus `startCommand`:
  - `startCommand(command)` calls `recordTool(command)` — today's `recordTool(command)` in the `runCommand` wrapper. The driver fires it for every step, refusals included, before calling the host, as today's wrapper recorded the command before running it.
  - `ranCommand(command, result, _workspace, refused)` does, in this order: when `refused === 'disabled'`, `notify(managers, 'command-disabled', label, result)` (moved from `coreToolRunner`; source decision 6); then `recordTool(result)` (moved from the `runCommand` wrapper and `recordAsyncResult`); then today's `appendAcp(managers, label, { input: command, output: result, acp: true })`. This keeps today's order (notify, result record, transcript entry). An agent-off refusal also arrives as `refused: 'disabled'` (`gateCoreCommand` in `src/acp/tool-table.ts` returns `'disabled'` for both), so it still notifies, matching today. `workspace` is unused here; subplan 24 uses it for host tags.
  - `finished` keeps the `(stopped after <maxSteps> tool steps)` paragraph, with `maxSteps` the value the driver passes (`CORE_MAX_STEPS`).
  - `startTurn`, `chunk`, `endTurn`, and `error` are today's bodies, unchanged.
- **Event guard** (`guardAcpHandlers`, `src/acp/guard-handlers.ts`). It gains a `startCommand` member that calls `handlers.startCommand?.(command, workspace)` under its `active()` check, and its `ranCommand` member forwards all four arguments `(command, result, workspace, refused)` under the same check. `startCommand` is always present on the returned object (an optional call inside), so `executeAgentRun` (`src/agent/execute.ts`), the module's other caller, keeps working: it passes no `startCommand`, and `runAcpToolLoop` never calls it.
- **Session guard and where wrapping happens.** `runCorePrompt` keeps today's wrapper: an `AcpLoopSession` whose `prompt` returns without calling the provider when `active()` is false, and otherwise calls `session.prompt` with `onChunk`, `onEnd`, and `onError` each forwarded only while `active()`. Extract it unchanged into a module-private helper in `run-prompt.ts`, `guardedSession(session, active)`, and pass its result as `runToolLoop`'s first argument. So the wrapping happens in `runCorePrompt`, before `runToolLoop`, and `runToolLoop` receives an already-wrapped session. Subplan 23 relies on this: it makes `runCorePrompt` call `guardedSession` only for a local session and hands a `RemoteAcpSession` to `runToolLoop` unwrapped, so `runToolLoop` can check `remote: true` on it. This wrapper is also what drops a provider `onError` arriving after the abort; the driver drops only late host rejections.
- **Cancellation** (source decision 9, local core half). A reset mid-run settles the prompt at once through the existing reset path, unchanged. After that, `active()` is false (the signal is aborted), so: the guarded session drops late provider callbacks; the guarded events drop `startCommand`, `ranCommand`, `finished`, and `error`; the host throws `ACP: prompt cancelled.` for a step that starts afterwards; and the driver turns a host rejection after the abort into a discarded empty result. Note the one ordering change: `startCommand` now fires before the host's cancellation throw rather than after the `active()` check, so a command emitted after cancellation is recorded only because the guard drops it — the guard on `startCommand` is required, not optional.
- **Accepted equivalence.** Today a refusal emitted while the prompt is inactive throws `ACP: prompt cancelled.`; after the switch the driver returns the refusal without touching the host. Both end with nothing visible: the guard drops `ranCommand` and the follow-up `startTurn`, and `guardedSession` sends nothing to the provider.
- **File size.** `run-prompt.ts` is 144 lines today. Removing `coreToolRunner`, `recordAsyncResult`, the `runCommand` wrapper, and the tool-table imports and adding the host, `startCommand`, the notify line, and `guardedSession` leaves it well under the 200-line limit; no extraction is needed. `guard-handlers.ts` grows by one line.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Entry point, driver, step cap | `runToolLoop`, `driveToolLoop`, `CORE_MAX_STEPS` in `src/acp/drive-loop.ts` (subplan 10) |
| Gate-and-route runner, `startCommand` emission, step `workspace`/`refused` tracking, late-rejection drop | `gatedRunner`, `dropLateRejection` in `src/acp/drive-loop.ts` |
| Host and event types | `AcpToolHost`, `AcpLoopHandlers` (optional `startCommand`; `ranCommand(command, result, workspace?, refused?)`), `AcpLoopSession` in `src/acp/types.ts` |
| Today's handlers, caller runner, snapshot, and session guard | `runCorePrompt`, `dispatchNative`, `coreSnapshot` in `src/acp/run-prompt.ts` |
| Workspace runner | `readFileInTab` in `src/file-read/tab-read.ts` |
| Event guard | `guardAcpHandlers` in `src/acp/guard-handlers.ts` |
| Tool record | `coreActivity` in `src/acp/record-feed.ts` (via `runCorePrompt`'s `recordTool`) |

## Implementation steps

Each step leaves typecheck and tests green.

1. **`src/acp/guard-handlers.ts`.** Add the guarded `startCommand` and forward all four `ranCommand` arguments, as decided above. Nothing yet passes `startCommand` or the extra arguments through it, so behavior is unchanged. Add `src/acp/guard-handlers.test.ts` (no test file exists for it today) with the guard cases listed under Tests.
2. **`src/acp/run-prompt.ts` and `src/acp/run-prompt.test.ts`, together.** Switch `runCorePrompt` to `runToolLoop` with the host, `guardedSession`, and the moved handlers, and delete the code listed under "One call". In the same step update the one test that moves (below), because the `command-disabled` notification no longer fires from `deps.runCommand`.

## Tests

`src/acp/run-prompt.test.ts`, `src/acp/manager.test.ts`, and `src/acp/manager-fallback.test.ts` mock `./loop.js`. That mock also replaces `drive-loop.ts`'s import of `runAcpToolLoop`, so after the switch `mocks.runAcpToolLoop.mock.calls[n]` still captures the call: argument 0 is `guardedSession`'s result, argument 2 the driver's deps (`primer`, `runCommand` = the gated runner, `extractCommand`, `maxSteps`, `signal`), argument 3 the driver's handler adapters, which forward into the guarded events. The existing primer, routing, refusal-text, file-read, without-tools, and settle cases therefore keep passing unchanged, and `manager.test.ts`'s `ranCommand handler appends the command result to the tab` and `finished('capped', 5)` cases still hold.

`src/acp/run-prompt.test.ts`:
- extend `harness().start` to also return `handlers` (`calls.at(-1)?.[3]`) and `session` (`calls.at(-1)?.[0]`);
- move `refuses a %s command synchronously and raises the disabled notification`: `deps.runCommand` still returns the refusal synchronously without dispatching, and the notification is now asserted after calling `handlers.ranCommand(command, refusal)` (the adapter supplies `refused: 'disabled'` from the step it just gated); also assert `deps.runCommand` alone raises no `command-disabled`;
- `deps.maxSteps` is 8 (the capped paragraph itself stays covered by `manager.test.ts`'s `finished handler settles a capped answer with the notice` case);
- with an `acpRecords` stub whose `activity` is a spy, and the same `recordId` set on both the request and the role state the harness writes into `runtime.acpRoles[role]` (`coreActivity` records only when `state.prompt.recordId === state.recordId`), `deps.runCommand(granted)` records the command once and `handlers.ranCommand(command, result)` records the result and appends the `acp: true` entry;
- after `request.abort.abort()`: `deps.runCommand('db sqlite query shop SELECT 1')` throws `ACP: prompt cancelled.`, `dispatchNativeLine` is not called, and no tool activity is recorded; `handlers.ranCommand` and `handlers.finished` record and settle nothing;
- a provider `onError` after the abort is dropped: call `session.prompt(text, spyHandlers)`, take the handlers `runCorePrompt` passed to the stub session's `prompt`, abort, call their `onError`, and assert `spyHandlers.onError` was not called.

`src/acp/guard-handlers.test.ts` (new):
- while active, `startCommand` and a four-argument `ranCommand` reach the wrapped handlers with every argument intact;
- while inactive, neither reaches them;
- a handlers object without `startCommand` does not throw when the guarded `startCommand` is called.

## Out of scope

Agent runs (subplans 12 and 13). The remote branch of `runToolLoop`, the `RemoteAcpSession` union, and conditional session wrapping (subplan 23). `[<host>] ` tags on remote workspace steps (subplan 24). Any change to `dispatchNative`, `coreSnapshot`, `corePrimer`, or the driver itself.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then, by hand, on a local tab:
- `ask` and `tell` with `db`, `browser`, `question`, and `file read` steps show the same transcript entries, connection-record `tool` lines, and replies as before;
- disable `db sqlite query` in native-command settings and run a `tell` that uses it: the refusal step appears and the `command-disabled` notification fires;
- a prompt that loops on a command stops after eight steps with `(stopped after 8 tool steps)`;
- `tell reset` mid-run settles at once with no further step and no late transcript entry.
