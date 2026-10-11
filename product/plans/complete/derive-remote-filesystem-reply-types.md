# Derive remote filesystem reply types from operation decoders

**Complexity: 8/10** — the result contract spans every filesystem operation, the server descriptor table, and the client request and refusal paths. Proceeding under the user's complexity override.

## Goal

Tie each remote filesystem operation to the result it actually returns, so server output, ordinary replies, and refusal values share a decoded operation-specific type instead of meeting at caller-supplied generic casts.

## Approach

Add focused result decoders for every remote filesystem operation. Add each decoder to its operation descriptor, derive the result type by operation key from the descriptor table, and use that mapping in the remote port request API. Decode both received replies and synthesized refusal values before resolving callers.

## Implementation steps

1. Add a focused result-decoder module with runtime validation for every operation result, and make the operation descriptor's `run` result agree with its result decoder.
2. Derive a keyed operation-result type from the descriptor table and use it in `RemoteRequest`, `RemoteFileSystemPort.request`, and `unavailableResult`, removing caller-supplied result casts.
3. Add coverage for valid result decoding across every operation and malformed reply rejection; preserve the existing local-versus-remote refusal contract.
4. Update the remote filesystem behavior spec if it describes reply validation or refusal outcomes.

## Completion

Implemented operation-specific result decoders for all nineteen operations and derived each remote
request's result type from its operation. Normal replies and synthesized refusal values both pass
through the decoder. Added table-wide valid and malformed result coverage and documented malformed
reply handling in the remote server spec. `./scripts/run.mjs check-diff` passes.

## Tests

- Decode a representative valid result for every remote filesystem operation.
- Reject a malformed result for each distinct result shape and malformed reply data before it reaches a port caller.
- Verify synthesized refusal values still satisfy the operation's result decoder and match the local file navigator contract.
- Run `./scripts/run.mjs check-diff` after each implementation and test step.

## Out of scope

- Changing operation arguments, filesystem behavior, path mapping, or refusal wording.
- Changing the remote frame format or adding protocol version negotiation.
