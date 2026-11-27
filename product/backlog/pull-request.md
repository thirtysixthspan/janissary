<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Prove channel close invokes the relay cleanup instead of calling `clear()` directly in the test.

Existing Issue: The `mcp-relay.test.ts` case titled "clears the map on channel close so a re-send registers a fresh question" calls `relay.clear()` itself, and no test anywhere invokes or spies on the `onFinalClose` handler that `src/remote/entry-factory.ts` wires to it across the five close paths in `src/remote/channel/index.ts`. Severity: 4/10

Existing Risk: 4/10 - A future close path that forgets `onFinalClose` would leave settled call ids in the relay across a session boundary, so a re-send in the next session replays a stale answer instead of registering a fresh question.

Proposal Risk: 1/10 - A spy-based channel test plus one relay test driven through a real close covers all five paths with no production change.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "verify channel-close cleanup wiring for the MCP relay". In `src/remote/channel/index.test.ts`, add a test that constructs a `RemoteChannel` with an `onFinalClose` spy and asserts it fires once on each final path: `close()`, `disconnect()`, `finish()`, `fail()` driven by a malformed or unknown frame, and `closed()` with no session id; also assert it does not fire on `closed()` with a session id (the reconnect path) or on `replaceTransport()`. In `src/remote/mcp-relay.test.ts`, replace the direct `relay.clear()` call with a close driven through a `RemoteChannel` wired to `mcpRelay.clear()` so the test matches its title. Keep `clear()` idempotent so the double invocation from `finish()` followed by `closeAfterShutdown()` stays harmless.
