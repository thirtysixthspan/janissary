# Choose the local MCP port outside the sandbox browser-denied band

**Complexity: 5/10** — ~35 added lines across 2 production files, 6 requirements, 7 test scenarios (p=4.99)

## Goal

On the first start in a project the local MCP server must bind a loopback port that confined harnesses can reach. Today `start()` passes `0` to `listen()` and persists whatever the OS hands back; on macOS roughly one in sixty assignments lands in `65280–65535`, the band the Seatbelt harness profile denies to every workspaced spawn. The saved port then stays unreachable for the life of the project and the only symptom is a harness tool timeout. After this change a first start draws a port from the same below-band range the browser guards use, reserves it in the same in-process pool, and persists it exactly as before. Saved ports and hand-edited `mcpPort` overrides remain authoritative, so no existing project moves.

## Requirements

1. With neither a saved port nor an `mcpPort` override, the server binds a port below `BROWSER_PORT_BAND_FIRST` instead of passing `0` to `listen()` ("stop passing 0 to server.listen and instead draw and bind a loopback port below BROWSER_PORT_BAND_FIRST").
2. That port is drawn from the guard range below the band ("draw and bind a loopback port below BROWSER_PORT_BAND_FIRST from src/sandbox/browser/ports.ts").
3. The drawn port is reserved in the same in-process pool browser guard ports come from, so a guard handed out by `allocateBrowserPorts` can never be that port ("reserving it in-process so it cannot collide with a browser guard port drawn by src/browser/e2e-ports.ts").
4. A draw that lands inside the denied band still yields a bound port outside it ("forces a draw inside the band and asserts the persisted port is outside it").
5. A first start whose drawn port cannot be bound gives the reservation back, so a refused start does not drain the guard pool.
6. The URL later handed to `harnessSpawnEnv` names a port outside the denied band and is therefore reachable from a confined harness ("the URL handed to harnessSpawnEnv is reachable under the sandbox profile").

## Design decisions

- Draw from the existing guard range, not a new one: guard ports are defined as everything below the denied band and are exactly the ports a confined harness can reach (`src/browser/e2e-ports.ts:19`, `BROWSER_PORT_BAND_FIRST` at `src/sandbox/browser/ports.ts:13`).
- Expose a reservation function from `src/browser/e2e-ports.ts` instead of creating a second reservation set. A separate set would let a browser guard claim the MCP port; sharing `reserved` is the whole collision guarantee.
- Normalize the draw with the existing `claimPort` walk, so a draw landing in the band resolves to a port below it rather than carrying a band port into the MCP URL. This is the same rule guard draws already follow (`src/browser/e2e-ports.test.ts:75`).
- Keep `mcpPort` and saved ports authoritative. Drawing is only the no-state fallback, so saved projects, overrides, and the occupied-port failure path are untouched.
- Hold the reservation for the process life once the listener is published: the port is persisted and reused, so releasing it would let a browser take a port the next start expects. Release it only when binding fails, when the manager is disposed before publication, or when persisting fails.
- No new config key, no port range constant, no protocol or framing change.

## Preserved behavior

1. A first start persists the port and token at mode `0600` and a later start reuses both, and it must not rewrite the saved state when reusing it. The existing test `persists the chosen port and token with mode 0600 and reuses them on the next start` pins this.
2. A hand-edited `mcpPort` override binds that exact port on start and is never written back to the state file, and it must not replace the saved port on disk. The existing test `uses mcpPort instead of the saved port without writing it back` pins this.
3. A port already taken by another listener leaves the manager down with one `mcp-failed` notification carrying the verbatim `EADDRINUSE` reason, and it must not publish a URL or send a second notification. The existing test `records one failure notification and stays down when the port is taken` pins this.
4. The server keeps answering a `tools/list` call with exactly `question`, and it must not expose any added tool. The existing test `serves a tools/list call that returns exactly question` pins this.

## Assumptions

1. `src/sandbox/browser/ports.ts:13` — `export const BROWSER_PORT_BAND_FIRST = 65_280`; `src/sandbox/browser/ports.ts:17` — `isBrowserBandPort`; the harness profile denies that whole band statically through `BROWSER_PORT_BAND_DENY` (`src/sandbox/profile.ts:194`), so a port outside it is reachable by construction.
2. `src/browser/e2e-ports.ts:30` — `const reserved = new Set<number>();` is one in-process pool, and `claimPort` (`src/browser/e2e-ports.ts:48`) skips any port in it; a new claimant can join without changing the browser path.
3. `src/browser/e2e-ports.ts:28` — `const GUARD_COUNT = PORT_COUNT - BROWSER_PORT_BAND_COUNT;` defines guard ports as the contiguous interval below the band, so a guard-range draw is a reachable draw.
4. `src/mcp/manager.ts:141` — `const port = getConfig().mcpPort ?? state?.port ?? 0;` is the only fallback to port 0; saved state and the config override are the other two arms and stay unchanged.
5. `src/mcp/manager.ts:149` — `if (!state) saveState(this.stateFile, { port: listener.port, token });` persists the listener's actual port only when there was no saved state, which covers a drawn port without a new persistence path.
6. `src/harness/scratch-dir.ts:53` — `JANISSARY_MCP_URL: options.mcp.url` is fed from `mcp.localLaunch()` (`src/harness/tab-spawn.ts:49`), so the URL the manager publishes is the URL the harness receives.

## Existing functionality

1. `claimPort` at `src/browser/e2e-ports.ts:48` already normalizes a draw into a range and walks to the first unreserved port; the new reservation reuses it rather than duplicating the walk.
2. The `reserved` set at `src/browser/e2e-ports.ts:30` is the single in-process collision boundary; the new claimant joins it.
3. `exhausted` at `src/browser/e2e-ports.ts:60` already builds the "no free … port between …" error for a used-up range; the new claimant reuses it.
4. `listen` at `src/mcp/manager.ts:62` binds a caller-supplied port on loopback and returns the bound address; it needs no change to accept a drawn port.
5. `loadState` and `saveState` at `src/mcp/manager.ts:45` and `src/mcp/manager.ts:57` already persist and reload port plus token at mode `0600`.
6. `harnessSpawnEnv` at `src/harness/scratch-dir.ts:42` is the real helper that places the published URL into the harness environment, usable from a test without starting a browser.

## Implementation steps

1. In `src/browser/e2e-ports.ts`, add an exported `reserveReachablePort()` returning the claimed port and a `release()` that deletes it from `reserved`. Draw with `randomInt(FIRST_PORT, FIRST_PORT + GUARD_COUNT)` and claim through the existing `claimPort`/`exhausted` pair, so a band-landing draw is normalized below the band. Document in place why the MCP listener shares this set with browser guards. Build command: `$janissary/scripts/run.mjs check-diff`.
2. In `src/mcp/manager.ts`, import the new reservation and change only the no-state arm of `start()`: derive `configured` from `getConfig().mcpPort ?? state?.port`, reserve a reachable port when it is undefined, and pass the chosen port to `listen` instead of `0`. Pass a configured port through unchanged. Release the reservation when `listen` throws, when `saveState` throws, and when the manager was disposed before publication; keep it held on success. Leave `saveState`, URL construction, failure notification, and `dispose` as they are. Build command: `$janissary/scripts/run.mjs check-diff`.
3. In a new focused module `src/mcp/manager-port.test.ts`, add a deterministic `randomInt` seam (a partial `node:crypto` mock that keeps `randomBytes` and `timingSafeEqual` real) with a default draw, then add the cases in Tests. Leave `src/mcp/manager.test.ts` unchanged: the added cases would push it past the 200-line limit, so they are extracted into their own file per `ai/guidelines/code-guidelines.md` rather than compacted. Build command: `$janissary/scripts/run.mjs check-diff`.
4. Update `product/specs/mcp-server.md` so the first-start port paragraph states that the chosen loopback port lies outside the band the sandbox denies to confined harnesses, and that saved ports and `mcpPort` overrides keep their current authority. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. No new or changed screen, control, key binding, or layout. The `mcp` command keeps printing the same `url: http://127.0.0.1:<port>/mcp` and `port: <port>` lines; only the number can differ, and no new state is shown.

## Tests

- `src/mcp/manager-port.test.ts` — with `randomInt` forced to a value inside the denied band, the first start persists and publishes a port outside the band: assert the saved port is not `isBrowserBandPort`, is below `BROWSER_PORT_BAND_FIRST`, and that the URL passed through the real `harnessSpawnEnv` to `JANISSARY_MCP_URL` carries that same outside-band port (requirements 1, 2, 4, 6).
- `src/mcp/manager-port.test.ts` — after that start, a browser guard drawn from the same forced value is not the MCP port, proving the shared reservation is in force (requirement 3).
- `src/mcp/manager-port.test.ts` — when the drawn port is already occupied and the start fails, a browser guard can claim that port afterwards, proving the refused start released its reservation (requirement 5).
- The existing persistence, `mcpPort` override, occupied-port, and `tools/list` cases run unchanged and pin Preserved behavior 1–4.

## Out of scope

- No new config key, port range, or CLI flag; no change to `--no-mcp`/`--offline` behavior.
- No change to token minting, the request guard, the `question` tool, or the remote MCP path.
- No migration of ports already persisted in a project: a saved band port is still used verbatim.
- No retry against ports held by other processes beyond today's single failed bind and notification.

## Verification

`$janissary/scripts/run.mjs check-diff` must pass with no lint, typecheck, or test regression. For a concrete end-to-end check on macOS, run a fresh project with no `.janissary/mcp.json`, start Janissary, and run `mcp`: the printed port must be below `65280`, and opening the printed URL with the token from a workspaced, sandboxed harness must answer a `tools/list` call — a port in `65280–65535` or a harness timeout shows the change did not take effect.
