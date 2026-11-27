# fix: contain a far-side MCP listener bind failure

**Complexity: 3/10** — ~8 added production lines across 2 files, 7 requirements and 6 scenarios (p=4.71)

## Goal

A harness launched with MCP on a remote host gets one loopback endpoint in that session's `janus remote-serve`. The endpoint claims a port and calls `listen()` without an `'error'` listener, so a cross-process port collision emits an unhandled `EADDRINUSE` that terminates the remote-serve process and every tab on its ssh channel. The goal is to make a bind collision a contained, reported failure of that one endpoint: the session and its other tabs keep running, the harness launch is refused with a clear reason, and the claimed port is released.

## Requirements

1. "register an 'error' listener on the createServer result before calling listen()": the far-side HTTP server has an `'error'` listener attached before `listen()` is called.
2. "an EADDRINUSE emits an unhandled error that terminates the entire remote-serve process and every tab on that ssh channel": a listener bind error is handled and does not terminate the remote-serve process or its other tabs.
3. "mark the endpoint failed": the endpoint records the bind failure in its own state.
4. "a subsequent launch() surfaces a clear error rather than publishing an address that was never bound": `launch()` throws an error naming the bind failure instead of returning a URL and token when the endpoint has failed.
5. "route the failure through the injected send callback so the local side sees why the endpoint is unavailable": the bind failure is sent to the local side through the injected `send` callback with a message naming the failure.
6. "Keep the port reservation returned in dispose() on that failure path so the claimed port is not stranded": `dispose()` removes the claimed port from the reservation set after a bind failure.
7. "leave the existing `if (this.server.listening)` guard so dispose() stays safe when the bind never succeeded": `dispose()` does not call `close()` on a server whose bind never succeeded.

## Design decisions

- Add an `'error'` listener to the `createServer` result immediately before `listen()` in the `FarSideMcp` constructor, storing a human-readable failure string in a new private field. The listener, not a `try`/`catch`, is the mechanism because Node reports bind failures as events on the next tick, after the constructor and the first `launch()` have returned.
- Make `launch()` check that field first and throw when it is set; the successful return value keeps its exact `{ url, token }` shape. The failure is therefore observable on every `launch()` after the bind is known, while the already-published first launch is not silently left without a report.
- Report through the existing `output` server frame (`src/remote/protocol-frames.ts:234`) addressed to the spawning harness process. `FarSideMcp` takes that process id as a new constructor argument, supplied from the `frame.id` already in scope at `src/remote/serve-processes.ts:115`. This adds no protocol frame, no client handler, and no change to the relay or the detach/grace path.
- Leave the reservation lifecycle in `dispose()` exactly where it is: the existing `reserved.delete(this.port)` covers the failure path, and the existing `if (this.server.listening)` guard keeps `dispose()` safe on a server that never bound.
- Prove the collision with a real `node:http` listener in `src/remote/serve-mcp.test.ts`. A first instance, still using the file's mocked `createServer`, reveals the claimed port and releases it with `dispose()`; a real server occupies that port; a second instance is given the real `createServer` once and a temporarily pinned `randomInt` so its claim lands on the same occupied port and its bind genuinely fails. No production code for port claiming changes, and no existing test case is altered.
- Keep every existing mocked test and every relay, guard, token, and pending-map behavior byte-for-byte unchanged.

## Preserved behavior

1. A harness launched with MCP still mints its own token and publishes a loopback `http://127.0.0.1:<port>/mcp` URL and token in its spawn environment for a successful bind. The new failure field is unset on that path, so neither the env shape nor the URL changes. Pinned by `mints its own token that matches nothing the spawn frame carried` in `src/remote/serve-mcp.test.ts`.
2. A question still travels as an `mcp-call` frame and settles on `mcp-result`, and an aborted call still sends nothing further for itself. The `'error'` listener and failure field never touch `relay` or `pending`. Pinned by `relays a question as mcp-call and settles it when mcp-result arrives` in `src/remote/serve-mcp.test.ts`.
3. A spawn without MCP still creates no endpoint, sends no frame, and records one process. The constructor is reached only for `frame.mcp === true`. Pinned by `creates no endpoint and relays nothing for a spawn without mcp` in `src/remote/serve-mcp.test.ts`.

## Assumptions

1. `src/remote/serve-mcp.ts:69` `this.server.listen(this.port, LOOPBACK);` is the only bind and runs synchronously in the constructor, so an `EADDRINUSE` arrives after the first synchronous `launch()` and is observable on a later one.
2. `src/remote/serve-processes.ts:115` `(this.mcp ??= new FarSideMcp(this.send)).launch()` creates one shared endpoint per remote process and has `frame.id` in scope; `src/remote/serve-processes.ts:153` already sends `output` frames keyed by that id.
3. `src/remote/protocol-frames.ts:234` `| { type: 'output'; id: string; data: string }` is an admitted server frame, so the report needs no protocol, codec, or client-side change.
4. `src/remote/serve-mcp.ts:18` `const reserved = new Set<number>();` and `src/remote/serve-mcp.ts:85` `reserved.delete(this.port);` put port release in `dispose()`, which already runs for a failed endpoint from `killAll()`.
5. `src/remote/serve-mcp.test.ts:15` `server: { listening: true, listen: vi.fn(), close: vi.fn() }` has no `on`, so the shared mock must gain an `on` spy for the new listener registration.
6. `src/remote/serve-mcp.test.ts:19` `vi.mock('node:http', …)` replaces `createServer` for the whole file, so the collision case needs `vi.importActual` and a one-shot `mockImplementationOnce` to get one real listener, and a hoisted `randomInt` override to pin the second claim to the occupied port.

## Existing functionality

1. `node:http`'s `Server` `'error'` event is the existing, handled channel for bind failures such as `EADDRINUSE`.
2. The `output` frame at `src/remote/protocol-frames.ts:234` is the existing per-process path from the far side to the tab's terminal; `src/remote/serve-processes.ts:153` already uses it for process output.
3. `reserved.delete(this.port)` at `src/remote/serve-mcp.ts:85` is the existing port-release mechanism and already covers every `dispose()` call.
4. `vi.fn().mockImplementationOnce` on `httpMock.createServer` (`src/remote/serve-mcp.test.ts:16-17`) lets one construction use a different server without altering the file-level mock.
5. `vi.importActual<typeof Http>('node:http')` supplies the unmocked `createServer` for the real collision while the rest of the file keeps the fake.

## Implementation steps

1. In `src/remote/serve-mcp.ts`, add a private failure string field and take the process id as a second constructor argument. Register an `'error'` listener on the `createServer` result directly before `this.server.listen(...)`, recording the message and sending an `output` frame addressed to that id with the reason. At the top of `launch()`, throw an `Error` carrying the recorded message when the field is set; leave the success return untouched. Do not change `dispose()`, `relay`, `result`, `claimPort`, or any other member. Build command: `$janissary/scripts/run.mjs check-diff`.
2. In `src/remote/serve-processes.ts`, pass `frame.id` as the new `FarSideMcp` constructor argument at the `new FarSideMcp(this.send)` call in `spawnPty`. Change nothing else in that method. Build command: `$janissary/scripts/run.mjs check-diff`.
3. In `src/remote/serve-mcp.test.ts`, add `on: vi.fn()` to the shared `httpMock.server`, clear it in `beforeEach`, and import `FarSideMcp`. Add the real-collision case described in Tests at the end of the existing `describe` block, leaving all four existing cases byte-for-byte unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.
4. Add one short paragraph on bind collisions to the `MCP on the far side` section of `product/specs/remote-server.md`, describing only user-visible behavior. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. The change adds no command, flag, key binding, panel, or other user-operated surface; the only visible effect is an error line in the harness tab's output when its endpoint cannot bind.

## Tests

In `src/remote/serve-mcp.test.ts`, colocated at the end of `describe('the far-side MCP endpoint')`:

1. Requirements 1-7: one real-port-collision case. It learns the claimed port from a first instance built with the mocked `createServer`, releases that reservation through `dispose()`, occupies the port with a real `node:http` server, pins `randomInt` to that port, and gives a second instance the real `createServer` once. It asserts that an `output` frame naming `EADDRINUSE` reaches the injected `send` callback, that `launch()` throws a clear error after the failure, that no error escapes the event handler, and that a third instance can claim the same port again after the failed instance's `dispose()`.

## Out of scope

- Any protocol version bump, new frame type, codec change, or client-side handler for MCP failures.
- Changes to the relay, the pending map, the guard, token minting, the detached/grace window, or the shared-endpoint lifetime.
- Changing the random port claim, its range, or the reservation set's structure.
- Editing any existing test case beyond the shared mock's `on` spy and its `beforeEach` clear.
- User and developer documentation, and help pages: no command, flag, or key binding changes, and the spec paragraph is the only documentation touched.

## Verification

1. `$janissary/scripts/run.mjs check-diff` passes, including lint, incremental typecheck, and the server tests for `src/remote`.
2. Manual check: read `src/remote/serve-mcp.ts` and confirm the `'error'` listener is registered before `listen()`, that `launch()` throws only after a recorded failure, and that `dispose()` still deletes the reservation and guards `close()` with `server.listening`. Then read the new case in `src/remote/serve-mcp.test.ts` and confirm it creates a real listener, not the mocked one, and asserts a reported `EADDRINUSE`. A failure looks like an unhandled error terminating the process, a published URL from a failed `launch()`, a stranded port, or any diff in the four existing cases.
