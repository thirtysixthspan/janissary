# Draw the far-side MCP endpoint's port from the shared reachable-port pool

**Complexity: 2/10** — 4 requirements and 3 test scenarios over ~8 added lines in 2 files (p=4.17)

## Goal

`FarSideMcp` in `src/remote/serve-mcp.ts` picks its loopback port with a private copy of the allocator that `src/browser/e2e-ports.ts` already owns: its own `claimPort`, its own `reserved` set, and hard-coded `FIRST_PORT` and `PORT_COUNT`. A remote `-b` harness's browser guard is allocated in the same `remote-serve` process from the same 49152 to 65279 range, but from the other set, so it can be handed the port the MCP endpoint is already listening on. Its bind then fails and that tab's browser is torn down. This fix makes the far-side endpoint claim its port through `reserveReachablePort()`, the helper the local MCP manager already uses, so one reservation set serves every consumer in the process and the band arithmetic lives in one place.

## Requirements

1. "far-side browser guards cannot take it": while a far-side endpoint is live, a browser guard allocated in the same process with a draw equal to the endpoint's port is given a different port.
2. "call it from `dispose()` in place of `reserved.delete(this.port)`": disposing the endpoint returns its port to the shared pool, so a later guard drawing that port receives it.
3. "`reserveReachablePort` normalizes a draw with `claimPort`": an endpoint whose draw lands inside the denied browser band still listens on a port below `BROWSER_PORT_BAND_FIRST`.
4. The far-side endpoint section of `product/specs/mcp-server.md` states that the endpoint's port comes from the same reachable pool as the host's browser guards and is held until the endpoint is released.

## Design decisions

- `FarSideMcp` holds the `ReservedPort` that `reserveReachablePort()` returns as a private field initialized where `port` is initialized today, and its `port` reads from that reservation. The constructor still claims the port before the server is created, so `launch` and the bind-failure text keep naming it (Assumption 1).
- `dispose()` calls the reservation's `release` where it now deletes from the private set. The private `FIRST_PORT`, `PORT_COUNT`, `reserved` and `claimPort` are deleted with no shim left behind, per the one-definition rule.
- Exhaustion keeps throwing from the constructor, so `RemoteProcesses.spawn` still fails that spawn the way it does today (Assumption 3). The thrown text becomes the shared one, `no free harness-reachable port between 49152 and 65279`, instead of `no free MCP port`. Nothing reads or documents the old text (Assumption 4).
- The rationale comment above the old `claimPort` (why the port is drawn rather than bound with `listen(0)`) is kept beside the reservation field and reworded to name the shared pool. The comment above `reserveReachablePort` in `src/browser/e2e-ports.ts` gains the far-side endpoint as a second consumer.

## Preserved behavior

1. A forced draw of a port inside the guard range lands on that exact port, and a disposed endpoint frees it for the next one. A new endpoint after a disposed collision must not be moved to a different port. Pinned by "reports a real port collision without crashing the session" in `src/remote/serve-mcp.test.ts`.
2. A shared endpoint that failed to bind reports the stored reason to a later harness and exits it with code 1. The later harness must not be spawned or left hanging. Pinned by "reports a failed shared MCP endpoint to a later harness before exiting it" in `src/remote/serve.test.ts`.
3. The endpoint listens on `127.0.0.1` with a numeric port and relays calls. It must not bind another address. Pinned by "relays a question as mcp-call and settles it when mcp-result arrives" in `src/remote/serve-mcp.test.ts`.
4. The local MCP manager's first start draws a reachable port that guards cannot take. A guard must not receive the local server's port. Pinned by "binds and persists a reachable port outside the denied band when the draw lands inside it" in `src/mcp/manager-port.test.ts`.

## Assumptions

1. The endpoint claims its port in a field initializer before the constructor body runs: `src/remote/serve-mcp.ts:59` "`private readonly port = claimPort();`".
2. The shared helper draws from the guard range and the shared set: `src/browser/e2e-ports.ts:104-107` "`export function reserveReachablePort(): ReservedPort`".
3. The endpoint is constructed inside `spawn`, so a constructor throw fails that spawn: `src/remote/serve-processes.ts:76` "`const endpoint = this.mcp ??= new FarSideMcp(`".
4. The old exhaustion text is referenced only where it is thrown: `src/remote/serve-mcp.ts:48` "`throw new Error('no free MCP port');`".
5. Far-side `-b` harnesses allocate guard ports in the same process through `harnessSpawnEnv`: `src/remote/serve-processes.ts:166` "`browser: frame.browser ?? false`".
6. The guard range ends one port below the band, matching the private copy's arithmetic: `src/browser/e2e-ports.ts:28` "`const GUARD_COUNT = PORT_COUNT - BROWSER_PORT_BAND_COUNT;`".

## Existing functionality

1. The shared reservation helper and its result type: `src/browser/e2e-ports.ts:99` "`export type ReservedPort`".
2. The guard allocator a test uses to probe the shared set: `src/browser/e2e-ports.ts:74` "`export function allocateBrowserPorts(): BrowserPorts`".
3. The local manager's use of the same helper, the model for this change: `src/mcp/manager.ts:144` "`? reserveReachablePort()`".
4. The forced-draw hook in the endpoint tests: `src/remote/serve-mcp.test.ts:28-30` "`randomInt: undefined as ((min: number, max: number) => number) | undefined`".
5. The test that pairs a guard allocation with a reserved MCP port: `src/mcp/manager-port.test.ts:106` "`const browser = allocateBrowserPorts();`".

## Implementation steps

1. In `src/remote/serve-mcp.ts`, import `reserveReachablePort` and `ReservedPort` from `../browser/e2e-ports.js`, delete `FIRST_PORT`, `PORT_COUNT`, `reserved`, `claimPort` and the now-unused `randomInt` import, add a private `reservation` field set from `reserveReachablePort()` with `port` read from it, and call `this.reservation.release()` in `dispose()`. Move the draw rationale comment to the new field and update the comment above `reserveReachablePort` in `src/browser/e2e-ports.ts` to name the far-side endpoint. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Add the tests below to `src/remote/serve-mcp.test.ts`, then update `product/specs/mcp-server.md`. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. The endpoint's address still reaches the harness only through its launch environment, and nothing the user sees changes.

## Tests

- `src/remote/serve-mcp.test.ts`, "draws its port from the shared pool so a far-side browser guard cannot take it": construct an endpoint, read its port from `launch()`, force the draw to that port, call `allocateBrowserPorts()`, and assert the guard port differs (Requirement 1).
- `src/remote/serve-mcp.test.ts`, "returns its port to the shared pool when disposed": after disposing that endpoint, force the same draw and assert `allocateBrowserPorts()` hands the guard exactly that port (Requirement 2).
- `src/remote/serve-mcp.test.ts`, "listens below the denied browser band when the draw lands inside it": force a draw inside the band and assert the endpoint's port is below `BROWSER_PORT_BAND_FIRST` (Requirement 3).

Each case reads the endpoint's actual port rather than assuming the forced value, because other cases in the file leave endpoints reserved.

## Out of scope

The local `McpManager`'s handling of saved and overridden ports is a separate backlog entry. Collisions with a foreign process on the host remain a contained bind failure, reported as today. The bind-failure reporting, grace window and relay are unchanged.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then run `npx vitest run src/remote/serve-mcp.test.ts src/remote/serve.test.ts src/mcp/manager-port.test.ts`. The three new cases pass along with the existing collision tests; a failure looks like the guard port equalling the endpoint's port, or a disposed port not coming back. A real far-side collision needs a remote host and a race against a random draw, so this targeted run is the manual check. Finally, confirm with `grep -n "claimPort\|PORT_COUNT" src/remote/serve-mcp.ts` that no private allocator remains, and read the remote endpoint paragraph of `product/specs/mcp-server.md` to confirm it says the port comes from the shared reachable pool.
