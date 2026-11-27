# feat: run the local MCP listener with persisted port and token

**Complexity: 5/10** — ~120 added lines, 3 edited files, 10 requirements, 7 scenarios (p=5.70)

## Goal

Start the MCP server inside the main application process on loopback only, with a port and bearer token persisted under `.janissary/`, a status API for the `mcp` command, and a failure path that records one notification while Janissary keeps running. The manager mounts the guard and handler built earlier and injects the local executor, so this is the point where the server actually answers calls.

Source: `./product/plans/complete/janissary-mcp-server.md`. Depends on `janissary-mcp-server-1-mcp-core.md`, `janissary-mcp-server-3-config-and-notifications.md`, and `janissary-mcp-server-4-local-question-executor.md`.

## Requirements

1. The MCP server runs inside the main application process — feature text: "setup a MCP server for janissary run from the main application process - local only."
2. The MCP server listens on loopback only — user answer: "Plain HTTP on loopback": "Serve HTTP on 127.0.0.1 only".
3. The MCP server serves plain HTTP, with no TLS certificate — user answer: "Plain HTTP on loopback": "Serve HTTP on 127.0.0.1 only".
4. The token is persisted under `.janissary/` and survives a Janissary restart — user answer: "Stable port + persisted token".
5. On its first start a project picks a free loopback port and saves it beside the token in `.janissary/` — user answer: "Pick free once, persist".
6. Every later start of that project reuses the saved port — user answer: "then reuses it on every later start."
7. A port that is already taken stops the MCP server from starting — user answer: "If the port is taken, the server reports it and doesn't start."
8. A server that cannot start leaves Janissary running normally — user answer: "Notify; launch w/o MCP": "Janissary starts normally".
9. A server that cannot start records one notification `MCP server failed to start: <reason>` — user answer: "records one notification, e.g. `MCP server failed to start: <reason>`." This requirement is shared with `janissary-mcp-server-3-config-and-notifications.md`, which defines the kind and its text.
10. A harness launched while the server is not running receives no MCP flags and no MCP environment variables — user answer: "Harnesses launched while it's down get no MCP flags or variables." This requirement is shared with `janissary-mcp-server-7-harness-spawn-env.md`, which applies the rule at launch.

Requirements 2 and 3 are enforced by the guard and SDK mount from `janissary-mcp-server-1-mcp-core.md`; this subplan supplies the bound socket and the token it checks against. Requirement 13 ("a `tools/list` call returns exactly `question`") is shared with that subplan's registry.

## Design decisions

- `McpManager` owns the listener, the state file and the executor injection; it is a manager on `Managers` with a `dispose()` so its teardown lives with its acquisition. The listener is registered in `MANAGER_DISPOSE_ORDER` ahead of `questions`, so it stops before questions are cancelled.
- The state file `.janissary/mcp.json` holds `{ port, token }` and is written through `atomicWriteFile` (`src/atomic-write.ts:9`) with mode `0o600`. Picking a port means listening on `127.0.0.1:0` once and reading the assigned port; mints the token with `makeToken` (`src/security.ts:5`).
- `mcpPort` from config overrides the saved port, but is not written back into the state file; an invalid value decodes as absent, so the saved port applies.
- A listen or state-file failure records exactly one `mcp-failed` notification with `MCP server failed to start: <reason>` and leaves `localLaunch()` undefined while Janissary runs normally.
- The server binds `127.0.0.1` only and serves plain HTTP; the remote hop is encrypted by SSH, so no TLS is used. A present-but-wrong Origin, a missing or wrong bearer token, and a non-JSON POST are refused by the guard, not by a second check here.

## Preserved behavior

None found.

## Assumptions

1. Token minting already exists — `src/security.ts:5` `export function makeToken()`.
2. Atomic file writes accept a create mode — `src/atomic-write.ts:9` `export function atomicWriteFile(`.
3. `mcpPort` decodes as an optional bounded integer — `src/config.ts` `mcpPort?: number` and `src/config-decode.ts` `decodeConfig(`, both added by `janissary-mcp-server-3-config-and-notifications.md`.
4. The `mcp-failed` notification kind and its `detail` rendering already exist — `src/notifications/index.ts:8` `export type NotificationEventType =` and `src/notifications/format.ts:43` `notificationText(`.
5. A manager added to the registry must also be placed in the dispose order — `src/managers.ts:137` `type UnorderedManager = Exclude<keyof Managers, (typeof MANAGER_DISPOSE_ORDER)[number]>;`.
6. Label-or-alias tab lookup is the shared way to address a tab — `src/tab/lookup.ts:25` `export function byLabelOrAlias(`.
7. The guard wraps the handler and checks Origin and token against a supplied token — `src/mcp/guard.ts` (added by `janissary-mcp-server-1-mcp-core.md`).

## Existing functionality

1. Atomic file writes with a create mode — `src/atomic-write.ts:9` `export function atomicWriteFile(`.
2. Token minting — `src/security.ts:5` `export function makeToken()`.
3. The manager registry and its compile-time complete dispose order — `src/managers.ts:73` `export type Managers =` and `src/managers.ts:95` `export const MANAGER_DISPOSE_ORDER =`.
4. The local question executor this manager injects — `src/mcp/executor.ts` (added by `janissary-mcp-server-4-local-question-executor.md`).
5. The SDK handler factory and HTTP guard this manager mounts — `src/mcp/handler.ts` and `src/mcp/guard.ts` (added by `janissary-mcp-server-1-mcp-core.md`).
6. The pending-question construction site where a new manager is created — `src/controller/create-managers.ts:59` `managers.questions = new Questions(`.

## Implementation steps

1. Create `src/mcp/manager.ts` with the `McpManager` class. It reads and writes `.janissary/mcp.json` (`{ port, token }`) through `atomicWriteFile` with mode `0o600`, mints the token with `makeToken`, and on first start picks a free port by listening on `127.0.0.1:0`. An `mcpPort` override from `getConfig()` replaces the saved port after decode. Build and check with `$janissary/scripts/run.mjs check-diff`.
2. In the same class, start a `node:http` server bound to `127.0.0.1:<port>` serving the guard and handler at path `/mcp`, with the local executor from `janissary-mcp-server-4-local-question-executor.md` as the injected executor. Expose `status()` giving running with url `http://127.0.0.1:<port>/mcp` and port, or not running with a reason; `localLaunch()` giving `{ url, token }` or `undefined` while not running; and `dispose()` closing the listener. On a listen or state-file failure, record one `mcp-failed` notification whose detail is `MCP server failed to start: <reason>` and leave `localLaunch()` undefined. Build and check with `$janissary/scripts/run.mjs check-diff`.
3. Register `mcp` in the `ManagerRegistry` type in `src/managers.ts` and add it to `MANAGER_DISPOSE_ORDER` ahead of `questions`, so the listener stops before questions are cancelled. Construct `managers.mcp` in `createManagers` (`src/controller/create-managers.ts:59`) after `questions`. Update `product/specs/agent-questions.md` § Cancellation to name the MCP endpoint instead of the "no shell command, external HTTP endpoint" sentence. Build and check with `$janissary/scripts/run.mjs check-diff`.

Every step leaves the tree green: the new manager is optional to consumers until later subplans call `localLaunch()`. Every touched file stays under the 200-line `max-lines` limit. Relative imports in `src/` carry the `.js` extension per NodeNext.

## UI design

1. No new user-visible surface. The server's existence is reported by the `mcp` command in `janissary-mcp-server-10-mcp-command.md` and by the metadata flag in `janissary-mcp-server-8-metadata-flag-and-focus.md`.

## Tests

- `src/mcp/manager.test.ts`, using a real loopback listener (the `src/http-test-fixture.ts` pattern; skip when loopback bind or connect is denied, like the existing socket suites):
  - the first start writes `.janissary/mcp.json` with mode `0o600`, and a second start reuses its port and token (requirements 4, 5, 6);
  - `mcpPort` overrides the saved port (requirement 7, with the config key from `janissary-mcp-server-3-config-and-notifications.md`);
  - a taken port records one `mcp-failed` notification and leaves `localLaunch()` undefined (requirements 7, 8, 9, 10);
  - a `tools/list` call returns exactly `question` (requirement 13, shared with `janissary-mcp-server-1-mcp-core.md`).

## Out of scope

- Harness launch injection of the URL and token: `janissary-mcp-server-6-harness-launch-args.md` and `janissary-mcp-server-7-harness-spawn-env.md`.
- The `mcp` status command: `janissary-mcp-server-10-mcp-command.md`.
- Remote endpoint, relay frames and grace window: subplans 11–14.
- TLS or a non-loopback bind.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after each step. Then start the app and observe that it starts normally with the MCP server up; read `<project>/.janissary/mcp.json` and confirm a port and token with mode `0o600`, restart the app and confirm the same values are reused. A failure is a Janissary that refuses to start because the MCP port was taken, a state file that is world-readable, or a missing failure notification.
