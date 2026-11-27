<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Carry the spawn MCP flag through the far-side decoder so a remote harness actually starts its endpoint.

Existing Issue: The commit adds `mcp` to the spawn frame in `src/remote/pty-session.ts`, but `decodeSpawn` in `src/remote/frame/decode-lifecycle.ts` neither validates nor returns `mcp`, so every spawn the far side decodes drops the flag before `RemoteProcesses.spawnPty` can read it. Severity: 9/10

Existing Risk: 9/10 - The far-side MCP endpoint is never created, no harness receives MCP variables, no `mcp-call` is ever emitted, and the spec claim that the launch starts an endpoint is false for every real remote launch.

Proposal Risk: 2/10 - The decoder change is one optional boolean mirroring `browser`, `autoApprove` and `autoResume`, with a codec round-trip test pinning it, so the only remaining risk is another decode path drifting.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "carry the spawn mcp flag through the far-side decoder". In `src/remote/frame/decode-lifecycle.ts`, add `mcp` to the fields destructured from the spawn record, validate it the same way as `browser`/`autoApprove`/`autoResume` (`mcp === undefined || typeof mcp === 'boolean'`), and spread `...(mcp !== undefined && { mcp })` into the returned frame so `RemoteProcesses.spawnPty` in `src/remote/serve-processes.ts` sees `frame.mcp === true` and launches `FarSideMcp`. Add a round-trip case to `src/remote/protocol.test.ts` beside the existing browser-flag spawn test that encodes and decodes a spawn with `mcp: true` and asserts the flag survives, plus one with `mcp: false` asserting an explicit false is preserved rather than dropped. Note that `src/remote/serve-mcp.test.ts` builds spawn frames directly and bypasses the codec, which is why the gap went unnoticed; an assertion through `decodeFrame` is what pins the real path. No change to `src/remote/base64-fields.ts` or `src/remote/protocol-frames.ts` is needed — the spawn field is not binary and the union already declares it.


* Make the local MCP relay accept the arguments the far side actually sends so a remote question no longer throws and poisons its call id.

Existing Issue: `FarSideMcp.relay` in `src/remote/serve-mcp.ts` sets `mcp-call.args` to base64 of JSON and then `encodeFrame` base64-encodes that field again, so the new `JSON.parse(frame.args)` in `src/remote/mcp-relay.ts` throws on every real call, and because the pending entry is inserted before the parse it stays result-less and later re-sends are silently dropped. Severity: 9/10

Existing Risk: 9/10 - Every real remote MCP question fails before it reaches `createLocalExecutor`: the throw escapes `RemoteChannel.dispatch` through the PTY `onData` callback, and the far side eventually fails the call with a not-connected error when its grace window ends.

Proposal Risk: 2/10 - Sending plain JSON from the far side matches how every other binary field is produced, and catching parse errors in the relay keeps a malformed frame local, with codec-level and malformed-input tests pinning both ends.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "stop double-encoding mcp-call args and make the relay reject malformed frames". In `src/remote/serve-mcp.ts`, change `FarSideMcp.relay` to put `JSON.stringify(args)` (plain text) in the `mcp-call` frame and let the codec's `BINARY_FIELDS['mcp-call']` entry in `src/remote/base64-fields.ts` do the single base64 pass, the same way the local side sends `mcp-result.text` in `src/remote/mcp-relay.ts`. In `src/remote/mcp-relay.ts`, move `pending.set` after a successful `JSON.parse`, and wrap the parse in a try/catch that settles the call with an `isError` result whose text names the malformed arguments, so a bad frame never throws out of `handle()` and never leaves a result-less entry that silences re-sends. Update `src/remote/serve-mcp.test.ts` to assert the encoded wire form via `encodeFrame`/`decodeFrame` instead of inspecting the raw `send` mock frame — its `Buffer.from(frame.args, 'base64')` assertion currently pins the double encoding — and add a malformed-args case to `src/remote/mcp-relay.test.ts` asserting an `isError` result and that a later valid call with the same id is not deduplicated away. The `mcpHarness` test in `src/remote/manager.test.ts` builds frames directly with `encodeFrame`, so it cannot detect the double encoding and must stay as-is.


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
