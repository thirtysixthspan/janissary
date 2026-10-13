# Bound editor save and draft RPC waits

## Complexity

6/10. The shared RPC exchange gains an optional timer, while only editor saves and draft-sync opt into it. Existing save coordination and draft retry policies define the failure behavior.

## Goal

An open but silent WebSocket cannot leave editor saves or draft synchronization waiting forever. Timed-out saves preserve the buffer and report an unknown outcome rather than assuming the write failed or replaying it.

## Approach

Allow `RpcExchange.request` to accept an optional deadline, store its timer with the pending callback, and clear it on every settlement and drain path. Forward the option through `JanusClient.request`. Give `saveFile` and `editorSync` explicit deadlines, leaving unrelated RPCs unchanged. Save timeout errors flow through existing editor failure handling; draft-sync uses its existing bounded transient retry policy.

## Implementation steps

1. Add optional deadlines to `RpcExchange.request` and clear timers on reply, send failure, drain, and disposal.
2. Forward request options through `JanusClient.request` and set explicit deadlines on `saveFile` and `editorSync`.
3. Add fake-timer coverage for silence, deadline cleanup, a reply racing expiration, and queued saves released by timeout; verify draft-sync's bounded retry behavior.
4. Update `product/specs/editor-tab.md` and `product/specs/websocket-rpc.md` for unknown save outcomes and bounded request waits.

## Tests

- An open socket that never replies settles editor RPCs with a nonempty timeout error and removes their pending callback.
- A reply or connection teardown clears its timer; a late reply after timeout is ignored.
- A timed-out save rejects queued saves without advancing the baseline or silently replaying the mutation.
- Draft synchronization retries only through its existing bounded replacement policy.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Out of scope

- Deadlines for unrelated RPC methods.
- Automatic replay of timed-out saves or any claim that the server did not perform a save whose reply was lost.
