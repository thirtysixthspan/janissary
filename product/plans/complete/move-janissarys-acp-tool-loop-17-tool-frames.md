# ACP tool loop 17 — `acp-tool-request` and `acp-tool-step` frames

**Complexity: 5/10** — ~30 added production lines across 4 edited files, 6 requirements, 24 scenarios, 2 decoder functions (p=5.60)

Run order: 17 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (the `acp-tool-request` and `acp-tool-step` bullets of "Wire protocol" at `:129`–`:130`, and the validation sentence at `:133`). Depends on subplan 16 (`move-janissarys-acp-tool-loop-16-turn-frames.md`), which completed the loop decoders in `src/remote/frame/decode-acp-run.ts`. Subplan 18 builds the far-side sender, subplan 19 wires it, and subplan 22 receives these frames locally.

A far-side loop produces two kinds of tool step. A caller tool such as `db` or `question` has to run on the local side, so the far side sends a request and waits for the answer. A workspace tool such as `file read`, or a gate refusal, the far side completes on its own and only reports. This subplan adds one remote-to-local (`ServerFrame`) frame for each. It is additive, and nothing sends them yet.

## Design decisions

- **`acp-tool-request { id, request, command }`** is a `ServerFrame` (remote → local). It asks the local side to run a caller tool. `id` is the ACP session id every ACP frame carries. `request` is a non-negative integer the far side assigns from the run's counter, scoped by `id`; `acp-tool-result` (subplan 15) echoes it and the local side matches the pair. The local side records and displays that step itself, so the far side sends no `acp-tool-step` for it.
- **`acp-tool-step { id, command, result, workspace, refused? }`** is a `ServerFrame` (remote → local). It reports a step the far side completed on its own: a workspace-tool run (`workspace: true`) or a gate refusal (`workspace: false`). `refused` is present only as exactly `'disabled'`, for a disabled or agent-off refusal; the not-allowed and agent-not-permitted refusals carry `workspace: false` and no `refused`, exactly as `DrivenStep` at `src/acp/drive-loop.ts:25` and `ranCommand` at `src/acp/types.ts:98` model them.
- **An empty `result` is a successful step.** A workspace read of an empty file returns `''`, so a present-but-empty `result` must survive both directions. A refusal's `result` is its refusal text.
- **Encoding.** `command` (both frames) and `result` (step) are free text, so they travel base64-encoded through `toWire`'s `encodeText`, in the branch style `acp-run`'s `text` uses at `src/remote/protocol.ts:244` and `acp-turn`'s `display` at `:245`. Branch on the field being a string, not on truthiness, so an empty `result` is still encoded. Decode with the same `Buffer` base64-to-UTF-8 convention as `decodeAcpText` at `src/remote/frame/decode-acp.ts:55`; do not add stricter base64 checking.
- **Validation before dispatch.** Both frames need a non-empty `id`, checked with `nonEmptyString` and refused with `malformed(...)` from `src/remote/frame/decode-shared.ts`.
  - `acp-tool-request` needs a non-negative integer `request` and a non-empty `command`. Check `request` with the existing `nonNegativeInteger` at `src/remote/frame/decode-shared.ts:24` (added by subplan 15), which rejects negatives, fractions, and non-numbers. A missing, negative, fractional, or non-numeric `request`, an empty or non-string `command`, and a missing or empty `id` are malformed.
  - `acp-tool-step` needs a non-empty `command`, a string `result` (empty allowed), a boolean `workspace`, and `refused` absent or exactly `'disabled'`. `refused` with `workspace: true` is malformed because a refusal never runs; so is `refused` with any other value, a non-boolean `workspace`, a non-string `result`, an empty or non-string `command`, and a missing or empty `id`.
  - Rebuild each decoded frame from its declared fields only, as `decodeAcpRun` does at `src/remote/frame/decode-acp-run.ts:5`, so an undeclared field is dropped rather than forwarded.
  - The decoders are `decodeAcpToolRequest` and `decodeAcpToolStep`, in `src/remote/frame/decode-acp-run.ts` beside `decodeAcpRun` and `decodeAcpTurn`.
- **Registries.** `ServerFrame` gains both members, `SERVER_FRAME_TYPES` gains both types, and `decodeKnownFrame` gains both cases beside `acp-turn` and `acp-run-end`. The registry is keyed by `ServerFrame['type']` and the dispatcher's `never` default at `src/remote/frame/decode.ts:27`, so the union member, registry entry, and switch case must land together or the build fails.
- **Routing stays untouched.** Add no `dispatchAcp` case and no `AcpSessionListener` handler; subplan 22 owns both. Until then an `acp-tool-request` or `acp-tool-step` that reached a live channel would be claimed by neither `dispatchAcp` nor `isChannelFrame`, so `RemoteChannel.dispatch` would call `fail('Unexpected remote frame ...')` at `src/remote/channel/index.ts:233` and close the channel. No frame is emitted before subplan 22: the far-side loop only runs on an `acp-run`, and the first local sender of that frame is subplan 23. Keeping routing out of this subplan is what makes the additive change safe.
- **Version.** `REMOTE_PROTOCOL_VERSION` stays 39; subplan 25 owns the bump.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Server frame union and registry | `ServerFrame`, `SERVER_FRAME_TYPES` in `src/remote/protocol-frames.ts` (160 effective lines; this subplan adds about 8, so keep the ACP members there and do not extract) |
| Loop frame decoders | `decodeAcpRun`, `decodeAcpToolResult`, `decodeAcpTurn`, `decodeAcpRunEnd` in `src/remote/frame/decode-acp-run.ts` (subplans 14–16) |
| Exhaustive dispatcher | `decodeKnownFrame` and its `never` default in `src/remote/frame/decode.ts` |
| Base64 text convention | `encodeText` and `toWire` in `src/remote/protocol.ts`; `decodeAcpText` in `src/remote/frame/decode-acp.ts:55` |
| Validation style and predicates | `malformed`, `nonEmptyString`, `nonNegativeInteger` in `src/remote/frame/decode-shared.ts` |
| Refusal flag semantics | `DrivenStep` at `src/acp/drive-loop.ts:25`; `ranCommand`'s optional `workspace` and `refused` at `src/acp/types.ts:98`–`:105` |
| Exhaustive test fixtures | `FULLY_POPULATED_FRAMES` at `src/remote/protocol.test.ts:683`; `admits exactly the declared server frame types` at `:890` |
| Channel failure on an unclaimed ACP frame | `dispatchAcp` in `src/remote/channel/acp.ts:13`; `RemoteChannel.dispatch` at `src/remote/channel/index.ts:231`–`:233` |

## Proposed changes

- `src/remote/protocol-frames.ts`: the two `ServerFrame` members and their `SERVER_FRAME_TYPES` entries.
- `src/remote/frame/decode-acp-run.ts`: `decodeAcpToolRequest` and `decodeAcpToolStep`.
- `src/remote/frame/decode.ts`: import both from `./decode-acp-run.js` and add the `acp-tool-request` and `acp-tool-step` cases.
- `src/remote/protocol.ts`: the `toWire` branches that base64-encode `command`, and `result` on the step.
- `src/remote/protocol.test.ts`: the two fixtures, the registry expectation, and the codec tests below.

All four production files stay under the 200-effective-line limit: `protocol-frames.ts` is 160 effective lines now and gains about 8, and `decode-acp-run.ts` is 69 and gains about 20, so no extraction is needed. Land the union, registry, decoders, dispatcher cases, `toWire` branches, and test-fixture updates together, so the exhaustive switch and mapped fixture stay green at every commit.

## Tests

`src/remote/protocol.test.ts`, beside `describe('acp-run-end codec')` at `:167`, using `encodeFrame`/`decodeFrame` the way those blocks do. Leave `src/remote/frame/decode-acp-run.test.ts` to the snapshot validator; the frame codecs are tested through `protocol.test.ts` like `acp-run`, `acp-tool-result`, and `acp-turn`.

- `acp-tool-request` round-trips with `request: 0` and a `command` holding a newline and a control byte; its raw wire `command` is base64.
- `acp-tool-request` is malformed with a missing `id`, an empty `id`, a negative, fractional, or non-numeric `request`, and an empty or non-string `command`.
- `acp-tool-step` round-trips a workspace run with `workspace: true` and a multi-line `result`; its raw wire `command` and `result` are base64.
- `acp-tool-step` round-trips an empty `result` with `workspace: true`, and a refusal with `workspace: false` and no `refused`.
- `acp-tool-step` round-trips `refused: 'disabled'` with `workspace: false`, and its wire record keeps the field.
- `acp-tool-step` is malformed with a missing or empty `id`, an empty or non-string `command`, a non-string `result`, a non-boolean `workspace`, a `refused` other than `'disabled'`, and `refused` alongside `workspace: true`.
- Undeclared fields are dropped: a request carrying `workspace` and a step carrying `request` decode to their declared shapes.
- Add `acp-tool-request` (with a multi-line `command` so the fixture round-trip covers base64) and `acp-tool-step` (the `refused: 'disabled'` form, so the fixture covers the optional field) to `FULLY_POPULATED_FRAMES`, and add both names to the sorted server-frame list in `admits exactly the declared server frame types`. Both are compile-time and assertion gates, not optional extras.

## Out of scope

Sending and receiving these frames (subplans 18, 19, and 22). The `dispatchAcp` cases and `AcpSessionListener` handlers (subplan 22). The version bump (subplan 25) and the specs and docs (subplan 26). No unavailable-channel change: both frames travel remote-to-local, so `unavailableSend`, which answers client frames, is untouched.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Confirm `REMOTE_PROTOCOL_VERSION` is still 39, `dispatchAcp` in `src/remote/channel/acp.ts` still has no case for either frame, and no production sender emits either one. Nothing user-visible changes, so there is no manual UI check; do not hand-send one of these to a live channel, because `RemoteChannel.dispatch` would close it as unexpected.
