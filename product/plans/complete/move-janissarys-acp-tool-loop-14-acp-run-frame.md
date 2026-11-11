# ACP tool loop 14 — the `acp-run` frame and snapshot validation

**Complexity: 6/10** — ~65 added production lines across 3 edited files, 8 requirements, 24 scenarios, 4 new units (p=5.86)

Run order: 14 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (the `acp-run` bullet of "Wire protocol" and its "every new frame and field is validated … including the snapshot's shape" sentence; decision 4's "the snapshot travels with the prompt"). Depends on subplan 7 (`move-janissarys-acp-tool-loop-7-run-snapshot-and-gate.md`) for `AcpRunSnapshot`. Subplans 15 through 17 add the other loop frames to the module it creates. Subplans 18 and 21 receive and send it.

To run the loop on the far side, the local side has to send a whole run: the prompt text and the per-prompt snapshot that decides the primer and the gate. This subplan adds that frame to the contract, with strict validation of the snapshot. It is additive: `acp-prompt` stays until subplan 25, and nothing sends the new frame yet.

## Design decisions

- **Frame.** `acp-run { id, text, snapshot }` starts one logical prompt's loop on session `id`.
- **Encoding.** `text` is free text, so it travels base64-encoded through `toWire` in `src/remote/protocol.ts`, the way `acp-prompt`'s `text` does today, and decodes back to UTF-8.
- **Validation before dispatch**, in the style of `decodeAcpEnd`. Anything else is the frame's `malformed` result.
  - The frame needs a non-empty `id`, a string `text`, and a snapshot of the right shape.
  - The snapshot's `kind` is `core` or `agent`.
  - A `core` snapshot needs `role` of `ask` or `tell`, a non-empty `roleName`, `grants` as an array of strings, `rows` as an array of `{ name: string, effectiveEnabled: boolean, effectiveAgentAccess: boolean }`, and a boolean `withoutTools`.
  - An `agent` snapshot needs `grants` as an array of strings and a boolean `askUser`.
  - The decoder rebuilds the snapshot from the validated fields only, so an undeclared field never reaches the far-side loop.
  - Reject null, arrays, and scalars wherever a snapshot or row object is required, using `isRecord` from `src/value-guards.ts:11`. Check every grants element and every row field before constructing typed values. Rebuild rows too, so undeclared row properties are dropped alongside undeclared snapshot properties. Empty grant and row arrays are valid; row names are strings, not restricted to today's vocabulary.
  - Match `decodeAcpText` at `src/remote/frame/decode-acp.ts:58`: require a string wire payload and decode it with the existing Buffer base64-to-UTF-8 convention. Empty text remains valid. Do not introduce stricter base64 validation in this work unit.
- **Registries.** `CLIENT_FRAME_TYPES` in `src/remote/protocol-frames.ts` gains `acp-run`, and `decodeKnownFrame` in `src/remote/frame/decode.ts` gains its case. Its exhaustive `never` default makes a missing case a build error.
- **Version.** `REMOTE_PROTOCOL_VERSION` stays 39. Subplan 25 owns the single bump to 40 and its history paragraph, which covers this frame.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Client frame union and registry | `ClientFrame`, `CLIENT_FRAME_TYPES` in `src/remote/protocol-frames.ts` |
| ACP decoders and their style | `decodeAcpOpen`, `decodeAcpText`, `decodeAcpEnd` in `src/remote/frame/decode-acp.ts`; `malformed`, `nonEmptyString` in `src/remote/frame/decode-shared.ts` |
| Dispatcher | `decodeKnownFrame` in `src/remote/frame/decode.ts` |
| Base64 text encoding | `toWire`, `encodeText` in `src/remote/protocol.ts` |

## Proposed changes

- `src/remote/protocol-frames.ts`: the `acp-run` frame type, importing `AcpRunSnapshot` as a type, and its registry entry.
- New `src/remote/frame/decode-acp-run.ts`: `decodeAcpRun` and the snapshot validator. They get a module of their own because snapshot validation is more than `decode-acp.ts` should hold beside its existing decoders, and subplans 15 through 17 add the rest of the loop frames here.
- `src/remote/frame/decode.ts`: the `acp-run` case.
- `src/remote/protocol.ts`: base64 for `acp-run.text` in `toWire`.
- `src/remote/protocol.test.ts`: add the frame to the exhaustive `FULLY_POPULATED_FRAMES` fixture at `:511` and the literal client-type expectation at `:707`, as well as the cases below. The fixture's mapped type demands an entry for every union member. Keep the existing version-39 assertion unchanged.

No runtime receiver or unavailable-channel handling changes here: `src/remote/serve.ts:118` has a non-exhaustive switch with an unexpected-frame default, and no sender uses `acp-run` yet. Those integration changes remain in their later work units. The three existing production files remain below 200 effective lines; the new decoder holds only snapshot validation and this frame in this work unit.

## Tests

`src/remote/protocol.test.ts`:
- `acp-run` round-trips through encode and decode with both snapshot kinds, and with text holding a newline and a control byte;
- each of these is malformed:
  - a missing `id`;
  - a non-string `text`;
  - an unknown `kind`;
  - a `core` snapshot with a bad `role`, a non-array `grants`, a row missing `effectiveAgentAccess`, or a non-boolean `withoutTools`;
  - an `agent` snapshot without `askUser`;
- an undeclared snapshot field is dropped.
- Reject a null snapshot, an array snapshot, a numeric grants element, non-array rows, null rows, numeric row names, non-boolean `effectiveEnabled`, an empty core role name, and a non-boolean agent `askUser`. Check unknown fields are dropped from rows too. Accept empty grant/row arrays and empty prompt text. Keep these as focused table-driven cases in the existing protocol tests, using raw JSON for malformed wire input and `encodeFrame`/`decodeFrame` for round trips.

## Out of scope

The other loop frames (subplans 15 through 17). Sending or handling `acp-run` (subplans 19 and 21). Removing `acp-prompt` and the version bump (subplan 25).

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Confirm the new frame appears in the union, admission registry, exhaustive codec dispatch, encoding branch, and complete test fixture; confirm no production sender emits it yet and protocol version remains 39. Nothing user-visible changes, so this contract-only work unit requires no new browser interaction.
