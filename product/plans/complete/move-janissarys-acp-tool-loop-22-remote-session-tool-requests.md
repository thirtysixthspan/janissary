# ACP tool loop 22 — `RemoteAcpSession.run`: caller requests and far-side steps

**Complexity: 5/10** — ~45 added lines across 3 edited files, 10 requirements, 13 scenarios (p=5.71)

Run order: 22 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (the `acp-tool-request` and `acp-tool-step` sentences of the `RemoteAcpSession` paragraph of "Local side"; decisions 3 and 9, local adapter halves). Depends on subplans 15, 17, 20, and 21 (`move-janissarys-acp-tool-loop-15-tool-result-frame.md`, `move-janissarys-acp-tool-loop-17-tool-frames.md`, `move-janissarys-acp-tool-loop-20-far-side-cancellation.md`, `move-janissarys-acp-tool-loop-21-remote-session-run.md`). Subplan 23 calls it.

A far-side loop sends two kinds of tool frame. A caller-tool request has to run here and be answered. A far-side step was already completed there and only has to be shown. This subplan completes `RemoteAcpSession.run` by handling both. It runs the request through the `runCaller` the run was given, and turns each frame into the same `startCommand` and `ranCommand` events the in-process driver produces. Nothing sends either frame until subplan 23, so this is additive and invisible to a user.

## Design decisions

- **Caller requests** (source decision 3). A request frame is handled only while the run owns a live, uncancelled turn (the cancel bullet below); otherwise it is ignored without running anything.
  - It calls `events.startCommand?.(command, false)`, then awaits `runCaller(command)`. A caller tool runs here, so `workspace` is `false` — the value `gatedRunner` passes at `src/acp/drive-loop.ts:53`.
  - On success it calls `events.ranCommand(command, output, false)`, then sends `acp-tool-result { id, request, output }`, echoing the frame's `id` and `request` unchanged. `output` is always present, including when it is `''`: the decoder treats a present empty output as a real answer (`src/remote/frame/decode-acp-run.ts:14-18`). Fire the event before the send, as the in-process driver does, so a failed write cannot lose the step from the local transcript.
  - A rejected or throwing `runCaller` sends `{ id, request, error }` with `errorText(error)` from `src/error-text.ts:1` and fires no `ranCommand`. The far side rejects its pending deferred with that text (`src/remote/serve-acp-loop.ts:86-92`); `runAcpToolLoop`'s catch then calls `h.error` (`src/acp/loop.ts:55-61`), so it sends a non-fatal `acp-error` and no `acp-run-end`, and clears its run handle (`src/remote/serve-acp.ts:122-129`). Locally the existing non-fatal handler ends the control and the run's `onError` calls `events.error`; `finished` never fires.
  - The await runs in a detached async block inside `request` that catches every failure, so `dispatchAcp` stays synchronous and no rejection escapes to the channel.
  - The local side keeps no request table. The far side awaits each result before starting the next turn (`runCaller` returns the deferred at `src/remote/serve-acp-loop.ts:39-46`), so no two requests overlap and the frame's fields are enough to answer.
- **Nothing after cancel or release** (source decision 9, matching subplan 20). Subplan 20 rejects the far side's pending deferred on both `cancel` and `abort` and clears the pending map (`src/remote/serve-acp-loop.ts:30-35`), and `toolResult` ignores a request it no longer knows (`:86-92`), so the far side has already stopped waiting. The local side must stop answering:
  - Both handlers first check `control.owns(turn) && !turn.cancelled` on the run's turn at the moment the frame arrives — the same read `src/acp/index.ts:166-167` makes before continuing a prompt. `AcpPromptControl.cancel` sets `turn.cancelled` at `src/acp/prompt-control.ts:53` and leaves it set until the turn is gone; `owns` is false after a release, a terminal, or a successor's admission. A tool frame outside that window is ignored: no event, no `runCaller`, no reply.
  - The request handler re-checks the same guard on the turn it captured at arrival, after awaiting `runCaller`, before firing `ranCommand` or sending. Never read the module's current run at that point: a successor run may already have replaced it, and the old result must not reach the new run's events.
  - A question still pending at cancel resolves `Question cancelled.` locally through the prompt's own abort signal (`AcpManager.cancel` aborts it at `src/acp/manager.ts:179`), as today; its result reaches the guard and goes nowhere.
  - These events are already wrapped in `guardAcpHandlers` by `runCorePrompt` and `executeAgentRun` (`src/acp/guard-handlers.ts:9-10`), so a late event would not be displayed. The adapter's own guard is what keeps a doomed caller tool from running and keeps a stale frame off the wire.
- **Far-side steps.** An `acp-tool-step` calls `events.startCommand?.(command, workspace)` and then `events.ranCommand(command, result, workspace, refused)`, synchronously in that order; the far side already ran it, so there is nothing to await. Take `workspace` from the frame and pass the fourth argument always, using the frame's `refused` (which is `undefined` when absent) exactly as `driveToolLoop` passes `step.refused` at `src/acp/drive-loop.ts:75`; never synthesize a refusal. A plain gate refusal is therefore `workspace: false` with `undefined`, the shape `DrivenStep` models at `src/acp/drive-loop.ts:25`.
- **Listener.** `AcpSessionListener` gains required `onToolRequest` and `onToolStep`, each taking the frame itself (`Extract<RemoteFrame, …>`) the way `onTurn` takes `acp-turn`. `dispatchAcp` routes `acp-tool-request` and `acp-tool-step` to them. Required, not optional, so a listener cannot silently drop a frame; `tsconfig.json` excludes tests, so every `AcpSessionListener` literal in `src/remote/channel/index.test.ts` must be updated by hand or a routed frame calls `undefined` at runtime.
- **Module and send.** The handling lives in `src/remote/acp-session-run.ts` beside the turn mapping from subplan 21. `RemoteAcpRun` gains `request(frame)` and `step(frame)`, named after their frames like `turn(frame)`, and `createRemoteAcpRun` takes the adapter's `send` beside the control. `acp-session.ts` currently constructs the run at `:62` and declares `send` at `:82`; declare `send` first and construct the run after it. Use that adapter `send`, not `channel.send`, so a failed write follows the existing detach and `onError` path (`src/remote/acp-session.ts:82-88`).

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Run state, turn mapping, and stored `runCaller` | `src/remote/acp-session-run.ts` (subplan 21) |
| Adapter send and detach-on-write-failure | `send` and `detach` in `createRemoteAcpSession`, `src/remote/acp-session.ts:71-88` |
| Listener and frame routing | `AcpSessionListener`, `dispatchAcp` in `src/remote/channel/acp.ts:6-30` |
| Frames and far-side sender | `acp-tool-result` (subplan 15); `acp-tool-request`, `acp-tool-step` (subplan 17); their sends at `src/remote/serve-acp-loop.ts:37-66` |
| In-process event order and shapes | `gatedRunner` at `src/acp/drive-loop.ts:40-56`; `AcpLoopHandlers` at `src/acp/types.ts:88-110` |
| Cancellation guard idiom | `control.owns(turn)` plus `turn.cancelled` at `src/acp/index.ts:166-167`; `AcpPromptControl.cancel` at `src/acp/prompt-control.ts:49-61` |
| Error text | `errorText` in `src/error-text.ts:1-3` |
| Test fakes | `fakeChannel`/`makeSession`/`runEvents` in `src/remote/acp-session.test.ts:19-38`, `:226-231`; `acpHarness` in `src/remote/channel/index.test.ts:354-362` |

## Proposed changes

- `src/remote/acp-session-run.ts`: the `ToolRequestFrame`/`ToolStepFrame` aliases, the `request` and `step` members on `RemoteAcpRun`, the liveness guard, and the `send` parameter. About 35 lines; the file is about 57 effective lines now, so no extraction is needed.
- `src/remote/acp-session.ts`: declare `send` before creating the run, pass it to `createRemoteAcpRun`, and delegate `onToolRequest`/`onToolStep`. About 4 lines; the file is about 154 effective lines now and stays under 200.
- `src/remote/channel/acp.ts`: the two frame aliases, the two required listener methods, and their `dispatchAcp` cases. About 6 lines; 27 effective now.

## Tests

`src/remote/acp-session.test.ts`, in the existing `describe('createRemoteAcpSession — running')`, over `fakeChannel`/`makeSession`. Extend `runEvents()` at `:226-231` with `startCommand: vi.fn()`; it is optional today, so the existing cases stay green.
- a request runs a caller tool: `startCommand` with `(command, false)`, then `runCaller`; resolving it fires `ranCommand(command, output, false)` and sends `acp-tool-result` with the frame's `id` and `request`, in both the non-empty and empty (`output: ''`) forms;
- a rejecting `runCaller` sends the error variant with the text `errorText` produces (`database unavailable`, not `Error: database unavailable`) and fires no `ranCommand`;
- a request with no run in flight fires no event and sends nothing;
- a request left pending across `cancel()` fires nothing and sends nothing when it later resolves, even after a successor run is admitted; the successor's events stay untouched;
- a request left pending across `release()` sends no `acp-tool-result` and fires no `ranCommand` when it later resolves (the release's own `events.error` is the only event);
- an `acp-tool-step` with `workspace: true` calls `startCommand` and `ranCommand` with it;
- an `acp-tool-step` with `workspace: false` and `refused: 'disabled'` calls both events with `false` and the flag;
- an `acp-tool-step` with `workspace: false` and no `refused` passes `undefined`, not a synthesized refusal.

`src/remote/channel/index.test.ts`:
- `acp-tool-request` routes to the owning listener's `onToolRequest` with the whole frame, and faults nothing, beside the turn/run-end case at `:413-426`;
- `acp-tool-step` routes to `onToolStep` the same way;
- extend the unattached-id case at `:430-446` so both frames are dropped without calling any listener or faulting the channel;
- add `onToolRequest` and `onToolStep` to `acpHarness` at `:354-362` and to every other `AcpSessionListener` literal in the file (`:296`, `:320-321`, `:331-332`, `:344-347`, `:518`).

## Out of scope

Calling `run` from `runToolLoop` and deleting `prompt` (subplan 23). Host tags (subplan 24). Removing `acp-end`, deleting `acp-prompt`, and the protocol bump (subplan 25). Specs and docs (subplan 26). No change to the frame shapes or decoders (subplans 15 and 17), the far-side loop (subplans 18-20), or `src/remote/serve-acp-loop.ts`.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Nothing user-visible changes yet: no production caller sends `acp-run` until subplan 23, so there is no manual end-to-end check. Confirm `REMOTE_PROTOCOL_VERSION` stays 39 (`src/remote/protocol.ts:212`), and the three production files stay under 200 effective lines.
