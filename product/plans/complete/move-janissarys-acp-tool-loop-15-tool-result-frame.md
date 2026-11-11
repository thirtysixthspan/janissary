# ACP tool loop 15 — the `acp-tool-result` frame and unavailable-channel answers

**Complexity: 5/10** — ~18 added production lines across 6 files, 6 requirements, 16 scenarios (p=5.51)

Run order: 15 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (the `acp-tool-result` bullet of "Wire protocol", and its `src/remote/channel/unavailable.ts` sentence). Depends on subplan 14 (`move-janissarys-acp-tool-loop-14-acp-run-frame.md`). Subplan 18's far-side module receives it, subplan 19 routes it on the far side, and subplan 22 sends it. Land this before subplans 16 and 17, which extend the same decoder module.

A far-side loop that needs a caller tool asks the local side to run it, and the local side answers with the tool's output or its error. This subplan adds that answer frame to the contract. It also makes an unattached channel answer an `acp-run` the way it answers `acp-prompt` today, so a run started while the channel is down fails at once instead of hanging. Nothing sends `acp-tool-result` yet, and no production code sends `acp-run` until subplan 21.

## Design decisions

- **Frame.** `acp-tool-result` is a `ClientFrame` (local → remote), the answer to subplan 17's `acp-tool-request` (remote → local). It carries `id`, `request`, and exactly one of `output` or `error`; `request` is the per-session integer the far side assigned in `acp-tool-request`. Model the frame as one member with optional `output` and `error`, the way `filesystem-reply` carries its mutually exclusive `result` and `error` at `src/remote/protocol-frames.ts:248`, and let the decoder enforce exactly one.
- **Encoding.** `output` is free text that may hold any byte a tool printed, so it travels base64-encoded through `toWire`'s `encodeText`, and decodes with the base64-to-UTF-8 convention `decodeAcpText` uses at `src/remote/frame/decode-acp.ts:55`. An empty `output` is a real answer (a tool that printed nothing) and must survive both directions, so the `toWire` branch and the decoder test whether the field is present, not whether it is truthy. `error` is a one-line message and travels plain, like `acp-error`'s `message`.
- **Validation before dispatch.** The frame needs a non-empty `id`, a non-negative integer `request`, and exactly one of a string `output` or a non-empty string `error`. A present `output` may be empty; `error` may not. Both fields present — even when the `output` is empty — or neither is malformed, as are a non-string `output`, an empty `id`, and a negative, fractional, or non-numeric `request`. Validate `request` with a new `nonNegativeInteger` predicate beside `positiveInteger` at `src/remote/frame/decode-shared.ts:20`: `positiveInteger` rejects 0, and subplan 17 needs the same non-negative check for `acp-tool-request`. Anything else is `malformed('acp-tool-result')`. Rebuild the decoded frame from `id`, `request`, and the chosen variant only, so an undeclared field never reaches the far side.
- **Registries.** `ClientFrame` gains the member, `CLIENT_FRAME_TYPES` gains `acp-tool-result`, and `decodeKnownFrame` gains its case. The exhaustive `never` default at `src/remote/frame/decode.ts:27` and the mapped `FULLY_POPULATED_FRAMES` fixture at `src/remote/protocol.test.ts:572` both turn a missing entry into a build error.
- **Unavailable channel.** `unavailableSend` in `src/remote/channel/unavailable.ts` changes in one way: `acp-run` joins the existing `case 'acp-open': case 'acp-prompt':` arm at `:19`, so it calls `sessions.get(frame.id)?.onError('Remote connection unavailable.', true)`. `acp-tool-result` needs no case: the `default` branch at `:29` already drops every unhandled client frame, which is the intended behavior because there is no far side to answer. Keep it that way and pin it with a test.
- **Version.** `REMOTE_PROTOCOL_VERSION` stays 39; subplan 25 owns the bump.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Client frame union, registry, dispatcher | `ClientFrame`, `CLIENT_FRAME_TYPES` in `src/remote/protocol-frames.ts`; `decodeKnownFrame` in `src/remote/frame/decode.ts` |
| Base64 text convention | `encodeText` and `toWire` in `src/remote/protocol.ts`; `decodeAcpText` in `src/remote/frame/decode-acp.ts` |
| Loop frame decoders | `src/remote/frame/decode-acp-run.ts` (subplan 14) |
| Integer predicate style | `positiveInteger` in `src/remote/frame/decode-shared.ts:20` |
| Mutually exclusive reply fields | `filesystem-reply` in `src/remote/protocol-frames.ts:248` |
| Unavailable-channel answers | `unavailableSend` in `src/remote/channel/unavailable.ts` |

## Proposed changes

- `src/remote/protocol-frames.ts`: the `ClientFrame` member with optional `output` and `error`, and its `CLIENT_FRAME_TYPES` entry.
- `src/remote/frame/decode-shared.ts`: `nonNegativeInteger` beside `positiveInteger`.
- `src/remote/frame/decode-acp-run.ts`: `decodeAcpToolResult`.
- `src/remote/frame/decode.ts`: import `decodeAcpToolResult` from `./decode-acp-run.js` and add the `acp-tool-result` case.
- `src/remote/protocol.ts`: the `toWire` branch that base64-encodes `output` when it is present.
- `src/remote/channel/unavailable.ts`: add `acp-run` to the existing `acp-open`/`acp-prompt` arm. Add no `acp-tool-result` case.

All six production files stay well under the 200-effective-line limit; the largest, `protocol-frames.ts`, is about 155 effective lines before this two-line addition, so no extraction is needed. Land the union, registry, decoder, dispatcher case, `toWire` branch, and test-fixture updates together, so the exhaustive switch and the mapped fixture stay green at every commit; the channel change can land with them.

## Tests

`src/remote/protocol.test.ts`:
- Add an `acp-tool-result` entry to `FULLY_POPULATED_FRAMES` in the output form, with `request: 0`, and add `acp-tool-result` to the sorted literal in `admits exactly the declared client frame types`. Both are required by compile-time and assertion gates, not optional extras.
- Add a sibling `describe('acp-tool-result codec')` beside `acp-run codec` at `:12`, using `encodeFrame`/`decodeFrame` the way that block does:
  - the output form, with `request: 0`, round-trips text holding a newline and a control byte, and the raw wire `output` is base64, asserted the way `acp-run codec` asserts `text`;
  - the error form round-trips with its message plain and unchanged on the wire;
  - an empty `output` round-trips;
  - `decodeFrame` of raw JSON returns `{ error: 'Malformed remote frame "acp-tool-result".' }` for both fields (including an empty `output` beside a non-empty `error`), neither field, a missing or empty `id`, a non-string `output`, an empty `error`, and a negative, fractional, or non-numeric `request`;
  - undeclared fields are dropped.

Leave `decode-acp-run.test.ts` to the snapshot validator; the frame codec is tested through `protocol.test.ts` like `acp-run`.

`src/remote/channel/index.test.ts`:
- In `describe('RemoteChannel — ACP session routing')`, beside `fails an unavailable cancel only on its addressed session` at `:314`, over the authenticating `harness()`:
  - an `acp-run` with a minimal valid `agent` snapshot reaches only the addressed session's listener as `onError('Remote connection unavailable.', true)`, and `written` stays empty;
  - an `acp-tool-result` writes nothing, calls no listener, and reports no channel error.

## Out of scope

The remote-to-local loop frames (subplans 16 and 17). The far side's receive path (subplans 18 and 19, including the `RemoteServer.dispatch` case that would otherwise refuse an `acp-tool-result` as unexpected) and the local sender (subplan 22). The version bump (subplan 25) and the specs and docs pages (subplan 26).

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Confirm `REMOTE_PROTOCOL_VERSION` is still 39, no production sender emits `acp-tool-result`, and `src/remote/serve.ts` has no `acp-tool-result` case yet. Nothing user-visible changes, so there is no manual UI check; the channel test exercises the only runtime path this subplan adds, `RemoteChannel.send` on an unattached channel.
