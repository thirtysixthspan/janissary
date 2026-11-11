# ACP tool loop 21 — `RemoteAcpSession.run`: turns, terminal, and cancellation

**Complexity: 5/10** — ~70 added lines in 2 files and one new module, 9 requirements, 8 scenarios (p=5.44)

Run order: 21 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (the `run`, admission, chunk-accumulation, `remote: true`, and `AcpSessionListener` sentences of "Local side"; decisions 7, 9, and 10, local adapter halves). Depends on subplans 11, 14, 16, and 20 (`move-janissarys-acp-tool-loop-11-core-loop-driver-switch.md`, `move-janissarys-acp-tool-loop-14-acp-run-frame.md`, `move-janissarys-acp-tool-loop-16-turn-frames.md`, `move-janissarys-acp-tool-loop-20-far-side-cancellation.md`). Subplan 22 adds tool frames to it, and subplan 23 calls it.

The local adapter for a remote ACP session, `createRemoteAcpSession`, turns frames into callbacks and holds no reference to `Managers` or the tab. This subplan gives it a `run` method that starts a far-side loop and turns the turn and terminal frames into the same `AcpLoopHandlers` events the in-process driver produces. That way `runCorePrompt` and `executeAgentRun` keep one set of handlers whichever side ran the loop. It is additive: `prompt` keeps working until subplan 23 removes it.

## Design decisions

- **`run(text, snapshot, runCaller, events)`** admits the run through the session's `AcpPromptControl`, then sends `acp-run { id, text, snapshot }`.
  - A refused admission reaches `events.error` with the control's text, as a refused prompt does today. Admission is refused when a run is already in flight or the session is closed.
  - `runCaller` is accepted and kept for subplan 22, which answers tool requests with it.
- **Terminal mapping.** The admitted turn's handlers map the run's terminal onto the events:
  - `acp-run-end` with `answered` or `capped` calls `events.finished(reason, CORE_MAX_STEPS)`. Only a `core` run is ever capped.
  - `cancelled` calls nothing, because the local prompt already settled through the cancel path, as it does now.
  - A non-fatal `acp-error` calls `events.error`.
- **Cancellation** (source decision 9, local adapter half). `cancel` sends `acp-cancel` and drains on the run's terminal frame, `acp-run-end` or `acp-error`, exactly as one provider turn drains today. The existing `cancel` implementation already does this through `control.cancel` once the run is the control's current turn.
- **Transport loss** (source decision 10, local adapter half). A dropped channel releases the control with the transport-loss message. The run's handlers turn that into `events.error`, so the local prompt settles with the existing transport-loss error. The owner's `onTransportLost` hook still closes the session, so the next `ask` or `tell` starts a fresh one.
- **Turns and chunks** (source decision 7, display path).
  - `acp-turn start` calls `events.startTurn(first)` and resets the turn's accumulated text.
  - Each `acp-chunk` delta is appended, and `events.chunk` receives the cumulative text the chunk event expects.
  - `acp-turn end` calls `events.endTurn(display)`.
  - While a run is current, chunks go to the run's accumulator. While a plain `prompt` is current, they go to its handlers as today.
- **Discriminant.** `RemoteAcpSession` gains `remote: true`, so subplan 23's `runToolLoop` can tell it from a local `AcpSession`.
- **Listener.** `AcpSessionListener` in `src/remote/channel/acp.ts` gains `onTurn` and `onRunEnd`, and `dispatchAcp` routes `acp-turn` and `acp-run-end` to them. `onEnd` and its `acp-end` case stay until subplan 25 removes the frame.
- **Module split.** The run handling lives in a new `src/remote/acp-session-run.ts`, so `acp-session.ts` (172 raw lines) stays under the limit. It holds no `Managers` reference, matching the adapter's existing rule.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The adapter, its control, cancel, release, and detach | `createRemoteAcpSession` in `src/remote/acp-session.ts` |
| One-in-flight admission and drain | `AcpPromptControl` in `src/acp/prompt-control.ts` |
| Listener and frame routing | `AcpSessionListener`, `dispatchAcp` in `src/remote/channel/acp.ts` |
| Events | `AcpLoopHandlers` in `src/acp/types.ts`; `CORE_MAX_STEPS` in `src/acp/drive-loop.ts` |

## Proposed changes

- New `src/remote/acp-session-run.ts`: the run state (its accumulator and cancelled flag) and the turn and terminal mapping.
- `src/remote/acp-session.ts`: `run`, `remote: true`, the two new listener handlers delegating to the run module, and chunk routing by which kind of turn is current.
- `src/remote/channel/acp.ts`: the two handlers and their `dispatchAcp` cases.

## Tests

`src/remote/acp-session.test.ts`, over a fake channel:
- `run` sends `acp-run` with the text and snapshot;
- `acp-turn start` plus two `acp-chunk` deltas give `startTurn(true)` and cumulative `chunk` calls, and the accumulator resets on the next turn;
- `acp-turn end` gives `endTurn(display)`;
- `acp-run-end answered` and `capped` give `finished` with `CORE_MAX_STEPS`, and `cancelled` gives nothing;
- a non-fatal `acp-error` gives `events.error`;
- cancel sends `acp-cancel` and resolves only after `acp-run-end`;
- a transport loss mid-run gives `events.error` with the transport-loss message;
- a second `run` while one is in flight is refused.

## Out of scope

Tool requests and far-side steps (subplan 22). Calling `run` from `runToolLoop`, and removing `prompt` (subplan 23). Removing `onEnd` and `acp-end` (subplan 25).

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Nothing user-visible changes yet.
