# fix(remote): derive the MCP collision test's forced port from a real endpoint

**Complexity: 1/10** — 6 requirements and 1 scenario, no production code or new units (p=3.21)

## Goal

The server-level case added to `src/remote/serve.test.ts` to prove a far-side MCP bind failure reaches a later harness forces `cryptoMock.port` from `blocker.listen(0)`. That OS-assigned port can land outside the `[FIRST_PORT, FIRST_PORT + PORT_COUNT)` band that `claimPort()` in `src/remote/serve-mcp.ts` accepts; `claimPort()` wraps an out-of-band value through a modulo, so the endpoint binds a different port than the blocker and the intended collision never happens. The case then passes or fails with the OS-assigned port instead of exercising the failure path it was added to verify. Deriving the forced port from a real endpoint's bound URL makes the collision deterministic while leaving the behavior under test and every assertion unchanged.

## Requirements

1. "replace the `blocker.listen(0)` / `address.port` source for `cryptoMock.port` with the pattern the real-collision fixture in `src/remote/serve-mcp.test.ts` already uses": the forced port in the server-level case no longer comes from an OS-assigned ephemeral bind.
2. "construct a FarSideMcp, read the port from its `launch().url`, dispose it, then bind the blocker to that port": the new setup uses a probe endpoint's real bound URL to obtain the port, releases the probe, then occupies that exact port with the blocker.
3. Wait for the probe's listener to finish binding before disposing it, because `dispose()` closes only a server whose `listening` flag is already set.
4. "That guarantees the value falls inside the band `claimPort()` accepts": the forced port is one `claimPort()` itself handed out, so the endpoint's claim is not wrapped through the modulo.
5. "the second harness spawn reliably hits the stored bind failure and receives the reason before its exit": the case keeps proving the collision reaches the second harness and keeps its existing output and exit assertions.
6. "one green run does not prove the path is covered": the affected case is verified across more than one run to confirm the setup is deterministic.

## Design decisions

- Use the probe-then-blocker setup already proven in `src/remote/serve-mcp.test.ts` (`probe`, `Number(new URL(probe.launch().url).port)`, `probe.dispose()`, `blocker.listen(port, ...)`) rather than inventing a new way to obtain an in-band port (Assumption 1).
- Obtain the port from the endpoint itself instead of from `listen(0)`, because `claimPort()` only accepts `[FIRST_PORT, FIRST_PORT + PORT_COUNT)` and wraps anything outside it (Assumption 2).
- Dispose the probe before binding the blocker so the port is free and the blocker genuinely occupies it. Because `server.listen(port, '127.0.0.1')` defers its bind through a host lookup, wait one event-loop turn after `launch()` before `dispose()`; otherwise `server.listening` is still false and `dispose()` skips the close, leaving the probe holding the port (Assumptions 1 and 5).
- Change only the test setup in `src/remote/serve.test.ts`: no production code, no protocol, and no other assertion in the case changes (Assumption 3).

## Preserved behavior

1. The server-level case still drives a real collision through the shared far-side endpoint and asserts that the second harness receives the stored reason as an `output` frame and an `exit` frame with code 1. It must not be reduced to a mocked or synthetic failure. Pinned by `reports a failed shared MCP endpoint to a later harness before exiting it` in `src/remote/serve.test.ts`.
2. The colliding harness still reports `MCP endpoint could not bind` before the second harness spawns, and the session still keeps serving after the refused spawn. Pinned by `reports a failed shared MCP endpoint to a later harness before exiting it` in `src/remote/serve.test.ts`.
3. The `node:crypto` mock still pins `randomInt` so every `claimPort()` call in the case lands on the blocker's port. Pinned by the hoisted `cryptoMock` in `src/remote/serve.test.ts`.

## Assumptions

1. `src/remote/serve-mcp.test.ts:174-180` already probes a `FarSideMcp`, reads `Number(new URL(probe.launch().url).port)`, disposes the probe, and binds a real server to that port, so the same sequence works against the real handler and HTTP server used by `src/remote/serve.test.ts`.
2. `src/remote/serve-mcp.ts:33-43` `claimPort()` wraps a value outside `[FIRST_PORT, FIRST_PORT + PORT_COUNT)` through a modulo, while `src/remote/serve-mcp.ts:80-86` `launch()` names the claimed port in its URL; an endpoint's own URL therefore reports a value `claimPort()` accepts verbatim.
3. `src/remote/serve.test.ts:30-37` the hoisted `cryptoMock.port` overrides `randomInt` for the whole case, and `src/remote/serve.test.ts:572-599` is the only case that sets it; the probe must be created before the override is installed so its claim uses the real `randomInt`.
4. `src/remote/serve.test.ts:595-597` the `finally` block already clears `cryptoMock.port`, closes the blocker, and shuts the server down, so the new setup keeps the same teardown.
5. `src/remote/serve-mcp.ts:77` `this.server.listen(this.port, LOOPBACK)` with `LOOPBACK = '127.0.0.1'` defers the bind behind a host lookup, so `this.server.listening` is false until a later turn; `src/remote/serve-mcp.ts:98` `if (this.server.listening) this.server.close()` therefore needs that turn to elapse before `dispose()` actually releases the port.

## Existing functionality

1. `FarSideMcp.launch()` at `src/remote/serve-mcp.ts:80-86` returns `{ url, token }`, where `url` embeds the endpoint's claimed loopback port.
2. `FarSideMcp.dispose()` at `src/remote/serve-mcp.ts:96-100` releases the port reservation and closes the listener.
3. The probe fixture at `src/remote/serve-mcp.test.ts:174-180` reads the claimed port from `new URL(probe.launch().url).port` and binds a real `node:http` server to it.
4. The hoisted `cryptoMock` at `src/remote/serve.test.ts:30-37` and its cleanup at `src/remote/serve.test.ts:595-597` already pin and clear the port for the server-level case.

## Implementation steps

1. In `src/remote/serve.test.ts`, import `FarSideMcp` directly from `./serve-mcp.js` with the `.js` extension, alongside the existing `RemoteServer` import from `./serve.js`. Build command: `$janissary/scripts/run.mjs check-diff`.
2. In the case `reports a failed shared MCP endpoint to a later harness before exiting it`, replace the `blocker.listen(0)` / `address.port` setup with the fixture sequence: create a probe `FarSideMcp` before installing the forced port, read the port from `Number(new URL(probe.launch().url).port)`, yield one event-loop turn with `await new Promise<void>((resolve) => setImmediate(resolve))` so the probe's deferred bind completes, dispose the probe, assign that port to `cryptoMock.port`, start the blocker with `blocker.listen(port, '127.0.0.1', ...)`, and drop the now-unused `address` variable and its guard. Leave the spawn frames, `waitFor`, all four assertions, and the `finally` teardown byte-for-byte unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. The change is confined to a test's port setup; it adds no command, flag, key binding, panel, or user-operated surface. The user-visible behavior the test pins stays exactly as it was.

## Tests

In `src/remote/serve.test.ts`:

1. Requirement 1-4: the existing `reports a failed shared MCP endpoint to a later harness before exiting it` case keeps proving that a real collision produces an `output` frame naming `MCP endpoint could not bind` for the second harness, an `exit` frame with code 1 for that harness, and no session-wide exit. Only the forced-port setup changes; no assertion is added, removed, or relaxed.
2. Requirement 5: run that case more than once to confirm it passes deterministically rather than depending on the port the OS happens to hand out.

## Out of scope

- Production code in `src/remote/serve-mcp.ts` and `src/remote/serve-processes.ts`, and every assertion already in the case.
- The `claimPort()` range, the reservation set, the `node:crypto` mock shape, and the other cases in `src/remote/serve.test.ts`.
- Help pages and the `documentation/user-documentation/` and `documentation/developer-documentation/` trees. The functional spec already describes bind collisions, and this change only makes an existing test deterministic, so no spec or help update is needed.

## Verification

1. `$janissary/scripts/run.mjs check-diff` passes, including lint, incremental typecheck, and the server tests for `src/remote`.
2. Manual: run the `reports a failed shared MCP endpoint to a later harness before exiting it` case repeatedly (for example, three times in a row) and confirm each run passes with the reason and exit-1 assertions intact. Then read the case and confirm the forced port comes from `new URL(probe.launch().url).port` with the probe disposed before the blocker binds, and that no assertion or production file changed. A failure looks like an intermittent timeout or a run where the second harness never receives the bind-failure reason.
