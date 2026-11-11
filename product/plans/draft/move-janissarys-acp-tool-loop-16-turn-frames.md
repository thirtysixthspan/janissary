# ACP tool loop 16 — `acp-turn` and `acp-run-end` frames

**Complexity: 5/10** — ~30 added lines across 4 edited files, 6 requirements, 9 scenarios (p=5.26)

Run order: 16 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (the `acp-turn`, `acp-chunk`, and `acp-run-end` bullets of "Wire protocol" and its validation sentence). Depends on subplans 10 and 14 (`move-janissarys-acp-tool-loop-10-loop-driver-module.md` for `CORE_MAX_STEPS`, `move-janissarys-acp-tool-loop-14-acp-run-frame.md` for the decode module). Subplans 18 and 21 send and receive them.

The local handlers need to know when a far-side turn starts and ends and how the whole run ended, so they can open and close transcript entries and settle the prompt. This subplan adds those remote-to-local frames to the contract. It is additive: `acp-end` stays until subplan 25, and nothing sends the new frames yet.

## Design decisions

- **Frames.**
  - `acp-turn { id, phase: 'start', first }` and `{ id, phase: 'end', display }`. `first` is true only for the opening turn. `display` is the turn's final text with the extracted command line removed, exactly what `runAcpToolLoop` hands `endTurn`.
  - `acp-chunk` is unchanged and still carries a delta.
  - `acp-run-end { id, reason }`, with `reason` one of `answered`, `capped`, or `cancelled`, is the run's terminal frame and replaces `acp-end` from subplan 25 on.
- **No step count.** Only a `core` run can be capped, and its cap is `CORE_MAX_STEPS` from `drive-loop.ts`, which both sides import.
- **Terminals.** A non-fatal `acp-error` remains the run's other terminal, and a fatal one still closes the session.
- **Encoding.** `display` is free text, so it travels base64-encoded through `toWire`, the way `acp-chunk`'s `text` does.
- **Validation before dispatch**, in the style of `decodeAcpEnd`. Both frames need a non-empty `id`.
  - `acp-turn` needs `phase` of `start` with a boolean `first`, or `end` with a string `display`. An empty display is ordinary.
  - `acp-run-end` needs one of the three reasons.
- **Registries.** `SERVER_FRAME_TYPES` gains both types, and `decodeKnownFrame` gains their cases.
- **Routing.** `dispatchAcp` in `src/remote/channel/acp.ts` is untouched here. A new frame arriving before subplan 21 wires its handler falls through as unhandled, and none is sent before then.
- **Version.** `REMOTE_PROTOCOL_VERSION` stays 39; subplan 25 owns the bump.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Server frame union and registry | `ServerFrame`, `SERVER_FRAME_TYPES` in `src/remote/protocol-frames.ts` (152 effective lines; if the loop frames push it past 200, move the ACP frame members into a new `protocol-frames-acp.ts` that the unions import) |
| Loop frame decoders | `src/remote/frame/decode-acp-run.ts` (subplan 14) |
| Dispatcher and base64 | `decodeKnownFrame` in `src/remote/frame/decode.ts`; `toWire` in `src/remote/protocol.ts` |

## Proposed changes

- `src/remote/protocol-frames.ts`: the two frame types and their registry entries.
- `src/remote/frame/decode-acp-run.ts`: their decoders.
- `src/remote/frame/decode.ts`: their cases.
- `src/remote/protocol.ts`: base64 for `display` in `toWire`.

## Tests

`src/remote/protocol.test.ts`, or the frame decode tests beside it:
- both phases of `acp-turn` round-trip, with a display holding a newline and a control byte;
- `acp-turn` is malformed with an unknown phase, a `start` without `first`, or an `end` without `display`;
- each `acp-run-end` reason round-trips, and an unknown reason is malformed.

## Out of scope

The tool frames (subplan 17). Sending and receiving these frames (subplans 18 and 21). Removing `acp-end` and the version bump (subplan 25).

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Nothing user-visible changes.
