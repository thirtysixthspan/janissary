# ACP tool loop 21 — `RemoteAcpSession.run`: turns, terminal, and cancellation

**Complexity: 5/10** — ~75 added lines across 2 edited files and 1 new module, 11 requirements, 12 scenarios (p=5.73)

Run order: 21 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (the `run`, admission, chunk-accumulation, `remote: true`, and `AcpSessionListener` sentences of "Local side"; decisions 7, 9, and 10, local adapter halves). Depends on subplans 11, 14, 16, 18, 19, and 20 (`move-janissarys-acp-tool-loop-11-core-loop-driver-switch.md`, `move-janissarys-acp-tool-loop-14-acp-run-frame.md`, `move-janissarys-acp-tool-loop-16-turn-frames.md`, `move-janissarys-acp-tool-loop-18-far-side-loop-module.md`, `move-janissarys-acp-tool-loop-19-far-side-run-wiring.md`, `move-janissarys-acp-tool-loop-20-far-side-cancellation.md`). Subplan 22 adds tool frames to it, and subplan 23 calls it.

The local adapter for a remote ACP session, `createRemoteAcpSession`, turns frames into callbacks and holds no reference to `Managers` or the tab. This subplan gives it a `run` method that starts a far-side loop and turns the turn and terminal frames into the same `AcpLoopHandlers` events the in-process driver produces. That way `runCorePrompt` and `executeAgentRun` keep one set of handlers whichever side ran the loop. It is additive: `prompt` keeps working until subplan 23 removes it, and no production caller sends `acp-run` until then.

## Design decisions

- **`run` signature and admission.** `RemoteAcpSession` in `src/remote/acp-session.ts` gains `run`, taking the prompt text, an `AcpRunSnapshot`, an `AcpToolHost['runCaller']`, and `AcpLoopHandlers`, and returning nothing; it also gains the literal `remote: true`. It uses the same admit-then-send order as `prompt` at `src/remote/acp-session.ts:153-156`: admit the run's handlers, return without sending when admission is refused, and send `acp-run { id, text, snapshot }` only after a successful admit.
  - The admitted handlers are the run's mapping: `onChunk` accumulates, `onEnd` maps a terminal reason, `onError` calls `events.error`.
  - A refused admission is delivered to `events.error` with the control's own text (`ACP: a prompt is already running.` or `ACP session closed.`, `src/acp/prompt-control.ts:20-23`), exactly as a refused `prompt` delivers it to its handlers. Admission is refused when any prompt or run is in flight, or the session is closed. Nothing is sent on refusal, and a refused `start` must not replace the in-flight run's stored turn, events, caller, or accumulator: the refusal handler closes over the refused call's own `events`, and the run state is replaced only after a successful admit.
  - `runCaller` is stored on the run state for subplan 22; this subplan does not call it.
  - `prompt` stays on `RemoteAcpSession` and on the wire until subplan 23, which removes it and switches the type to `Omit<AcpSession, 'prompt'>` plus the same `run`, `ready`, `release`, and `remote: true` members.
- **Terminal mapping goes through the control, never straight to the events.** `onRunEnd(reason)` calls `control.end(turn, reason)` when `control.owns(turn)` (`src/acp/prompt-control.ts:37-43`), the same call the existing `acp-end` handler makes at `src/remote/acp-session.ts:103-106`. The run's admitted `onEnd` then maps:
  - `answered` or `capped` to `events.finished(reason, CORE_MAX_STEPS)` (`CORE_MAX_STEPS` at `src/acp/drive-loop.ts:23`). Only a `core` run can be capped: `driveToolLoop` passes `CORE_MAX_STEPS` for core and `Infinity` for agent at `src/acp/drive-loop.ts:70`.
  - `cancelled` to no event. The far side sends that reason only from its `cancel` path (`src/remote/serve-acp-loop.ts:93-101`), in response to the local `acp-cancel`; the tab prompt is already settling through `AcpManager.cancel` (`src/acp/manager.ts:168-193`) after `session.cancel()` drains. The control must still be ended, or `cancel()` waits forever on `turn.drained` (`src/acp/prompt-control.ts:49-61`).
  - Any other reason to no event.
  Calling `events.finished` directly from the listener instead of ending the control would leave `control.current` set, so a successor `run` or `prompt` is refused and `cancel` never resolves.
- **Errors.** A non-fatal `acp-error` already reaches the admitted handlers through `control.error(turn, message)` at `src/remote/acp-session.ts:117-119`; the run's `onError` maps it to `events.error`. A fatal error and a release reach the same handler through `control.release` (`src/acp/prompt-control.ts:63-71`). No new error listener is needed.
- **Cancellation** (source decision 9, local adapter half). `cancel` is unchanged: with a current turn it sends `acp-cancel` through `control.cancel`, and that promise resolves only after the control drains on `control.end`, `control.error`, or release. The new obligation is that `onRunEnd` ends the control for every reason, `cancelled` included. This also covers a cancel between turns, where the far side sends `acp-run-end cancelled` at once (`src/remote/serve-acp-loop.ts:93-101`).
- **Transport loss** (source decision 10, local adapter half). `detach` (`src/remote/acp-session.ts:65-75`) calls the owner's `onTransportLost` hook before `control.release(message)`. In a tab, the hook in `AcpSessionManager.session` settles the prompt with `Remote connection lost.` (`src/acp/session-manager.ts:80-84`) and the `active()` guard then drops the late `events.error`; in an agent run the hook aborts, and `executeAgentRun` settles `Agent terminated.` (`src/agent/execute.ts:82`, `:127`). At the adapter boundary the release raises `events.error` with the adapter's existing `Remote connection lost before agent readiness.`; do not change `detach` or that message in this subplan. The next `ask` or `tell` starts a fresh session, as today.
- **Turns and chunks** (source decision 7, display path).
  - `acp-turn start` calls `events.startTurn(first)` and resets the run's accumulator to empty.
  - Each `acp-chunk` delta is appended, and `events.chunk` receives the cumulative text the chunk event expects.
  - `acp-turn end` calls `events.endTurn(display)` with the frame's authoritative display.
  - The existing `onChunk` listener already routes `control.current?.handlers.onChunk` (`src/remote/acp-session.ts:90`), so there is no chunk-routing branch to add: the run's admitted `onChunk` is the accumulator, and a plain prompt keeps its own handlers.
  - Turn callbacks apply only while `control.owns(runTurn)`; a late turn frame from a finished run is ignored rather than opening an entry in its successor.
- **Listener.** `AcpSessionListener` in `src/remote/channel/acp.ts` gains required `onTurn` and `onRunEnd`: `onTurn` takes the `acp-turn` frame itself, so its `phase` discriminates `first` from `display`; `onRunEnd` takes the frame's `reason`. `dispatchAcp` routes `acp-turn` and `acp-run-end` to them. `onEnd` and its `acp-end` case stay until subplan 25.
  - Both methods are required, not optional, so a listener cannot silently drop a frame. `tsconfig.json` excludes `*.test.*`, so the compiler does not check the test fakes: update every inline listener literal in `src/remote/channel/index.test.ts` by hand — the `acpHarness` helper and the one-off literals at `:296-299`, `:318-330`, `:342-356`, and `:494` — or a routed frame calls `undefined` at runtime.
- **Module split.** The run handling lives in a new `src/remote/acp-session-run.ts` and holds no `Managers` or tab reference, matching the adapter's existing rule. It exports a `createRemoteAcpRun` factory taking the session's `AcpPromptControl` and returning an exported `RemoteAcpRun` type. The factory owns the admitted `ProviderTurn`, the per-turn accumulator, the stored `runCaller`, and the current `events`, and exposes four methods: `start(runCaller, events)` (admits and returns whether it was admitted), `chunk(delta)`, `turn(frame)`, and `end(reason)`. The admitted `ProviderTurn` already carries the `cancelled` flag that `control.cancel` sets (`src/acp/prompt-control.ts:53`), so subplan 22 reads that rather than adding a second flag. `acp-session.ts` creates one per session, delegates the listener callbacks to it, and sends `acp-run` only when `start` returns true. `acp-session.ts` is 172 raw lines and the 200-line cap skips blanks and comments, so the split is for cohesion and for subplan 22's growth, not to escape the limit.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The adapter, its control, cancel, release, and detach | `createRemoteAcpSession` in `src/remote/acp-session.ts`; `prompt` at `:153`, `onEnd` at `:103`, `onError` at `:111`, `detach` at `:65` |
| One-in-flight admission, ownership, drain, and release | `admit`, `owns`, `end`, `error`, `cancel`, `release` in `AcpPromptControl`, `src/acp/prompt-control.ts:20-71` |
| Listener and frame routing | `AcpSessionListener`, `dispatchAcp` in `src/remote/channel/acp.ts:3-23`; the channel fails an unhandled frame at `src/remote/channel/index.ts:231-233` |
| Events | `AcpLoopHandlers` in `src/acp/types.ts:88-110`; `CORE_MAX_STEPS` at `src/acp/drive-loop.ts:23`; the cap rule at `:70` |
| Frame shapes and the far-side sender | `acp-run`, `acp-turn`, `acp-run-end` in `src/remote/protocol-frames.ts:158`, `:260-261`, `:275`; the events mapping in `startRemoteLoop`, `src/remote/serve-acp-loop.ts:50-68`; cancellation at `:93-101` |
| Existing tab transport-loss settlement | the remote case in `src/acp/record-feed.test.ts:211-222`, which resolves the prompt with `ACP: Remote connection lost.` |
| Test fake | `fakeChannel`/`makeSession` in `src/remote/acp-session.test.ts:17-36` |

## Proposed changes

- New `src/remote/acp-session-run.ts`: `createRemoteAcpRun`, the exported `RemoteAcpRun` type, the run state, and the turn and terminal mapping.
- `src/remote/acp-session.ts`: the `run` method, `remote: true`, the run state, and `onTurn`/`onRunEnd` delegation. No chunk-routing change.
- `src/remote/channel/acp.ts`: the two required listener methods and their `dispatchAcp` cases.

## Tests

`src/remote/acp-session.test.ts`, in a new `describe('createRemoteAcpSession — running')` over the existing `fakeChannel`/`makeSession`, with an `AcpLoopHandlers` spy set per test (`makeSession`'s `handlers` is a `PromptHandlers` for the prompt cases and is not reused):
- `run` sends `acp-run` with the text and snapshot; a second `run` while one is in flight is refused with the control's text and sends no second frame; after `acp-run-end`, the next `run` is admitted and sends.
- `acp-turn start` plus two `acp-chunk` deltas give `startTurn(true)` and cumulative `chunk` calls; a second start resets the accumulator; `acp-turn end` gives `endTurn(display)`.
- `acp-run-end answered` and `capped` give `finished` with `CORE_MAX_STEPS`; `cancelled` gives no `finished`, `cancel()` resolves once the run-end arrives, and the next `run` is admitted.
- a non-fatal `acp-error` gives `events.error`.
- a transport loss mid-run gives `events.error` with `Remote connection lost before agent readiness.` when no owner hook is supplied; the adapter test asserts only the release event, not the tab's settlement, which the existing `record-feed.test.ts` case above covers.
- the existing `prompt` cases in the same file stay green unchanged.

`src/remote/channel/index.test.ts`, beside the ACP routing cases:
- `acp-turn` and `acp-run-end` route to the owning listener's `onTurn`/`onRunEnd` and do not fault the channel.
- extend the unattached-id case so both frames are dropped without a word to any listener or a channel fault.
- add `onTurn` and `onRunEnd` to `acpHarness` and every inline listener literal the type now requires.

## Out of scope

Tool requests and far-side steps (subplan 22). Calling `run` from `runToolLoop`, deleting `prompt`, and the session type split (subplan 23). Host tags (subplan 24). Removing `onEnd` and `acp-end`, and the protocol version bump (subplan 25). Specs and docs (subplan 26). No change to `src/remote/serve-acp-loop.ts`, `src/remote/serve-acp.ts`, `src/remote/protocol-frames.ts`, `src/remote/protocol.ts`, or the `detach` message.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Nothing is user-visible yet: no production caller sends `acp-run` until subplan 23, so there is no manual end-to-end check. Confirm `REMOTE_PROTOCOL_VERSION` stays 39 (`src/remote/protocol.ts:212`), `src/remote/acp-session.ts` stays under 200 effective lines, and the far-side suite still passes unchanged.
