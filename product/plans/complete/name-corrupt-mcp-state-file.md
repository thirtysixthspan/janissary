# Name the MCP state file and its remedy when it is corrupt or unreadable

**Complexity: 2/10** — 7 requirements and 2 test scenarios over ~4 added lines in 1 file (p=4.11)

## Goal

A `.janissary/mcp.json` that fails to parse or decode keeps the local MCP server down on every start with the bare reason `invalid MCP state file`, and a file that exists but cannot be read gives only the raw filesystem error. Neither names the file or says what to do, and the user sees exactly that text in the `mcp-failed` notification and in the `mcp` command's `reason:` line, so MCP stays off for every harness in the project until someone guesses which file to delete. This fix makes both reasons name the full path of the state file and tell the user to delete it and restart, and documents the case and its exact text in `product/specs/mcp-server.md`.

## Requirements

1. "change `loadState`'s decode-failure ... reason to include the state file path": a state file that is not valid JSON, or that is JSON without a valid token and port, makes the server's failure reason read `invalid MCP state file <path>; delete it and restart Janissary to replace it`, where `<path>` is the state file's full path.
2. "change `loadState`'s ... read-failure reasons to include the state file path": a state file that exists but cannot be read makes the reason read `unreadable MCP state file <path> (<error>); delete it and restart Janissary to replace it`, where `<error>` is the filesystem error message verbatim.
3. "asserts one `mcp-failed` notification whose message contains the path": either failure records exactly one `mcp-failed` notification reading `MCP server failed to start: <reason>`.
4. "`status()` reports the same reason": after either failure `status()` reports `not running` with that same reason, which the `mcp` command prints as its `reason:` line.
5. "stating that the server stays down and Janissary runs normally": after either failure the server does not listen and offers no launch config to harnesses.
6. The failing state file is left exactly as it was found; the server does not overwrite or delete it.
7. "add the case to the Server section of `product/specs/mcp-server.md` with the exact text": the Server section states both reasons verbatim, that the server stays down while Janissary runs normally, and that deleting the file lets the next start pick a port and token as on a first start.

## Design decisions

- The remedy is one shared clause, `delete it and restart Janissary to replace it`, appended to both reasons. The file is read only at start (Assumption 2), so a restart is needed; "replace it" stays true with or without an `mcpPort` override, because every start without a state file writes a new one (Assumption 3), whereas "pick a new port" would be false under an override.
- The read-failure reason keeps the filesystem error verbatim in parentheses after the path. Some errors, such as `EISDIR`, carry no path of their own, and others, such as `EACCES`, already do; prefixing the path keeps every case uniform at the cost of a repeated path in the second kind.
- A missing file (`ENOENT`) is still not a failure; it is the normal first start (Assumption 1).
- The failure keeps flowing through the existing `throw` in `start` and `recordFailure`, so the notification count, its `janus` label and its `MCP server failed to start: ` prefix are unchanged. `recordFailure` itself is not touched; a separate backlog entry covers it.

## Preserved behavior

1. A saved port that is already taken leaves the server down and records exactly one `mcp-failed` notification on the `janus` label whose message is `MCP server failed to start: <reason>` with `EADDRINUSE` in the reason. It must not record a second notification or fall back to another port. Pinned by "records one failure notification and stays down when the port is taken" in `src/mcp/manager.test.ts`.
2. A valid saved state file is reused on the next start. A valid file must not be reported as invalid or rewritten. Pinned by "persists the chosen port and token with mode 0600 and reuses them on the next start" in `src/mcp/manager.test.ts`.
3. A token-only state file is valid saved state. It must not be reported as an invalid state file. Pinned by "binds mcpPort over a token-only state file without changing it" in `src/mcp/manager.test.ts`.

## Assumptions

1. A missing state file is a normal first start, not a failure: `src/mcp/manager.ts:55-56` "`const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT';`".
2. The state file is read only when the manager starts, and a failure there is recorded once and never retried: `src/mcp/manager.ts:112` "`this.ready = this.start(managers);`".
3. Every start that bound a port without a saved state file writes a new one: `src/mcp/manager.ts:70-71` "`if (override !== undefined) return state ? undefined : { token };`".
4. The state file's full path is already held by the manager and passed to `loadState`: `src/mcp/manager.ts:111` "`this.stateFile = path.join(projectDir, '.janissary', 'mcp.json');`".
5. The failure reason is what both the notification and `status()` report: `src/mcp/manager.ts:139` "``const detail = `MCP server failed to start: ${this.failure}`;``".

## Existing functionality

1. The decode-failure return the fix changes: `src/mcp/manager.ts:59` "`return state ? { state } : { error: 'invalid MCP state file' };`".
2. The read-failure return the fix changes: `src/mcp/manager.ts:56` "`return missing ? {} : { error: reasonOf(error) };`".
3. The error-to-message helper for the verbatim filesystem error: `src/mcp/manager.ts:29` "`function reasonOf(error: unknown): string {`".
4. The mocked notification delivery the manager tests assert on: `src/mcp/manager.test.ts:14` "`vi.mock('../notifications/deliver.js', () => ({ deliverNotification: vi.fn() }));`".
5. The fixture managers the manager tests start against: `src/mcp/manager.test.ts:18` "`function fixtureManagers(): Managers {`".

## Implementation steps

1. In `src/mcp/manager.ts`, add a module constant holding the shared remedy clause beside the other constants, and change the two non-`ENOENT` returns of `loadState` to build the reasons in Requirements 1 and 2 from its `file` argument, `reasonOf(error)` and that clause. Nothing else in the file changes. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Add the tests below to `src/mcp/manager.test.ts`, then add the corrupt and unreadable state file case to the Server section of `product/specs/mcp-server.md`. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. The `mcp-failed` notification's text gains the state file's path and the remedy, for example `MCP server failed to start: invalid MCP state file /home/me/project/.janissary/mcp.json; delete it and restart Janissary to replace it`. Its event, label, alert defaults and placement are unchanged.
2. The `mcp` command's `reason:` line shows the same reason. The two-line `not running` block is otherwise unchanged.

## Tests

- `src/mcp/manager.test.ts`, "names the state file and the remedy when it is not valid JSON": write truncated JSON to `.janissary/mcp.json`, start, and assert `status()` is `not running` with the exact reason from Requirement 1 (Requirements 1 and 4), no launch config (Requirement 5), exactly one `mcp-failed` notification whose message is `MCP server failed to start: <reason>` (Requirement 3), and the file's text unchanged (Requirement 6).
- `src/mcp/manager.test.ts`, "names the state file and the remedy when it cannot be read": create `.janissary/mcp.json` as a directory, start, and assert the reason begins with `unreadable MCP state file <path> (`, contains `EISDIR`, and ends with `); delete it and restart Janissary to replace it` (Requirement 2), plus no launch config, exactly one matching `mcp-failed` notification, and the directory still present (Requirements 3, 5 and 6).

Neither test binds a port, so both run outside the loopback-reachability gate.

## Out of scope

`recordFailure`'s forged `Managers` and `Tab` fallback is a separate backlog entry and is not touched. The server still does not retry, repair, or delete a bad state file on its own, and the `mcp` command still cannot restart it. The generic `mcp-failed` description in `product/specs/notifications.md` already covers any reason verbatim and is unchanged. No help page or user documentation changes.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then, in a scratch project, write `{"port":` into `.janissary/mcp.json` and start `node bin/janus.mjs --no-open <dir>`. Open the URL it prints, and see a notification reading `MCP server failed to start: invalid MCP state file <dir>/.janissary/mcp.json; delete it and restart Janissary to replace it`, while every other tab works normally. Run `mcp` and see `status: not running` with the same reason. Quit, delete the file, start again, and see `mcp` report `status: running` with a new `mcp.json` written. A failure looks like the bare `invalid MCP state file` with no path, two notifications, or the bad file silently overwritten on the first run.
