# ACP tool loop 16 — `acp-turn` and `acp-run-end` frames

**Complexity: 5/10** — ~28 added production lines across 4 edited files, 6 requirements, 21 scenarios, 2 new decoder functions (p=5.54)

Run order: 16 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (the `acp-turn`, `acp-chunk`, and `acp-run-end` bullets of "Wire protocol" at `:127`–`:131` and the validation sentence at `:133`). Depends on subplan 10 (`move-janissarys-acp-tool-loop-10-loop-driver-module.md` for `CORE_MAX_STEPS`) and subplans 14–15 (`move-janissarys-acp-tool-loop-14-acp-run-frame.md` and `move-janissarys-acp-tool-loop-15-tool-result-frame.md`, which created `src/remote/frame/decode-acp-run.ts` and added `decodeAcpRun` and `decodeAcpToolResult`). Subplan 18 builds the far-side sender, subplan 21 wires the local handlers, and subplan 23 is the first to send an `acp-run` that carries either frame.

The local handlers need to know when a far-side turn starts and ends and how the whole run ended, so they can open and close transcript entries and settle the prompt. This subplan adds those remote-to-local frames to the contract. It is additive: `acp-end` stays until subplan 25, and nothing sends the new frames yet.

## Design decisions

- **Turn frames.** `acp-turn` is one server frame with two phase-specific members, discriminated on the literal `phase`:
  - `{ id, phase: 'start', first }`, where `first` is a boolean, true only for the opening turn of a run.
  - `{ id, phase: 'end', display }`, where `display` is the turn's final text with the extracted command line removed — exactly what `runAcpToolLoop` hands `endTurn` at `src/acp/loop.ts:49`, from `filterCommandFromDisplay` at `src/acp/loop.ts:81`. It is authoritative and cannot be rebuilt by stripping the command from accumulated `acp-chunk` text, because chunks carry provider deltas and the removal happens once per turn. An empty `display` is ordinary: a reply that was only a command produces one (`src/acp/loop.test.ts:129`).
  - `acp-chunk` is unchanged and still carries a delta.
- **Run terminal.** `acp-run-end { id, reason }`, with `reason` one of `answered`, `capped`, or `cancelled`, is the run's terminal frame and replaces `acp-end` from subplan 25 on. `answered` and `capped` are exactly `AcpLoopHandlers.finished`'s reason union at `src/acp/types.ts:107`; `cancelled` comes from the far side's cancellation path (subplan 20). A non-fatal `acp-error` remains the run's other terminal, and a fatal one still closes the session.
- **No step count.** Only a `core` run can be capped, because `driveToolLoop` passes `CORE_MAX_STEPS` for `core` and `Infinity` for `agent` at `src/acp/drive-loop.ts:70`; the cap is `CORE_MAX_STEPS` at `src/acp/drive-loop.ts:23`, which both sides import. A number on the wire would only duplicate it.
- **Encoding.** `display` is free text, so only the `end` phase travels base64-encoded through `toWire`, mirroring the `acp-run` text branch at `src/remote/protocol.ts:244` and using its `encodeText` helper. A `start` record is passed through unchanged and carries no `display`. Decode with the same `Buffer` base64-to-UTF-8 convention as `decodeAcpText` at `src/remote/frame/decode-acp.ts:55`; do not add stricter base64 checking. An empty `display` encodes and decodes as an empty string.
- **Validation before dispatch.** Both frames need a non-empty `id`, checked with `nonEmptyString` and refused with `malformed(...)` from `src/remote/frame/decode-shared.ts`, in the style of `decodeAcpEnd` at `src/remote/frame/decode-acp.ts:68`.
  - `acp-turn` needs `phase` to be exactly `'start'` with a boolean `first`, or exactly `'end'` with a string `display`. A missing or unknown `phase`, a non-boolean `first`, and a non-string `display` are malformed. Rebuild the decoded frame from the declared fields of that phase only, as `decodeAcpRun` does: a `display` on a `start` record or a `first` on an `end` record is dropped, not an error.
  - `acp-run-end` needs `reason` to be exactly one of the three literals. A missing, non-string, or unknown reason is malformed.
  - The decoders live in `src/remote/frame/decode-acp-run.ts`, beside `decodeAcpRun` and `decodeAcpToolResult`. The source plan names `decode-acp.ts`, but subplans 14–15 established the loop family in its own module; follow the series, not the stale path.
- **Registries.** `SERVER_FRAME_TYPES` gains both types and `decodeKnownFrame` gains their cases. `SERVER_FRAME_TYPES` is keyed by `ServerFrame['type']` and the dispatcher's `never` default at `src/remote/frame/decode.ts:27`, so the union member, registry entry, and switch case must land together or the build fails.
- **Test fixtures are part of the change.** The mapped `FULLY_POPULATED_FRAMES` fixture at `src/remote/protocol.test.ts:618` and the sorted `SERVER_FRAME_TYPES` expectation in `admits exactly the declared server frame types` at `src/remote/protocol.test.ts:824` both fail when a server frame is added without them. Update them in the same commit.
- **Routing.** `dispatchAcp` in `src/remote/channel/acp.ts` is untouched here. An unhandled ACP frame makes `RemoteChannel.dispatch` reach `this.fail(...)` at `src/remote/channel/index.ts:233`, which closes the channel, so nothing may send these frames until subplan 21 adds their listener handlers. Nothing does: the first `acp-run` is sent by subplan 23, and `REMOTE_PROTOCOL_VERSION` stays 39, so a peer cannot be the sender either.
- **Version.** `REMOTE_PROTOCOL_VERSION` stays 39; subplan 25 owns the bump.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Server frame union and registry | `ServerFrame`, `SERVER_FRAME_TYPES` in `src/remote/protocol-frames.ts` (156 effective lines; this subplan adds about 8, so keep the ACP members there and do not extract a `protocol-frames-acp.ts`) |
| Loop frame decoders | `decodeAcpRun`, `decodeAcpToolResult` in `src/remote/frame/decode-acp-run.ts` (subplans 14–15) |
| Exhaustive dispatcher | `decodeKnownFrame` and its `never` default in `src/remote/frame/decode.ts` |
| Base64 text convention | `encodeText`, `toWire` in `src/remote/protocol.ts`; `decodeAcpText` in `src/remote/frame/decode-acp.ts` |
| Validation style | `decodeAcpEnd` at `src/remote/frame/decode-acp.ts:68`; `malformed`, `nonEmptyString` in `src/remote/frame/decode-shared.ts` |
| Turn and terminal semantics | `AcpLoopHandlers.startTurn`, `chunk`, `endTurn`, `finished` in `src/acp/types.ts:88`–`:107`; `CORE_MAX_STEPS` at `src/acp/drive-loop.ts:23` |
| Exhaustive fixtures and registry expectations | `FULLY_POPULATED_FRAMES` at `src/remote/protocol.test.ts:618`; `admits exactly the declared server frame types` at `:824` |

## Proposed changes

- `src/remote/protocol-frames.ts`: the two `ServerFrame` members and their `SERVER_FRAME_TYPES` entries.
- `src/remote/frame/decode-acp-run.ts`: `decodeAcpTurn` and `decodeAcpRunEnd`.
- `src/remote/frame/decode.ts`: import both from `./decode-acp-run.js` and add the `acp-turn` and `acp-run-end` cases.
- `src/remote/protocol.ts`: encode the end-phase `display` in `toWire`.
- `src/remote/protocol.test.ts`: the two fixtures, the registry expectation, and the codec tests below.

## Tests

`src/remote/protocol.test.ts`, beside `describe('acp-tool-result codec')` at `:73`, using `encodeFrame`/`decodeFrame` the way that block does. Leave `src/remote/frame/decode-acp-run.test.ts` to the snapshot validator; the frame codec is tested through `protocol.test.ts` like `acp-run` and `acp-tool-result`.

- `acp-turn start` round-trips with `first: true` and with `first: false`, and its wire record carries no `display`.
- `acp-turn end` round-trips a display holding a newline and a control byte, and its raw wire `display` is base64; an empty display round-trips; its wire record carries no `first`.
- `decodeFrame` of raw JSON returns `{ error: 'Malformed remote frame "acp-turn".' }` for an unknown phase, a missing phase, a `start` without `first`, a `start` with a non-boolean `first`, an `end` without `display`, an `end` with a non-string `display`, a missing `id`, and an empty `id`.
- Undeclared fields are dropped: a `start` carrying a `display` and an `end` carrying a `first` decode to the declared shape.
- Each of `answered`, `capped`, and `cancelled` round-trips in `acp-run-end`, and an unknown reason, a missing reason, a missing `id`, and an empty `id` are malformed with `{ error: 'Malformed remote frame "acp-run-end".' }`.
- Add `acp-turn` (the `end` phase, so the fixture round-trip covers base64) and `acp-run-end` to `FULLY_POPULATED_FRAMES`, and add both names to the sorted server-frame list in `admits exactly the declared server frame types`. Both are compile-time and assertion gates, not optional extras.

## Out of scope

The tool frames (subplan 17). Sending and receiving these frames (subplan 18 builds the sender; subplans 19 and 21 wire it; subplan 23 turns it on). Removing `acp-end` and the version bump (subplan 25). The specs and docs (subplan 26). No unavailable-channel change: both frames travel remote-to-local.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Confirm `REMOTE_PROTOCOL_VERSION` is still 39, `dispatchAcp` in `src/remote/channel/acp.ts` still has no case for either frame, and no production sender emits `acp-turn` or `acp-run-end` yet. Nothing user-visible changes, so there is no manual UI check.
