# ACP tool loop 15 — the `acp-tool-result` frame and unavailable-channel answers

**Complexity: 4/10** — ~25 added lines across 5 edited files, 5 requirements, 8 scenarios (p=5.15)

Run order: 15 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (the `acp-tool-result` bullet of "Wire protocol", and its `src/remote/channel/unavailable.ts` sentence). Depends on subplan 14 (`move-janissarys-acp-tool-loop-14-acp-run-frame.md`). Subplans 18 and 22 receive and send it.

A far-side loop that needs a caller tool asks the local side to run it, and the local side answers with the tool's output or its error. This subplan adds that answer frame to the contract. It also makes an unattached channel answer an `acp-run` the way it answers `acp-prompt` today, so a run started while the channel is down fails at once instead of hanging. Nothing sends either frame yet.

## Design decisions

- **Frame.** `acp-tool-result { id, request, output }` or `{ id, request, error }` answers the caller-tool request numbered `request`. `request` is the per-session integer the far side assigned in `acp-tool-request` (subplan 17).
- **Encoding.** `output` is free text that may hold any byte a tool printed, so it travels base64-encoded through `toWire`. `error` is a one-line message and travels plain, like `acp-error`'s `message`.
- **Validation before dispatch.** The frame needs a non-empty `id`, a non-negative integer `request`, and exactly one of a string `output` or a non-empty string `error`. Anything else is `malformed('acp-tool-result')`.
- **Registries.** `CLIENT_FRAME_TYPES` gains `acp-tool-result`, and `decodeKnownFrame` gains its case.
- **Unavailable channel.** `unavailableSend` in `src/remote/channel/unavailable.ts` changes in two ways:
  - It answers an `acp-run` on an unattached channel the way it answers `acp-prompt` today, with `onError('Remote connection unavailable.', true)` on the session's listener.
  - It drops an `acp-tool-result`, because there is no far side to answer.
- **Version.** `REMOTE_PROTOCOL_VERSION` stays 39; subplan 25 owns the bump.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Client frame union, registry, dispatcher, base64 | `src/remote/protocol-frames.ts`, `src/remote/frame/decode.ts`, `toWire` in `src/remote/protocol.ts` |
| Loop frame decoders | `src/remote/frame/decode-acp-run.ts` (subplan 14) |
| Unavailable-channel answers | `unavailableSend` in `src/remote/channel/unavailable.ts` |

## Proposed changes

- `src/remote/protocol-frames.ts`: the frame type and its registry entry.
- `src/remote/frame/decode-acp-run.ts`: `decodeAcpToolResult`.
- `src/remote/frame/decode.ts`: its case.
- `src/remote/protocol.ts`: base64 for `output` in `toWire`.
- `src/remote/channel/unavailable.ts`: the `acp-run` case and the dropped `acp-tool-result`.

## Tests

- `src/remote/protocol.test.ts`, or the frame decode tests beside it:
  - `acp-tool-result` round-trips with `output`, base64 on the wire, and with `error`;
  - it is malformed with both, with neither, with a negative or fractional `request`, or with an empty `error`.
- `src/remote/channel/index.test.ts`:
  - an `acp-run` sent while the channel is unattached reports `Remote connection unavailable.` as fatal to the session;
  - an `acp-tool-result` is dropped silently.

## Out of scope

The remote-to-local frames (subplans 16 and 17). Sending or receiving `acp-tool-result` (subplans 18 and 22). The version bump (subplan 25).

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Nothing user-visible changes.
