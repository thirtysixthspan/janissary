# Never persist an mcpPort override as the saved MCP port on a first start

**Complexity: 3/10** — 7 requirements and 3 test scenarios over ~15 added lines in 1 file (p=4.47)

## Goal

When `.janissary/mcp.json` does not exist and `mcpPort` is set, `McpManager.start` in `src/mcp/manager.ts` binds the override and then saves `{ port: <override>, token }`. The hand-edited port silently becomes the project's saved port and keeps being used after the key is removed, even when it sits in the 65280 to 65535 band the sandbox denies to confined harnesses. The MCP server plan says an override binds "without being written back", and the saved port is meant to come from the reachable first-start draw. This fix makes the override a pure runtime choice: a first start under an override saves only the token, and the first later start without an override draws a reachable port and saves it beside that token.

## Requirements

1. "persist the token without a port": a first start with no state file and `mcpPort` set binds the override and writes a state file holding the token and no port.
2. "make `port` optional in `State` and `decodeState`, so a token-only file is valid": a state file holding a token and no port is read as valid saved state rather than reported as `invalid MCP state file`.
3. "reuses the first start's token": a start that reads a token-only state file serves with that token.
4. "leave the port to be drawn with `reserveReachablePort()`": a start with a token-only state file and no `mcpPort` binds a freshly drawn port below `BROWSER_PORT_BAND_FIRST`.
5. "saved on the first start that runs without an override": that start writes the drawn port beside the existing token into `.janissary/mcp.json`.
6. A start with a token-only state file and `mcpPort` still set binds the override and leaves the file unchanged.
7. "`product/specs/mcp-server.md` should say an override is never saved": the Server section states that an `mcpPort` override is never saved, including on a first start.

## Design decisions

- `State` keeps one shape with `port` optional, so a token-only file and a full file go through the same `loadState` and `decodeState` path (Assumption 2). A `port` key that is present but not a whole number from 1 to 65535 still makes the file invalid, so only an absent key means "no saved port".
- What to write after a successful bind is decided by one small pure helper beside `saveState`, given the loaded state, the override, the bound port and the token. Under an override it writes the token alone only when there was no state file, and otherwise writes nothing. Without an override it writes the bound port and token only when the loaded state has no port, which covers both the missing file and the token-only file. A start that reads a full state file writes nothing, as today (Assumption 3).
- The bind order is unchanged: `getConfig().mcpPort ?? state?.port` chooses a configured port, and `reserveReachablePort()` runs only when neither exists, so a token-only file without an override reaches the reachable draw with no new branch (Assumption 1).
- Reserving a saved or overridden port in the shared pool is a separate backlog entry and is not touched here; the configured branch keeps its no-op `release`.
- The application-config spec's `mcpPort` row already says the key takes precedence over the persisted port; it gains a clause that the override is never written into the MCP state file, so the two specs agree.

## Preserved behavior

1. A first start with no override persists the drawn port and token with mode `0600`, and a second start reuses both without rewriting the file. A second start must not draw a new port or mint a new token. Pinned by "persists the chosen port and token with mode 0600 and reuses them on the next start" in `src/mcp/manager.test.ts`.
2. With a full saved state, `mcpPort` binds its exact port and reuses the saved token. The state file's text must not change. Pinned by "uses mcpPort instead of the saved port without writing it back" in `src/mcp/manager.test.ts`.
3. A saved port that is already taken leaves the server down with one `mcp-failed` notification naming `EADDRINUSE`. The manager must not fall back to another port or record a second notification. Pinned by "records one failure notification and stays down when the port is taken" in `src/mcp/manager.test.ts`.
4. A first-start draw that lands in the denied band binds and saves a port below it, and a guard cannot take it. The saved port must not lie inside the band. Pinned by "binds and persists a reachable port outside the denied band when the draw lands inside it" in `src/mcp/manager-port.test.ts`.
5. A drawn port that cannot be bound is returned to the shared pool. The failed start must not keep the reservation. Pinned by "releases the reservation when the drawn port is already occupied" in `src/mcp/manager-port.test.ts`.

## Assumptions

1. The override wins over the saved port, and the reachable draw runs only when neither is set: `src/mcp/manager.ts:142-145` "`const configured = getConfig().mcpPort ?? state?.port;`".
2. Every state file is decoded by one function that today requires a numeric port: `src/mcp/manager.ts:39` "`if (typeof port !== 'number' || !Number.isSafeInteger(port) || port < 1 || port > 65_535) return undefined;`".
3. Today the file is written whenever there was no state, whatever port was bound: `src/mcp/manager.ts:155` "`if (!state) saveState(this.stateFile, { port: listener.port, token });`".
4. Nothing else reads `.janissary/mcp.json`; the manager builds its path and is its only reader and writer: `src/mcp/manager.ts:99` "`this.stateFile = path.join(projectDir, '.janissary', 'mcp.json');`".
5. `mcpPort` decodes only as a whole number from 1 to 65535, so a defined override is always a real port: `src/config-decode.ts:126` "`const mcpPort = portValue(record.mcpPort);`".

## Existing functionality

1. The reachable first-start draw: `src/browser/e2e-ports.ts` "`export function reserveReachablePort(): ReservedPort`".
2. The atomic, mode-`0600` state write: `src/mcp/manager.ts:58` "`function saveState(file: string, state: State): void {`".
3. The fixture managers and loopback-reachability gate the manager tests already use: `src/mcp/manager.test.ts:17` "`function fixtureManagers(): Managers {`".
4. The band's first port for the reachability assertion: `src/sandbox/browser/ports.ts:13` "`export const BROWSER_PORT_BAND_FIRST = 65_280;`".

## Implementation steps

1. In `src/mcp/manager.ts`, make `port` optional on `State`, let `decodeState` accept a missing `port` while still rejecting a present invalid one, and add a pure helper beside `saveState` that returns the state to write after a bind, or nothing, following the design decisions. In `start`, keep the override in its own local so the helper can see it, and replace the `if (!state) saveState(...)` line with a call through the helper inside the same try block, so a persistence failure still closes the listener and releases the reservation. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Add the tests below to `src/mcp/manager.test.ts`, then update the Server section of `product/specs/mcp-server.md` and the `mcpPort` row of `product/specs/application-config.md`. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. The `mcp` command and the harness launch environment still report whatever port the server bound, and nothing the user sees changes apart from which port a later start without the override uses.

## Tests

- `src/mcp/manager.test.ts`, "saves only the token when a first start binds mcpPort, and draws a reachable port once it is removed": with no state file, set `mcpPort` to a free port inside the denied band, start, and assert the server runs on the override and `mcp.json` holds the token and no port (Requirement 1). Dispose, clear `mcpPort`, start again, and assert the port is not the override and lies below `BROWSER_PORT_BAND_FIRST` (Requirement 4), the token is the first start's (Requirement 3), and `mcp.json` now holds that port and token (Requirement 5). Using a band port makes "not the override" deterministic, because the reachable draw can never land there.
- `src/mcp/manager.test.ts`, "binds mcpPort over a token-only state file without changing it": write a token-only state file, set `mcpPort`, start, and assert the server runs on the override with the saved token (Requirements 2 and 3) and the file's text is unchanged (Requirement 6).

## Out of scope

Reserving a saved or overridden port in the shared pool on every start is a separate backlog entry. A hand-edited `mcp.json` can still pin any valid port, including one in the denied band, and is reused verbatim. The failure text for an unreadable or corrupt state file, and the failure notification path, are unchanged.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then run `npx vitest run src/mcp/manager.test.ts src/mcp/manager-port.test.ts`. The two new cases pass beside the existing reuse, override, taken-port and band cases; a failure looks like `mcp.json` holding the override's port after the first start, or the second start binding the override again.

For an end-to-end check, in a scratch project with no `.janissary/mcp.json`, add `"mcpPort": 65300` to `.janissary/config.json` and start `node bin/janus.mjs --no-open <dir>`. Run `mcp` in the app and see it report port 65300, then read `.janissary/mcp.json` and see only a `token` key. Quit, delete the `mcpPort` key, start again, and see `mcp` report a port below 65280 that now appears in `mcp.json` beside the same token. A failure looks like `mcp.json` containing `"port": 65300` after the first run, or the second run still serving on 65300.
