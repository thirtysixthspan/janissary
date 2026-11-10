# Enforce the terminate reply byte limit

**Complexity: 2/10** — one production file, four behavioral requirements and four reply scenarios (p=4.08).

## Goal

Prevent a remote peer's terminate reply from exceeding 1024 first-line bytes before it is decoded, forwarded, or acted on.

## Approach

Keep socket data as raw buffers until the first newline is found. Count the exact bytes before that newline, including when the line spans multiple data events, and destroy the socket if the line exceeds the cap. Decode only a bounded first line. Preserve the existing one-line forwarding behavior, shutdown on an accepted reply, refusal forwarding without shutdown, and `ended(false)` for an oversized reply.

## Implementation steps

1. Change the terminate reply handler to enforce the byte cap on the first-line bytes before UTF-8 decoding or forwarding.
2. Add coverage for an oversized complete accepted reply with an extra field and an oversized multibyte partial reply; retain accepted and refused behavior coverage.
3. Update `product/specs/remote-server.md` to describe the cap and its effect on an oversized reply.

## Tests

- A complete oversized accepted `attach-result` with an ignored extra field is dropped without output or shutdown, and the relay ends with `ended(false)`.
- A partial multibyte reply whose encoded first-line bytes exceed 1024 is dropped without output or shutdown, and the relay ends with `ended(false)`.
- A short accepted reply forwards only its first line and sends shutdown.
- A refused reply is forwarded without shutdown.

## Spec

Update `product/specs/remote-server.md` with the 1024-byte first-line limit and the behavior when a reply exceeds it.

## Out of scope

- Changing the remote protocol or its ordinary attach behavior.
- Changing the existing accepted and refused reply behavior.
