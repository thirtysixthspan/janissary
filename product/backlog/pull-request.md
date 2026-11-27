<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Add a remote-launch test that exercises the false-when-server-down MCP decision instead of passing the flag by hand.

Existing Issue: The two spawn-MCP-flag tests added to `src/remote/manager.test.ts` call `createRemotePtySession` with a literal `mcp: false` or `mcp: true`, so they check pass-through into the spawn frame but never exercise the `mcp.enabled` decision in `HarnessTabSpawn.spawnTab` that the spec says must be false when the local server is down. Severity: 4/10

Existing Risk: 4/10 - A regression that sends `mcp: true` from a launch with no local MCP server would pass the suite and only surface as a remote harness pointed at an endpoint no local listener supports.

Proposal Risk: 1/10 - One focused assertion on the existing remote-launch fixture in `src/harness/tab-spawn.test.ts` closes the gap without touching production code.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "cover the remote MCP decision when the local server is down". In `src/harness/tab-spawn.test.ts`, extend the existing remote-launch fixture (`withMcp(managers, undefined)` together with `remoteManagers`) with a case that runs a harness on a remote address and asserts the third argument of `registerRemotePty` carries `mcp: false` when `localLaunch()` returns undefined and when `--offline` is set, and a second case with `withMcp(managers, MCP)` asserting `mcp: true` is forwarded. Keep the direct `createRemotePtySession` tests in `src/remote/manager.test.ts` as the lower-level pass-through check, but rename their titles so they no longer claim to test the launch decision or the server-down rule. The local-server-down decision is already pinned for local launches in `src/harness/tab-spawn.test.ts`; reuse that fixture shape rather than inventing a new one.


* Prove channel close invokes the relay cleanup instead of calling `clear()` directly in the test.

Existing Issue: The `mcp-relay.test.ts` case titled "clears the map on channel close so a re-send registers a fresh question" calls `relay.clear()` itself, and no test anywhere invokes or spies on the `onFinalClose` handler that `src/remote/entry-factory.ts` wires to it across the five close paths in `src/remote/channel/index.ts`. Severity: 4/10

Existing Risk: 4/10 - A future close path that forgets `onFinalClose` would leave settled call ids in the relay across a session boundary, so a re-send in the next session replays a stale answer instead of registering a fresh question.

Proposal Risk: 1/10 - A spy-based channel test plus one relay test driven through a real close covers all five paths with no production change.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "verify channel-close cleanup wiring for the MCP relay". In `src/remote/channel/index.test.ts`, add a test that constructs a `RemoteChannel` with an `onFinalClose` spy and asserts it fires once on each final path: `close()`, `disconnect()`, `finish()`, `fail()` driven by a malformed or unknown frame, and `closed()` with no session id; also assert it does not fire on `closed()` with a session id (the reconnect path) or on `replaceTransport()`. In `src/remote/mcp-relay.test.ts`, replace the direct `relay.clear()` call with a close driven through a `RemoteChannel` wired to `mcpRelay.clear()` so the test matches its title. Keep `clear()` idempotent so the double invocation from `finish()` followed by `closeAfterShutdown()` stays harmless.
