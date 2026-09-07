# WebSocket RPC

### Browser history restoration

When the browser restores the app from its back/forward cache, the previously released WebSocket client is replaced with a new connection and sends the normal `init` request. The server keeps the session available for one second after its last client disconnects, and cancels that pending shutdown when the replacement connection arrives during that window.

### Accepted envelopes

Client requests are JSON objects with `t: "rpc"`, a numeric `id`, a recognized `method`, and an object-valued `params`. Methods with no arguments still send `params: {}`. Accepted requests are dispatched once, and replies that a method produces carry the request's `id`.

Every field a method's `params` declares is checked at the boundary, before the request is dispatched, and every method is checked — not a chosen few. A field must be of the type the method declares for it: a number where a number is declared, a string where a string is, and one of the listed values where the method accepts a fixed set. Optional fields may be omitted but not sent at the wrong type. Extra keys the method does not declare are ignored rather than refused, so a client running ahead of the server still talks to it. Methods that take no arguments accept any object.

### Reply contracts

Every recognized method has one reply mode. Acknowledgement methods reply with `"ok"` after their action runs. Result methods reply with the value their action produces. Deferred methods reply when their promise or callback settles. The dispatcher sends that one declared reply, so a method never receives both a result and a trailing acknowledgement.

An action that throws or a deferred action that rejects replies with the request id and the error message. A method may deliberately replace a failure with a documented fallback result, as project-file and file-navigator searches do.

### Requests outstanding when the connection ends

A request still waiting for its reply when the connection ends is answered as a connection failure rather than left waiting. A closed socket delivers nothing further, and work built on a reply — a save the user is watching, a plugin action holding a busy indicator — has to be able to finish. Whatever a caller shows for an unavailable answer is what it shows here.

Nothing is resent. A lost reply does not establish that the server never carried the request out, so replaying a mutating call could apply it twice. A reply that arrives after a connection has been given up on is ignored, exactly as a reply for an unrecognized request id is.

An unavailable answer is also what a caller gets when the socket was never open, and when the server replies with an error the reply's result cannot carry. The three are indistinguishable to the caller and are handled the same way, each surface deciding for itself:

- A file-navigator move, paste, or undo/redo replay leaves the tree as it stands and raises no overwrite dialog. Nothing moved, and there is no per-path report to act on.
- The file-search pop-up and the quick-open palette stop loading and show an empty result, rather than staying on a loading state that no reply will ever clear.
- Tab completion leaves the line exactly as it was typed, since there is nothing to complete against.

### Invalid frames

The server silently drops malformed JSON and JSON values that are not valid RPC envelopes. This includes unknown methods and requests with missing, null, array, or primitive `params`. Dropped frames are neither dispatched nor acknowledged, and they do not close the WebSocket; a later valid request on the same connection is handled normally.

A recognized method whose `params` fail the field checks above is answered rather than dropped: the reply carries the request's `id` and `Invalid <method> params`, and the request is not dispatched. The two are deliberately different — a client sending an envelope the server does not recognize has nothing to be told, while a client sending a known request with a bad field is waiting for an answer, and a method that replies only when its work settles would otherwise leave that caller waiting for a reply that never comes.

### Dispatch errors

If dispatching an accepted envelope fails, the server sends an `rpc-reply` with the request's `id` and the error message. This applies to synchronous failures and rejected deferred work.

A recognized method that reaches the dispatcher with no handler behind it is reported the same way — an error naming the method — rather than being answered with a successful acknowledgement for an action that never ran. A client is never told a request succeeded unless it did.

### Tab-plugin methods

`pluginIntent` sends a client action to the plugin that owns an open tab:

```json
{"t":"rpc","id":41,"method":"pluginIntent","params":{"tab":"video","intent":"capture-frame","payload":{"dataUrl":"data:image/png;base64,..."}}}
```

`tab` and `intent` must be strings and `payload` must be present (it may be any JSON value). The server uses `tab` only to find its own open-tab record; plugin identity, schema, authoritative tab payload, served-file references, and filesystem paths are never supplied by the client. A successful intent replies with its JSON result. Unknown or closed tabs, disabled plugins, invalid plugin payloads, handler failures, and timeouts reply with an RPC error.

A plugin that refuses a request it considers malformed — an unrecognized intent name, a payload that fails its own validation — also replies with an RPC error, but stays enabled and keeps its tabs. Only the plugin itself breaking disables it. A client cannot disable a plugin by sending it wrong intents.

`pluginFailed` reports a client loading or rendering failure:

```json
{"t":"rpc","id":42,"method":"pluginFailed","params":{"tab":"video","reason":"chunk rejected"}}
```

Both fields must be strings. A valid report is acknowledged with `"ok"`; the server disables the plugin found through its own tab record and performs normal plugin teardown. Malformed fields receive `Invalid pluginIntent params` or `Invalid pluginFailed params` — the same answer every method now gives for params that fail its field checks — and do not reach or disable a plugin.

There is no video-specific frame-capture RPC. Video capture and external-open actions use `pluginIntent`.
