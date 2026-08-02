# Validate WebSocket RPC Envelopes

**Complexity:** 5/10

## Goal

Reject malformed or unknown WebSocket RPC envelopes before dispatch so controller and manager methods never receive a request whose method or parameter container was only asserted into existence. Unknown methods must not receive a false `ok` acknowledgement.

## Approach

Add a small ingress module that accepts `unknown` JSON values and narrows them to `ClientMessage` only when the top level is a record, `t` is `rpc`, `id` is numeric, `method` is recognized, and `params` is a non-array object. The recognized-method table will use `satisfies Record<ClientMessage['method'], true>` so TypeScript requires it to contain every protocol method and rejects extra entries.

The WebSocket message callback will parse into `unknown`, drop values that fail the guard, and dispatch only the narrowed message. `handle()` will also gain an explicit default return so a method that bypasses the edge guard never falls through to the generic `ok` reply.

The seven parameterless RPC variants will require `params: {}` in `RpcCall`, matching what the web client already sends and what the ingress guard accepts.

## Implementation Steps

### 1. Add and wire the envelope guard

- Create `src/client-message.ts` with the exhaustive recognized-method table and `isClientMessage(value)` guard.
- Update `src/index.ts` to parse frames as `unknown`, discard parse failures and failed guards, and pass only validated envelopes to `handle()`.
- Change parameterless variants in `src/protocol.ts` from optional `params` to required empty-object `params` so the static contract matches ingress behavior.

### 2. Stop unknown dispatch fallthrough

- Add an explicit default return to `src/message-handler.ts` so an unrecognized method produces no acknowledgement if it ever reaches the handler directly.
- Update direct handler tests that construct parameterless calls to include `params: {}`.

### 3. Record ingress behavior

- Create `product/specs/websocket-rpc.md` describing accepted envelopes, silently dropped invalid frames, connection continuity, and error replies from valid requests whose handlers throw.
- Leave `help.md` and public user documentation unchanged because the internal WebSocket protocol is not a user-facing command or setting.

## Tests

- Create `src/client-message.test.ts` covering a valid recognized envelope plus rejection of non-record values, bad envelope tags and ids, unknown methods, missing params, and null/array/non-object params.
- Extend `src/index.test.ts` to send well-formed JSON with invalid envelopes, verify it receives no replies for them, then send a valid request on the same socket to prove the connection remains usable.
- Extend `src/message-handler.test.ts` to verify a directly supplied unknown method receives no `ok` reply.
- Run `./scripts/run.mjs check-diff` after each implementation step and after spec/backlog changes.

## Out of Scope

- Validating every method's individual parameter fields and primitive types; this item adds only the narrow envelope guard requested by the backlog.
- Changing replies for exceptions thrown by a recognized, structurally valid request.
- Refactoring the switch's mixed dispatch styles; that remains a separate technical-debt item.
- Closing a WebSocket after malformed input; invalid frames are dropped and the connection stays open.
