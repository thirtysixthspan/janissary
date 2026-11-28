# Cover MCP cancellation in the exhaustive remote codec fixture

**Complexity: 1/10** — Four round-trip cases with zero production code changes (p=2.95).

## Goal

Exercise the protocol 49 cancellation frame through the same encode and decode table as the rest of the remote protocol. Populate the three previously omitted resume variants so the fixture can satisfy its exhaustive mapped type.

## Requirements

1. “Add a fully populated cancellation frame to `FULLY_POPULATED_FRAMES`.”
2. Provide the already declared resume variants required by the same mapped fixture type.

## Design decisions

- Put each missing fixture beside the related frame it travels with. The populated resume event includes its optional screen capture.
- Exercise all four fixtures through the existing parameterized round-trip assertion.

## Preserved behavior

1. The cancellation frame's call id travels as plain text without an encoded payload. The `round-trips a cancel with its call id plain on the wire` case in `src/remote/protocol.test.ts` checks the exact wire object.
2. Version 49 remains the protocol version. The `is 49` case in `src/remote/protocol.test.ts` catches a version change.

## Assumptions

1. `src/remote/protocol-frames.ts:314` declares `mcp-cancel` with only the required `call` field.

## Existing functionality

1. `src/remote/protocol.test.ts:1099` maps `FULLY_POPULATED_FRAMES` over the remote frame discriminants.
2. `src/remote/protocol.test.ts:1188` runs the round-trip assertion on every value in that table.

## Implementation steps

1. Add the cancellation and resume entries to `FULLY_POPULATED_FRAMES` in `src/remote/protocol.test.ts`. Keep the existing standalone wire, version, and malformed frame assertions. Run `$janissary/scripts/run.mjs check-diff`.
2. Clarify the version-49 cancellation identifier in `product/specs/remote-server.md`. Run `$janissary/scripts/run.mjs check-diff`.

## UI design

1. The wire-level test work has no user interface.

## Tests

1. Run the exhaustive fixture in `src/remote/protocol.test.ts` and confirm it now executes the cancellation entry (requirement 1).
2. Run the same fixture and confirm the three resume entries each round-trip (requirement 2).
3. Run the file's existing admitted-frame, malformed-frame, version and base64 assertions.

## Out of scope

Production protocol behavior and test type errors outside the exhaustive fixture.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Compare the version-49 paragraph in `product/specs/remote-server.md` with the `mcp-cancel` fixture and standalone assertion in `src/remote/protocol.test.ts`. The cancellation record carries the original call id as plain text. Run the codec suite with the verbose reporter and confirm the cancellation and three resume cases appear under “optional frame fields.” A case appearing only under its standalone test would leave the exhaustive fixture incomplete.
