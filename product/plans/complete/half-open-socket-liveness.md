# Detect a socket that survives sleep in name only

**Complexity: 6/10** — a liveness probe threaded through the client's reconnect path, a forced-close primitive added to the connection module, and care around a probe racing an unrelated reconnect.

PR 1131 backlog item: *"Detect a socket that survives sleep in name only, so a wake with a half-open connection still recovers."*

`SocketConnection.reconnect()` returns immediately whenever `socket.readyState` is `OPEN` — exactly the state a suspend leaves a WebSocket in when the OS tears down the underlying TCP connection without ever firing the browser's `close` event. There is no ping, pong, or idle timer anywhere in the client, so the `online`/`visibilitychange` wake handlers added by this PR call `reconnect()`, find the socket reporting healthy, and do nothing — on exactly the wake they exist for. Every keystroke and request is then silently dropped by the `readyState === OPEN` guards in `send`/`request`/`saveFile` until the OS's own TCP timeout eventually closes the socket, minutes later.

## Design decisions

**Reuse the existing `init` round trip rather than adding a protocol member.** `init` is already an `ack`-mode RPC method (`src/client-message.ts`'s `CLIENT_METHOD_CONTRACTS`) that both confirms the connection is alive and resyncs state — exactly what a successful liveness check should also do. `JanusClient.reconnect()` now branches: if the socket is not `OPEN`, it delegates to `SocketConnection.reconnect()` exactly as before; if it is `OPEN`, it sends `{ method: 'init', params: {} }` through `request()` and races it against a `LIVENESS_TIMEOUT_MS` (4000ms) deadline.

**A missing answer forces the socket closed through a new `SocketConnection.terminate()`, not a real `close()` call alone.** Calling the browser's `WebSocket.close()` on a socket whose TCP connection is already dead does not reliably fire a prompt `close` event — that is the same lie `readyState` already told. `terminate()` calls `socket.close()` for hygiene and then immediately runs the same drain/publish/backoff logic a real `close` event runs, refactored out of the `connect()` method's inline listener into a shared private `handleClose(socket)` so both paths behave identically and neither can double-run for the same socket (each call re-checks `this.socket === socket`).

**A stale probe must not terminate an unrelated, healthy connection.** The deadline timer captures the specific socket it is probing (`const probed = this.ws`) at the moment it starts. If the timer fires only after the connection has already moved on — a genuine `close` event beat the probe to it, or a second wake started a fresh reconnect — `this.ws !== probed` and the callback no-ops instead of tearing down a socket that has nothing to do with the original probe. This is not a hypothetical: a synchronous caller has no guarantee that a promise's `.then()` callback (a microtask) has run before some other code path checks `settled`, so relying on `.then()`'s `clearTimeout` alone is not sufficient defense on its own — in the normal JS event loop this ordering is safe (microtasks always drain before the next timer callback), but it is exactly the ordering a fake-timer test harness does not reproduce unless the test explicitly yields a microtask turn, which is itself informative: the socket-identity guard is what makes the *production* guarantee (correct) independent of that scheduling detail (belt-and-suspenders, not merely test hygiene).

**`terminate()`'s explicit call and the socket's own `close` event must not both run the cleanup.** `terminate()` calls `socket.close()` for hygiene, but nothing guarantees whether or when that produces a `close` event — a genuinely dead half-open socket may never fire one, while a synchronous test double fires it immediately. `SocketConnection` gets a `closeHandled` flag, reset each time `connect()` mints a new socket, so whichever of the two paths (the native event or `terminate()`'s explicit call) reaches `handleClose` first runs the cleanup and the other finds it already done.

**The timeout is 4000ms.** Long enough that a server under load answering slowly is not mistaken for a dead connection (the plan's other design decisions treat "server busy" and "server unreachable" as different problems), short enough that a genuine wake still recovers within a few seconds rather than waiting out the ordinary backoff ceiling.

## Proposed changes

- **`web/src/ws-connection.ts`** — extract the `close` event listener's body into a private `handleClose(socket: WebSocket)` method (unchanged behavior, same guard). Add a public `terminate()` that calls `this.socket.close()` then `this.handleClose(this.socket)` synchronously, for a caller that already knows the socket is dead and cannot wait on its `close` event.
- **`web/src/ws.ts`** — add `LIVENESS_TIMEOUT_MS = 4000`. Rewrite `reconnect()` to branch on `this.ws.readyState`: not `OPEN` delegates to `this.connection.reconnect()` unchanged; `OPEN` sends `init` via `request()` racing a captured-socket-checked deadline that calls `this.connection.terminate()` on timeout.

## Spec

- **`product/specs/sleep-and-resume.md`** and **`product/specs/websocket-rpc.md`** — both describe a wake prompting "an immediate attempt" without qualifying what happens when the socket still reports itself open; add a sentence to each stating that a connection reporting open gets a brief liveness check first, and is replaced if nothing answers.

## Tests

- `web/src/ws.test.ts` — a new case in the `JanusClient reconnection` describe block: hold a socket at `OPEN`, call `client.reconnect()`, assert an `init` request was sent and no new socket was created yet, then advance past `LIVENESS_TIMEOUT_MS` with no reply and assert the socket was closed and a replacement opened. A second case sends the `init` reply before the deadline and asserts no new socket appears. The existing `retries immediately on wake only when down and ignores events from an old socket` and `settles outstanding work when wake replaces a closing socket before its close event` cases must keep passing unchanged — they already exercise the not-`OPEN` branch this fix leaves untouched, and the first of the two is exactly the case that first exposed the stale-deadline race this plan's design decision addresses.
- `web/src/client-page-lifecycle.test.ts`'s existing online/visibility cases are unaffected — they assert `client.reconnect?.()` is called, not what it does once called, and must keep passing unchanged.

## Out of scope

- A dedicated ping/pong protocol member — `init` already provides an equivalent round trip with a useful side effect (resync), so adding one is not justified.
- Any change to the not-`OPEN` reconnect path, the backoff schedule, or the escalation wording — this fix only reaches the previously-dead branch where the socket claims to be healthy.

## Verification

```
$janissary/scripts/run.mjs check-diff
```
