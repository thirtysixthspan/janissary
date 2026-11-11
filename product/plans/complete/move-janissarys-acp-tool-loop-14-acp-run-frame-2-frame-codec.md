# ACP tool loop 14.2 — admit and encode the acp-run frame

**Complexity: 5/10** — ~18 added production lines across 4 edited files, 5 requirements, 27 scenarios, 1 new function (p=5.42)

Run order: piece 2 of 2 of subplan 14 of 27. Source: `product/plans/complete/move-janissarys-acp-tool-loop-14-acp-run-frame.md`. Canonical feature: `product/plans/complete/move-janissarys-acp-tool-loop.md`. Depends on piece 1, `move-janissarys-acp-tool-loop-14-acp-run-frame-1-snapshot-decoder.md`, which validates and rebuilds snapshots. Original subplans 15–17 extend the decoder module; 19 and 21 integrate runtime handling and sending.

## Goal

Add the complete additive `acp-run` wire contract with prompt text and a strictly validated snapshot, without sending it yet.

## Design decisions

- Add client frame `acp-run` carrying `id`, `text` and `AcpRunSnapshot`. Import the shared snapshot as a type; do not duplicate its shape.
- `decodeAcpRun` in `src/remote/frame/decode-acp-run.ts` requires nonempty string `id`, string wire `text`, and a successful `decodeAcpRunSnapshot`. Any invalid field returns `malformed('acp-run')`; rebuild the top-level frame from declared fields only.
- Encode text through the existing `encodeText` branch in `toWire`, and decode through the same Buffer base64-to-UTF-8 convention as `decodeAcpText`. Empty text is valid. Do not introduce stricter base64 checking.
- Admit through `CLIENT_FRAME_TYPES` and dispatch through `decodeKnownFrame`'s exhaustive switch together with the union change. Extend the exhaustive codec fixture and client registry expectation in the same implementation step.
- Keep `acp-prompt` and protocol version 39. No runtime sender or receiver changes: later work units own those integrations.
- Import `DecodeResult` and `malformed` directly from `src/remote/frame/decode-shared.ts`, extending the existing `nonEmptyString` import; do not add a second snapshot validator or re-export the snapshot contract. Keep the decoder's returned snapshot exactly as `decodeAcpRunSnapshot` rebuilt it.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Validated snapshot | `src/remote/frame/decode-acp-run.ts`, `decodeAcpRunSnapshot` from piece 1 |
| Frame union and admission | `src/remote/protocol-frames.ts`, `ClientFrame` and `CLIENT_FRAME_TYPES` |
| Exhaustive dispatch | `src/remote/frame/decode.ts`, `decodeKnownFrame` |
| Text encoding and validation convention | `src/remote/protocol.ts`, `toWire` and `encodeText`; `src/remote/frame/decode-acp.ts`, `decodeAcpText` |

## Proposed changes

- `src/remote/protocol-frames.ts`: type-only snapshot import, union member, admission registry entry.
- `src/remote/frame/decode-acp-run.ts`: add exported `decodeAcpRun`, reusing piece 1's validation unchanged.
- `src/remote/frame/decode.ts`: import the decoder and add its case.
- `src/remote/protocol.ts`: include `acp-run` in the base64 text encoding branch.
- `src/remote/protocol.test.ts`: add the fully populated frame to `FULLY_POPULATED_FRAMES` and the client registry expectation, plus codec tests below. Retain version-39 assertion. All touched production modules stay below 200 effective lines.

## Tests

Round-trip core and agent snapshots; round-trip newline/control-byte text; accept empty text with empty grants/rows; reject missing id, empty id and non-string id; reject non-string text; reject invalid snapshot; drop undeclared top-level, snapshot and row properties. Use `decodeFrame(JSON.stringify(rawFrame))` for malformed cases, because `encodeFrame` accepts only a typed valid frame. The invalid-snapshot table exercises unknown kind, bad role, bad grants array/element, bad rows/row fields, bad withoutTools, empty roleName and bad askUser through raw JSON, proving the frame delegates to piece 1 and produces the frame-specific malformed result. Count the individual table variants when rating this work. Existing exhaustive fixtures cover admission and optional-field preservation.

## Out of scope

Changing snapshot validation from piece 1, runtime sending/receiving and unavailable-channel behavior (original subplans 19 and 21), other loop frames (15–17), removal of `acp-prompt` and version bump/history (25). No user-facing spec or browser change in this additive contract step.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Confirm frame coverage in union, registry, exhaustive dispatch, encoding and complete fixtures. Search for production sends and confirm none emit `acp-run` yet. Confirm protocol version stays 39 and old frames remain. No new browser interaction is required.
