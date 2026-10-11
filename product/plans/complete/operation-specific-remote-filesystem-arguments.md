# Operation-Specific Remote Filesystem Arguments

Complexity: 6/10

## Goal

Make each remote filesystem operation constrain its request arguments at compile time while keeping runtime validation at the wire boundary.

## Approach

Define one operation-to-argument mapping and a discriminated request union in the remote protocol frames. Type operation descriptors, port requests, refusal shapes, and server dispatch from that mapping. Preserve dynamic decoding of unknown JSON before it becomes a validated frame.

## Implementation steps

1. Add mapped argument types for all filesystem operations and use them in the filesystem request frame.
2. Parameterize operation descriptors by their operation key so descriptor arguments, path extraction, execution, refusal generation, and result decoding stay operation-specific.
3. Update remote ports and server dispatch helpers to accept each operation's mapped arguments without casts that erase the relationship.
4. Update operation and protocol tests to use the discriminated union and cover valid and malformed requests for representative operation shapes.
5. Update the remote filesystem behavior spec to record the typed operation-to-argument contract without describing implementation details.

## Tests

- In `src/remote/filesystem/operations.test.ts`, retain validation coverage for every operation and use operation-specific argument shapes.
- In `src/remote/protocol.test.ts`, cover representative filesystem request framing and malformed inputs.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Out of scope

- Changing the remote wire format or runtime validation rules.
- Changing remote filesystem behavior, results, or refusal handling.
- Updating user documentation, since no user-visible behavior changes.
