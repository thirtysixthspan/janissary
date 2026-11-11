# ACP tool loop 17 — `acp-tool-request` and `acp-tool-step` frames

**Complexity: 4/10** — ~30 added lines across 4 edited files, 5 requirements, 7 scenarios (p=5.07)

Run order: 17 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (the `acp-tool-request` and `acp-tool-step` bullets of "Wire protocol" and its validation sentence). Depends on subplan 16 (`move-janissarys-acp-tool-loop-16-turn-frames.md`). Subplans 18 and 22 send and receive them.

A far-side loop produces two kinds of tool step. A caller tool such as `db` or `question` has to run on the local side. A workspace tool such as `file read`, or a gate refusal, the far side completes on its own and only reports. This subplan adds one frame for each. It is additive, and nothing sends them yet.

## Design decisions

- **`acp-tool-request { id, request, command }`** asks the local side to run a caller tool. `request` is a per-session non-negative integer the far side assigns, and `acp-tool-result` (subplan 15) echoes it. The local side records and displays that step itself, so the far side sends no `acp-tool-step` for it.
- **`acp-tool-step { id, command, result, workspace, refused? }`** reports a step the far side completed on its own: a workspace-tool run (`workspace: true`) or a gate refusal (`workspace: false`, with `refused: 'disabled'` for a disabled or agent-off refusal).
- **Encoding.** `command` and `result` are free text, so they travel base64-encoded through `toWire`.
- **Validation before dispatch.** Both frames need a non-empty `id`.
  - `acp-tool-request` needs a non-negative integer `request` and a non-empty `command`.
  - `acp-tool-step` needs a non-empty `command`, a string `result`, a boolean `workspace`, and `refused` absent or exactly `'disabled'`.
  - `refused` with `workspace: true` is malformed, because a refusal never runs.
- **Registries.** `SERVER_FRAME_TYPES` gains both types, and `decodeKnownFrame` gains their cases.
- **Version.** `REMOTE_PROTOCOL_VERSION` stays 39; subplan 25 owns the bump.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Server frame union and registry | `ServerFrame`, `SERVER_FRAME_TYPES` in `src/remote/protocol-frames.ts` |
| Loop frame decoders | `src/remote/frame/decode-acp-run.ts` (subplans 14 to 16) |
| Dispatcher and base64 | `decodeKnownFrame` in `src/remote/frame/decode.ts`; `toWire` in `src/remote/protocol.ts` |

## Proposed changes

- `src/remote/protocol-frames.ts`: the two frame types and their registry entries.
- `src/remote/frame/decode-acp-run.ts`: their decoders.
- `src/remote/frame/decode.ts`: their cases.
- `src/remote/protocol.ts`: base64 for `command` and `result` in `toWire`.

## Tests

`src/remote/protocol.test.ts`, or the frame decode tests beside it:
- both frames round-trip, with free text holding a newline and a control byte;
- `acp-tool-request` is malformed with a negative or fractional `request` or an empty `command`;
- `acp-tool-step` is malformed with a non-boolean `workspace`, with a `refused` other than `'disabled'`, or with `refused` alongside `workspace: true`.

## Out of scope

Sending and receiving these frames (subplans 18 and 22). The version bump (subplan 25).

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Nothing user-visible changes.
