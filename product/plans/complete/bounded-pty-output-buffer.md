# Bound retained terminal output in the WebSocket client

## Complexity

5/10 — one focused extraction with explicit policy limits, expiration timers, and overflow behavior, plus integration tests through the client; live attached delivery is untouched.

## Goal

The WebSocket client's early-output buffer has no retention policy: every PTY without an attached handler accumulates strings until a renderer attaches or the whole client is disposed. Output received while a terminal surface is absent can grow browser memory indefinitely, and an exited stream that never mounts retains its buffered output for the rest of the session.

## Approach

Extract the buffering policy from `JanusClient` in `web/src/ws.ts` into a focused `web/src/pty-output-buffer.ts` module:

- **Per-stream limit** (`maxStreamBytes`, default 512 KiB): when a stream's retained output exceeds it, the oldest whole chunks are dropped and a visible truncation marker is prepended to what remains.
- **Aggregate limit** (`maxTotalBytes`, default 2 MiB): when total retained output across streams exceeds it, the oldest unclaimed streams are evicted whole.
- **Expiration** (`exitedTtlMs`, default 30 s): a stream marked exited in the `pty-exit` branch that never acquires a renderer is dropped when the grace period lapses — a bounded grace for exit-before-mount rather than deleting output immediately, since `TerminalCard` can render completed terminals and `useXterm` attaches only from an effect.
- **Ordered draining**: `attachPty` replays retained chunks in arrival order, claims the stream (cancelling any expiration timer), and live delivery proceeds unchanged through the handler map.
- **Overflow marker**: the truncation marker is `"\r\n\u001b[0m[earlier output trimmed]\r\n"` — an SGR reset precedes it because chunks are dropped whole and a chunk boundary can split a multi-byte escape sequence; a dangling partial sequence consumes at most the marker's own prefix bytes and the next complete sequence restores rendering.
- **Disposal**: `dispose` releases all retained data and cancels every expiration timer.

`JanusClient` routes the `pty` event's no-handler branch and `attachPty` replay through the buffer, marks streams exited in the `pty-exit` branch, and releases everything in `dispose`. Its constructor gains an optional `PtyOutputBufferOptions` pass-through so tests can use small limits; the default construction is unchanged everywhere.

## Implementation

1. Write `web/src/pty-output-buffer.ts` with the policy class.
2. Rewire `web/src/ws.ts` to route through it (constructor pass-through, `pty` no-handler branch, `pty-exit` marking, `attachPty` drain, `dispose`).
3. Add `web/src/pty-output-buffer.test.ts` with direct policy tests: per-stream trim with marker, aggregate eviction across many ids, oversized single chunk, expiration of an unclaimed exited stream, claim cancelling the timer, and disposal with pending expiration.
4. Extend `web/src/ws.test.ts` with exit-before-attach replay, never-attached expiration, detach followed by output, aggregate pressure across many ids, oversized chunks, and disposal with pending expiration.
5. Run `./scripts/run.mjs check-diff` after each step.

## Tests

The two test files above. `web/src/shared/transcript/TerminalCard.test.tsx` stays as the rendering regression check; the existing `ws.test.ts` replay and disposal assertions keep passing unchanged.

## Out of scope

- Changing live attached delivery or the server's PTY feed.
- Reconstructing full scrollback after eviction (a late-attaching terminal sees the truncation marker, not the dropped bytes).
