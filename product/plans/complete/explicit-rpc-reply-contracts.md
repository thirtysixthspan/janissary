# Explicit RPC reply contracts

**Complexity: 7/10** — the change covers every client RPC method and both server dispatch modules, but stays within the existing wire contract and controller APIs. The main risk is preserving the timing and fallback behavior of synchronous, promise-based, and callback-based replies while removing their duplicated reply calls.

## Goal

Every accepted client RPC method declares whether it receives a generic `ok` acknowledgement, a synchronous result, or a deferred result. The message dispatcher reads that declaration and sends exactly one success or error reply, so adding a method cannot silently fall through into the wrong behavior.

## Approach

Turn the existing recognized-method set in `src/client-message.ts` into the method contract registry. Its values carry the reply mode, so the same exhaustive record that validates method names also documents their reply behavior.

Change the core and file-navigator routing switches into execution-only functions that return a value or promise. The public `handle` function will use the registry to send acknowledgements, synchronous results, deferred results, and errors. Method-specific fallbacks such as empty project-file and file-navigator search results remain inside those executions because they are part of those methods' behavior.

## Implementation steps

1. Update `src/client-message.ts` with an exhaustive `ack`, `result`, or `deferred` reply mode for every `ClientMessage` method and expose a lookup used by validation and dispatch.
2. Refactor `src/message-handler-file-navigator.ts` to execute file-navigator methods and return their result or promise without constructing RPC replies.
3. Refactor `src/message-handler.ts` so its switch executes methods and the outer dispatcher alone converts the declared reply mode into an `rpc-reply`, including shared synchronous and asynchronous error handling.
4. Update `product/specs/websocket-rpc.md` to state the reply-mode contract and its error behavior without changing the public wire format.

## Tests

- `src/client-message.test.ts` verifies representative methods in all three modes and pins the complete non-ack method sets, leaving every other recognized method as an acknowledgement.
- `src/message-handler.test.ts` verifies that the shared dispatcher turns failures from acknowledgement, synchronous-result, and deferred-result methods into one RPC error reply while preserving existing success and fallback tests.
- `src/message-handler-file-navigator.test.ts` is updated to exercise the execution-only helper through the public dispatcher where reply behavior is relevant.

## Out of scope

- Changing RPC request or reply wire shapes.
- Adding detailed parameter schemas for methods that currently receive only envelope validation.
- Changing method-specific fallback decisions for project-file or file-navigator searches.
- Changing the browser client's handling of RPC errors or WebSocket disconnection.
