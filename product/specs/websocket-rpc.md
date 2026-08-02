# WebSocket RPC

### Accepted envelopes

Client requests are JSON objects with `t: "rpc"`, a numeric `id`, a recognized `method`, and an object-valued `params`. Methods with no arguments still send `params: {}`. Accepted requests are dispatched once, and replies that a method produces carry the request's `id`.

### Invalid frames

The server silently drops malformed JSON and JSON values that are not valid RPC envelopes. This includes unknown methods and requests with missing, null, array, or primitive `params`. Dropped frames are neither dispatched nor acknowledged, and they do not close the WebSocket; a later valid request on the same connection is handled normally.

### Dispatch errors

If dispatching an accepted envelope throws synchronously, the server sends an `rpc-reply` with the request's `id` and the error message. Individual methods may also own a deferred or specialized reply instead of the generic `ok` result.
