# ACP tool loop 10 — the shared loop driver module

**Complexity: 5/10** — ~90 added lines, mostly one new module, 11 requirements, 8 scenarios (p=5.63)

Run order: 10 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` ("One loop driver"; decisions 1, 6, 7, and 9, driver halves). Depends on subplans 7 and 8 (`move-janissarys-acp-tool-loop-7-run-snapshot-and-gate.md`, `move-janissarys-acp-tool-loop-8-core-loop-snapshot.md`). Subplan 11 switches `runCorePrompt` to it, subplan 12 adds the agent kind, subplan 18 drives it on the far side, and subplan 23 adds its remote branch.

The far side has to run the same loop the local side runs, and it cannot load `Managers`. This subplan adds a new pure module, `src/acp/drive-loop.ts`, that owns the primer, the tool table, the extractor, the step cap, and the gate-then-route runner for a `core` run. It reaches the outside world only through an injected host and events. Nothing calls it yet except its tests; subplan 11 makes `runCorePrompt` use it.

## Design decisions

- **`driveToolLoop(session, prompt, snapshot, host, events, signal)`** wraps `runAcpToolLoop` (`src/acp/loop.ts`, unchanged). For the `core` kind:
  - **Primer.** It builds the primer in today's order from `runCorePrompt`: `toolPrimer` over the granted tools (their slices and the allow-list line), then `NO_BUILTIN_TOOLS_LINE` or `NO_TOOLS_LINE`, then `TELL_INSTRUCTION` for the tell role, then `MARKDOWN_INSTRUCTION`.
  - **Tools.** A `withoutTools` snapshot builds an empty tool table.
  - **Extractor and cap.** The extractor is `toolExtractor`, and `maxSteps` is `CORE_MAX_STEPS`, an exported constant of 8. Subplan 16 relies on it to send no step count, and subplan 21 takes a remote run's capped-paragraph number from it, so both sides use one value.
- **`TELL_INSTRUCTION` moves** here from `run-prompt.ts`. `runCorePrompt` imports it from the new module until subplan 11 stops assembling the primer itself.
- **The host** is `{ runCaller(command), runWorkspace(command) }`. Each returns the step's output text, synchronously or as a promise.
- **The runner** gates each command with `gateCommand`:
  - It fires `events.startCommand(command, workspace)` before the command runs, refusals included. That matches today's `recordTool(command)` before `runCommand`, which is what shows a step while a question is pending.
  - A refusal is reported as one completed step whose result is the refusal text.
  - Otherwise it calls `host.runWorkspace` or `host.runCaller` by the gate's `runsOn`.
  - When `runAcpToolLoop` then reports the step, the driver forwards it as `events.ranCommand(command, result, workspace, refused)`.
  - A gate throw, `No ACP tool matched command: …`, reaches `runAcpToolLoop`'s catch and becomes the `error` event, as today.
- **Events reuse `AcpLoopHandlers`** (`src/acp/types.ts`), with two additive changes:
  - `ranCommand` gains `workspace` and `refused`. Both are optional at the type level, so `runAcpToolLoop`'s own two-argument call and every existing handler keep compiling. An absent `workspace` means false.
  - There is a new `startCommand(command, workspace)`, also optional, so the handler literal in `executeAgentRun` needs no placeholder before subplan 13 replaces it.
  
  `guardAcpHandlers` is untouched here. Subplan 11 passes the new event through it.
- **`runToolLoop(session, prompt, snapshot, host, events, signal)`** is the one entry point the local side will call. In this subplan it drives every session in-process through `driveToolLoop`. Subplan 23 adds the branch that hands a remote session to the far side.
- **Cancellation** (source decision 9, driver half). Once the signal aborts, a late host result is dropped. `runAcpToolLoop` already returns without `ranCommand` or a follow-up turn when the signal aborted while a command ran.
- **Purity.** `drive-loop.ts` imports `tool-table.ts`, `loop.ts`, `internal-tools.ts`, the `MARKDOWN_INSTRUCTION` constant from `launch.ts`, and types. It never imports `Managers`, the command registry, `src/native-commands/policy.ts`, or `src/application-commands.ts`, because the far side loads it in subplan 18.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The pure loop (turns, cold-start retry, step cap, display filtering, follow-up text) | `runAcpToolLoop` in `src/acp/loop.ts` |
| Today's primer assembly | `runCorePrompt` in `src/acp/run-prompt.ts` |
| Primer lines | `NO_BUILTIN_TOOLS_LINE`, `NO_TOOLS_LINE` in `src/acp/internal-tools.ts`; `MARKDOWN_INSTRUCTION` in `src/acp/launch.ts` |
| Table, primer, extractor, gate | `createAcpToolTable`, `toolPrimer`, `toolExtractor`, `gateCommand` in `src/acp/tool-table.ts` |
| Event and session types | `AcpLoopHandlers`, `AcpLoopSession` in `src/acp/types.ts` |

## Proposed changes

- New `src/acp/drive-loop.ts`: `CORE_MAX_STEPS`, `TELL_INSTRUCTION`, the host type, `driveToolLoop` for the core kind, and `runToolLoop`.
- `src/acp/types.ts`: the two optional `AcpLoopHandlers` additions.
- `src/acp/run-prompt.ts`: import `TELL_INSTRUCTION` from the new module instead of declaring it.

## Tests

New `src/acp/drive-loop.test.ts`, over a scripted fake session:

- a caller command routes to `runCaller`, and a workspace command routes to `runWorkspace`;
- the events come in order: `startTurn`, `chunk`, `endTurn`, `startCommand`, `ranCommand`, then the follow-up turn, then `finished`;
- a refusal is one step carrying `refused: 'disabled'`, and neither host function is called;
- the primer order, with the tell instruction for `tell` only, and a `withoutTools` snapshot giving `NO_TOOLS_LINE` and no slices;
- the step cap of 8 ends with `finished('capped', 8)`;
- an abort while `runCaller` is pending suppresses its late result, with no `ranCommand` and no further turn;
- an unmatched command becomes an `error` event.

## Out of scope

Switching `runCorePrompt` to the driver (subplan 11). The agent kind (subplan 12). The remote branch of `runToolLoop` (subplan 23).

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Nothing user-visible changes.
