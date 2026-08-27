# Validate remote frame fields

**Complexity: 6/10** — the decoder is a small pure boundary, but it covers ten frame variants on a security-sensitive SSH transport and must preserve base64 decoding and both dispatch directions.

## Goal

Reject malformed remote protocol frames before either end treats their fields as trusted process, workspace, or routing inputs. Valid frames continue to round-trip without carrying undeclared JSON properties into dispatch.

## Approach

Keep JSON parsing, wire encoding, and the public `decodeFrame` entry point in `src/remote/protocol.ts`. Extract the per-variant runtime guards and normalized frame construction into a focused `src/remote/frame-decode.ts` module so the protocol file stays within the 200-line limit.

The decoder will require non-empty identifiers and operational strings, positive integer terminal dimensions, an integer exit code, valid enum and boolean option values, string arrays for transcript blocks, and a token record containing only known token names with string values. Optional fields remain optional. Each accepted frame is reconstructed from declared fields, which drops unknown properties instead of passing arbitrary JSON through the transport boundary.

## Implementation steps

1. Add `src/remote/frame-decode.ts` with shared primitive guards and exhaustive decoding for every `ClientFrame` and `ServerFrame` variant.
2. Route parsed object records through the new decoder from `src/remote/protocol.ts`, retaining the existing malformed-JSON, non-object, and unknown-type errors.
3. Extend `src/remote/protocol.test.ts` with malformed-field cases across all frame variants and assertions that optional fields remain valid and undeclared fields are removed.
4. Update `product/specs/remote-server.md` to state that malformed frames are rejected before dispatch and identify the field invariants the transport enforces.

## Tests

- Reject each frame variant when a required field is absent or has the wrong type.
- Reject empty process identifiers, non-positive or fractional dimensions, invalid spawn modes and option types, non-integer exit codes, non-string transcript blocks, and malformed or unknown token entries.
- Preserve valid optional fields and all existing client/server round trips.
- Drop undeclared properties from an otherwise valid frame.
- Run `./scripts/run.mjs check-diff` after each implementation, test, spec, and backlog change.

## Out of scope

- Changing the protocol version or any encoded frame shape.
- Adding authentication, reconnect, multiplexing, or a new remote capability.
- Changing how `RemoteServer` or `RemoteChannel` respond after the decoder reports an error.
- Validating shell command syntax or imposing policy on token contents beyond their declared names and string type.
