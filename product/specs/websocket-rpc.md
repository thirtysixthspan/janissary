# WebSocket RPC

### Browser history restoration

When the browser restores the app from its back/forward cache, the previously released WebSocket client is replaced with a new connection and sends the normal `init` request. The server keeps the session available for one second after its last client disconnects, and cancels that pending shutdown when the replacement connection arrives during that window.

### Accepted envelopes

Client requests are JSON objects with `t: "rpc"`, a numeric `id`, a recognized `method`, and an object-valued `params`. Methods with no arguments still send `params: {}`. Accepted requests are dispatched once, and replies that a method produces carry the request's `id`.

### Reply contracts

Every recognized method has one reply mode. Acknowledgement methods reply with `"ok"` after their action runs. Result methods reply with the value their action produces. Deferred methods reply when their promise or callback settles. The dispatcher sends that one declared reply, so a method never receives both a result and a trailing acknowledgement.

An action that throws or a deferred action that rejects replies with the request id and the error message. A method may deliberately replace a failure with a documented fallback result, as project-file and file-navigator searches do.

### Invalid frames

The server silently drops malformed JSON and JSON values that are not valid RPC envelopes. This includes unknown methods and requests with missing, null, array, or primitive `params`. Dropped frames are neither dispatched nor acknowledged, and they do not close the WebSocket; a later valid request on the same connection is handled normally.

### Dispatch errors

If dispatching an accepted envelope fails, the server sends an `rpc-reply` with the request's `id` and the error message. This applies to synchronous failures and rejected deferred work.

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

Both fields must be strings. A valid report is acknowledged with `"ok"`; the server disables the plugin found through its own tab record and performs normal plugin teardown. Method-specific malformed fields receive `Invalid pluginIntent params` or `Invalid pluginFailed params` and do not reach or disable a plugin.

There is no video-specific frame-capture RPC. Video capture and external-open actions use `pluginIntent`.
