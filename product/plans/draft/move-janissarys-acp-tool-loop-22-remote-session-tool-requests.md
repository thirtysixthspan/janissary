# ACP tool loop 22 — `RemoteAcpSession.run`: caller requests and far-side steps

**Complexity: 4/10** — ~40 added lines across 3 edited files, 5 requirements, 5 scenarios (p=4.93)

Run order: 22 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (the `acp-tool-request` and `acp-tool-step` sentences of the `RemoteAcpSession` paragraph of "Local side"; decisions 3 and 9, local adapter halves). Depends on subplans 15, 17, and 21 (`move-janissarys-acp-tool-loop-15-tool-result-frame.md`, `move-janissarys-acp-tool-loop-17-tool-frames.md`, `move-janissarys-acp-tool-loop-21-remote-session-run.md`). Subplan 23 calls it.

A far-side loop sends two kinds of tool frame. A caller-tool request has to run here and be answered. A far-side step was already completed there and only has to be shown. This subplan completes `RemoteAcpSession.run` by handling both. It runs the request through the `runCaller` the run was given, and turns each frame into the same `startCommand` and `ranCommand` events the in-process driver produces.

## Design decisions

- **Caller requests** (source decision 3). An `acp-tool-request` calls `events.startCommand(command, false)` and awaits `runCaller(command)`.
  - On success it calls `events.ranCommand(command, output, false)` and sends `acp-tool-result { id, request, output }`.
  - A rejected `runCaller` sends `{ id, request, error }` with the error's text and no `ranCommand`. The far side then ends the run with an `acp-error` carrying it.
- **Nothing after cancel or release** (source decision 9). Once the run is cancelled or the session is released, the adapter sends nothing and fires no event for a request still being answered. A question still pending at cancel resolves `Question cancelled.` locally through the prompt's own abort signal, as today, and its result goes nowhere. The far side has already dropped the request (subplan 20).
- **Far-side steps.** An `acp-tool-step` calls `events.startCommand(command, workspace)` and then `events.ranCommand(command, result, workspace, refused)` together.
- **Listener.** `AcpSessionListener` gains `onToolRequest` and `onToolStep`, and `dispatchAcp` routes `acp-tool-request` and `acp-tool-step` to them.
- **Module.** The handling lives in `src/remote/acp-session-run.ts` beside the turn mapping from subplan 21.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Run state and turn mapping | `src/remote/acp-session-run.ts` (subplan 21) |
| Adapter send and listener | `createRemoteAcpSession` in `src/remote/acp-session.ts`; `AcpSessionListener`, `dispatchAcp` in `src/remote/channel/acp.ts` |
| Frames | `acp-tool-result` (subplan 15); `acp-tool-request`, `acp-tool-step` (subplan 17) |

## Proposed changes

- `src/remote/acp-session-run.ts`: answering requests and mapping steps.
- `src/remote/acp-session.ts`: the two listener handlers delegating to it.
- `src/remote/channel/acp.ts`: the two handlers and their `dispatchAcp` cases.

## Tests

`src/remote/acp-session.test.ts`, over a fake channel:
- an `acp-tool-request` calls `startCommand`, runs `runCaller`, calls `ranCommand`, and sends `acp-tool-result` with the output;
- a rejecting `runCaller` sends the error variant with no `ranCommand`;
- a request answered after cancel sends no `acp-tool-result` and fires no event;
- an `acp-tool-step` with `workspace: true` calls both events with it;
- an `acp-tool-step` with `refused: 'disabled'` calls both events with `workspace: false` and the flag.

## Out of scope

Calling `run` from `runToolLoop` (subplan 23). Host tags (subplan 24).

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Nothing user-visible changes yet.
