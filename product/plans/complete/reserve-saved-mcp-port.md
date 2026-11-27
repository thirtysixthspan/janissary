# Reserve a saved or overridden MCP port in the shared browser-guard pool

**Complexity: 4/10** — 9 requirements, 8 test scenarios, ~20 added lines across 2 files (p=5.16)

## Goal

The local MCP server should hold its port in the shared reservation set for as long as it listens, however that port was chosen. Today only a first start that draws a fresh port enters it into the set. A later start that reuses the saved port, or any start under an `mcpPort` override, binds with a no-op release. So a `-b` harness's browser guard in the same process can draw the port the MCP server is already listening on, fail to bind, and tear down that tab's browser. That's the collision the shared reservation exists to prevent.

## Requirements

1. "Reserve a saved or overridden MCP port in the shared pool on every start, not only on the first": a start that reuses the saved port enters that port into the shared reservation set.
2. A start under an `mcpPort` override enters the override port into the shared reservation set.
3. While the MCP server is running on a reserved port, a browser-guard draw landing on that port is handed a different port ("browser guards in the same process can still draw the port the server is listening on").
4. Reserving a specific port that is already reserved adds nothing, and releasing that reservation leaves the earlier holder's reservation in place ("returning a `release` that deletes it only if this call added it").
5. A failed bind of a saved or overridden port returns the port to the pool ("keeping the existing release calls on a failed bind").
6. A disposal before publication returns a saved or overridden port to the pool ("a disposal before publication").
7. A failure to persist state returns the port to the pool ("and a persistence failure").
8. Disposing a running server returns its port to the pool, so the reservation lasts the server's lifetime and no longer ("The server's port is reserved for its lifetime however it was chosen").
9. A port outside the guard range can be reserved without error ("A port outside the guard range can be reserved harmlessly because nothing else draws it").

## Design decisions

- Add one exported function beside `reserveReachablePort` in `src/browser/e2e-ports.ts` that reserves a caller-named port and returns the existing `ReservedPort` shape, so the manager handles both branches through one type and one set of release calls.
- The new function adds the port only when the set doesn't already hold it, and its release deletes the port only when this call added it. A port held by someone else stays held after a non-owner releases (assumption 3).
- The function doesn't validate the range. A port outside the guard range costs nothing in the set, because no draw ever walks to it (assumption 2).
- `McpManager` keeps the reservation's release once the server is published and calls it from `dispose`, so a reused or drawn port is given back when the server stops. This applies to the drawn branch too, which today keeps its reservation after disposal.
- The existing release calls on the three failure paths stay where they are and now apply to the reserved configured port as well.

## Preserved behavior

1. A start with a saved state reuses the saved port and token and doesn't rewrite the file. It must not pick a new port or change the saved file. Pinned by "persists the chosen port and token with mode 0600 and reuses them on the next start" in `src/mcp/manager.test.ts`.
2. An `mcpPort` override binds the override port and is never written back. It must not bind the saved port or change the saved file. Pinned by "uses mcpPort instead of the saved port without writing it back" in `src/mcp/manager.test.ts`.
3. A first start that draws a port reserves it and persists it outside the denied band, and a browser guard draw then gets a different port. It must not hand the guard the MCP port. Pinned by "binds and persists a reachable port outside the denied band when the draw lands inside it" in `src/mcp/manager-port.test.ts`.
4. A drawn port whose bind fails is returned to the pool. It must not stay reserved after the failed start. Pinned by "releases the reservation when the drawn port is already occupied" in `src/mcp/manager-port.test.ts`.
5. A taken port records exactly one failure notification and leaves the server down. It must not notify twice or crash. Pinned by "records one failure notification and stays down when the port is taken" in `src/mcp/manager.test.ts`.
6. A browser allocation's release frees only its own ports. It must not free another live launch's ports. Pinned by "frees only its own ports" in `src/browser/e2e-ports.test.ts`.
7. The far-side MCP endpoint's drawn port stays reserved until released. It must not be handed to a remote guard. Pinned by the `allocateBrowserPorts` cases in `src/remote/serve-mcp.test.ts`.

## Assumptions

1. The configured branch binds with no reservation: `src/mcp/manager.ts:157` `: { port: configured, release: () => {} };`.
2. Draws only ever walk within their own range, so a port outside the guard range is never handed out by a draw: `src/browser/e2e-ports.ts:51` `const port = first + ((start + offset) % count);`.
3. The reservation set is module-level and shared by every caller in the process: `src/browser/e2e-ports.ts:30` `const reserved = new Set<number>();`.
4. `dispose` closes the server but never releases the reservation today: `src/mcp/manager.ts:125` `dispose(): void {`.
5. The failure paths already call the reservation's release: `src/mcp/manager.ts:163` `chosen.release();` and `src/mcp/manager.ts:179` `chosen.release();`.

## Existing functionality

1. The reservation result type: `src/browser/e2e-ports.ts:100` `export type ReservedPort = {`.
2. Drawing and reserving a reachable port: `src/browser/e2e-ports.ts:105` `export function reserveReachablePort(): ReservedPort {`.
3. The guard draw that must skip reserved ports: `src/browser/e2e-ports.ts:74` `export function allocateBrowserPorts(): BrowserPorts {`.
4. Choosing between the configured and drawn port: `src/mcp/manager.ts:154` `const configured = override ?? state?.port;`.
5. A free guard-range port and the band draw that normalizes onto it, for tests: `src/mcp/manager-port.test.ts:44` `async function freeBandDraw()`.

## Implementation steps

1. In `src/browser/e2e-ports.ts`, add an exported `reservePort(port)` beside `reserveReachablePort`, returning a `ReservedPort`. It adds the port to `reserved` only when absent and returns a release that deletes the port only when this call added it. Extend the comment above `ReservedPort` to say a caller that already knows its port reserves it through this function. Build command: `$janissary/scripts/run.mjs check-diff`.
2. In `src/mcp/manager.ts`, import `reservePort` and use it for the configured branch of `start` in place of the no-op release object. Add a private field holding the published reservation's release, set it where the server, handler, port, and launch are published, and call and clear it in `dispose`. Leave the three existing failure-path release calls in place. Build command: `$janissary/scripts/run.mjs check-diff`.
3. Add the tests below, then update `product/specs/mcp-server.md`. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. The change has no user interface surface. Its only visible effect is that a `-b` harness's browser no longer fails because its guard drew the MCP port.

## Tests

1. `src/browser/e2e-ports.test.ts`, new `reservePort` describe block. A reserved port is skipped by a guard draw forced onto it (requirement 3). Releasing it hands the next forced draw that port again (requirement 8 at the pool level). A second reservation of an already reserved port, once released, leaves the first in place (requirement 4). A port outside the guard range reserves without throwing and doesn't disturb a guard draw (requirement 9).
2. `src/mcp/manager-port.test.ts`, new describe block for later starts. A saved state naming a free guard-range port starts the manager on that port, and `allocateBrowserPorts()` with the draw forced onto it returns a different guard port (requirements 1 and 3). The same with an `mcpPort` override naming the port (requirement 2). After `dispose`, the forced draw is handed that port again (requirement 8). A saved port that is occupied by another listener leaves the port unreserved, so the forced guard draw gets it (requirement 5).
3. Requirements 6 and 7 share the release call already pinned for the drawn branch by "releases the reservation when the drawn port is already occupied"; the configured branch now passes through that same call, which test 2's occupied-port case covers.

## Out of scope

- The far-side MCP endpoint in `src/remote/serve-mcp.ts`, which already draws and reserves its port.
- Any change to how the port is chosen, saved, or overridden.
- Collisions with ports held by foreign processes, which the guard already reports.

## Verification

Run `$janissary/scripts/run.mjs check-diff` and confirm lint, typecheck, and the server tests pass.

Then start the app in a project that already has `.janissary/mcp.json`, so the server reuses its saved port. Run `mcp` and note the port. Launch several `harness claude -b` tabs. Each browser should start, and no notification should report a guard bind failure on the MCP port. A failure looks like a tab's browser being torn down with a notification naming an address already in use on the port `mcp` reported.
