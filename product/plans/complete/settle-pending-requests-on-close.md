# Settle outstanding WebSocket requests when their connection ends

**Complexity: 4/10** — one client class gains a settlement path its two request methods already have callbacks for, and the socket's close event and `dispose` both route through it. One source file plus its test; no wire, server, or caller change.

## Goal

Give a request whose connection ended a definite answer, so the dialogs and busy indicators waiting on it can finish instead of hanging on a reply that can never arrive.

## Approach

`JanusClient` keys pending request callbacks by id in one map. A reply removes its entry; nothing else does. The socket has no `close` listener at all, and `dispose` calls `pending.clear()`, dropping the callbacks without invoking them — so a disconnect after a save or a plugin intent leaves that promise pending for the life of the page.

Both call sites already accept a failure through the callback's existing `error` parameter, so no signature has to change. Add one private settlement helper that invokes a pending callback exactly once and removes it, route the reply path through it, and build the drain on top: settle every outstanding id with a connection error. The socket's `close` event and `dispose` both call the drain, and it is idempotent — a second call over an empty map does nothing — which matters because `dispose` closes the socket and the close event then fires on its own.

Caller conventions are deliberately unchanged in this increment. `request()` keeps resolving with the same unavailable value it already resolves with when the socket is not open, and `saveFile()` resolves with a nonempty connection error, which `useEditorFile` already displays. Nothing is replayed: a request whose reply was lost may still have been carried out, so re-sending a mutating call could apply it twice. A reply that arrives after a drain finds no entry and is dropped, which is already how an unknown id behaves.

A synchronous `send` failure is the same problem arriving a different way — the callback is in the map but nothing was ever asked. Route both request methods' sends through a small dispatch helper that settles the request when `send` throws.

The separate backlog entry that changes `request`'s declared return type to include `undefined` composes with this rather than conflicting: this one is about when the promise settles, that one about what the type admits and how callers read it.

## Implementation steps

1. In `web/src/ws.ts`, add a module constant for the connection-failure message and a private `settle(id, result, error)` that looks up the pending callback, deletes it, and invokes it — doing nothing when there is no entry.
2. Route the `rpc-reply` branch of `onEvent` through `settle` instead of its inline get/delete/call.
3. Add a private `drainPending()` that settles every outstanding id with the connection error, and call it from a new `close` listener registered in the constructor.
4. Replace `pending.clear()` in `dispose()` with `drainPending()`, and correct the method's comment, which currently states that in-flight promises are abandoned on purpose.
5. Add a private `dispatch(id, payload)` that sends and settles the request on a thrown send, and use it from both `request()` and `saveFile()`.

## Tests

`web/src/ws.test.ts` — its fake socket records handlers by event name but never dispatches `close`, and no case has a request outstanding when the connection ends. Extend the fake to capture the close handler, then add:

- Two requests outstanding when the socket closes: `request()` settles with its unavailable value and `saveFile()` with a nonempty error, rather than staying pending.
- A reply arriving after the close is harmless — it settles nothing a second time and does not throw.
- Closing twice, and closing then disposing, settle each request exactly once.
- `dispose()` with a request outstanding settles it rather than abandoning it.
- A request whose `send` throws settles instead of leaving its callback in the map.

The existing cases — a request started on an already-closed socket, a normal reply, `saveFile`'s reply and its not-connected value, and every listener-cleanup case on `dispose` — must keep passing unchanged.

## Spec updates

`product/specs/websocket-rpc.md` — add a section stating that a request outstanding when the connection ends is answered as a connection failure rather than left waiting, that nothing is resent because a lost reply does not prove the work was not done, and that a reply arriving after that point is ignored.

## Docs

None. Neither `help.md` nor any page under `documentation/user-documentation/` describes the WebSocket transport, reconnection, or what happens to work in progress when the connection drops, so there is nothing there to correct.

## Out of scope

- Changing `request()`'s declared return type or its call sites, which is the separate backlog entry.
- Reconnecting, replaying, or retrying anything.
- The server's own dispatcher and reply contracts, which are unchanged.
- `send()`, which registers no callback and awaits no reply.
