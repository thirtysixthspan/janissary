# Declare remote frame base64 fields once

**Complexity: 5/10** — ~80 added lines across 2 production files, 6 requirements and 9 test scenarios (p=5.257): one exhaustive declaration plus a single-pass encoder, with no wire change.

## Goal

Make the set of base64-encoded fields a single declaration keyed by every remote frame type, so adding a frame with a binary payload cannot skip encoding by leaving a hand-written branch out of `toWire`.

## Approach

Describe each frame's binary fields in a colocated `src/remote/base64-fields.ts` that imports the frame types from `protocol-frames.ts`, keyed by `RemoteFrame['type']` so the compiler requires an entry for a new frame type. A separate module is needed because `protocol-frames.ts` is already close to the 200-line limit and adding the declaration there puts it over. A description names a top-level field and its shape: a single string, an array of strings, or an array of records holding one string field. `toWire` then applies that description in one pass, encoding a field only when it is present, which preserves the conditional cases without special branches. Frames with no binary fields get an empty entry. The wire bytes stay identical.

## Implementation steps

1. Add a `BinaryField` description type and a `BINARY_FIELDS` declaration keyed by every `RemoteFrame['type']` in a new `src/remote/base64-fields.ts`. Give the fourteen frames that carry binary fields their current field names and shapes (`input`/`output` data, `transcript` blocks, `shell-history` runs' text, `acp-run`/`acp-chunk`/`acp-activity` text, `acp-turn` display, `acp-tool-result` output, `acp-tool-request` command, `acp-tool-step` command and result, `gate-event`/`resume-event` capture, `capture-reply` text); give the other thirty-six an empty list so the record stays exhaustive. The module's import of `RemoteFrame` is type-only, so it introduces no runtime cycle.
2. Rewrite `toWire` in `src/remote/protocol.ts` to copy the frame, read its field list from `BINARY_FIELDS[frame.type]` into a local, and loop over it, encoding each declared field only when its value is not undefined. That presence check keeps today's conditional behavior: `acp-turn` only on the end phase, `acp-tool-result` only with `output`, `gate-event` and `resume-event` only with `capture`, and `capture-reply` only with `text`. Leave `encodeText` in `protocol.ts`.
3. Add tests in `src/remote/protocol.test.ts` that pin the encoded wire value for every frame in the declaration from an independent expected table, cover each conditional case with the field absent, and assert the declaration has an entry for every frame type.
4. Run `$janissary/scripts/run.mjs check-diff` after each step and fix any failure before continuing.

## Tests

- In `src/remote/protocol.test.ts`, add one case per frame whose fields appear in the declaration: encode a populated frame and assert each declared field on the wire is the base64 of the original, checking list and nested-record shapes element by element. Keep the expected fields in a separate literal so a missing or wrong production entry fails rather than agreeing with itself.
- Cover the absent-field cases: an `acp-turn` start, `acp-tool-result` without `output`, `gate-event` and `resume-event` without `capture`, `capture-reply` without `text`, plus empty `transcript` blocks and `shell-history` runs.
- Assert the declaration's keys equal the union of `CLIENT_FRAME_TYPES` and `SERVER_FRAME_TYPES`.
- Keep every existing round-trip and control-byte test passing unchanged.

## Out of scope

- Changing the wire format, the encoded bytes, or the protocol version.
- Changing frame decoding or the runtime validation of any frame.
- Adding a new frame type or a new binary field to an existing frame.
- Updating `help/` or user documentation, since no user-visible behavior changes.
