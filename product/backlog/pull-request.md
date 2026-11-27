<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Choose the local MCP server's first port outside the sandbox browser-denied band so confined harnesses can reach the question tool.

Existing Issue: The manager binds port 0 on first start and persists whatever the OS assigns, which on macOS can land in 65280–65535 — the band the Seatbelt profile denies to every confined harness — while the far-side endpoint deliberately stops below that band. Severity: 6/10

Existing Risk: 5/10 - Roughly one in sixty new projects persists a port no workspaced harness can connect to, so the MCP tool is permanently unreachable and the only symptom is a harness tool timeout.

Proposal Risk: 2/10 - The server binds a reachable port outside the denied band and a test pins the invariant, with no change to token handling or the request guard.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "choose the local MCP port outside the sandbox browser-denied band". In src/mcp/manager.ts, when start() has neither a saved port nor an mcpPort override, stop passing 0 to server.listen and instead draw and bind a loopback port below BROWSER_PORT_BAND_FIRST from src/sandbox/browser/ports.ts, reserving it in-process so it cannot collide with a browser guard port drawn by src/browser/e2e-ports.ts. Persist the chosen port exactly as today. Add a case to src/mcp/manager.test.ts that forces a draw inside the band and asserts the persisted port is outside it and that the URL handed to harnessSpawnEnv is reachable under the sandbox profile; the existing persistence, mcpPort override, collision and tools/list tests must keep passing.


* State remote MCP cancellation and grace-expiry withdrawal in the pull request description's remote paragraph.

Existing Issue: The description's protocol-49 paragraph names only `mcp-call` and `mcp-result` and describes an expired call as a tool error, while the diff adds an `mcp-cancel` frame that withdraws the local question on caller abort and on every grace-window expiry. Severity: 4/10

Existing Risk: 5/10 - A reviewer relying on the description approves the remote path without noticing that an abandoned or timed-out remote call closes the local panel, records a withdrawal line and promotes the next queued question.

Proposal Risk: 2/10 - The description then matches the shipped frames and the specs already record the behavior, with no code or protocol change.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "document remote MCP cancellation and grace-expiry withdrawal in the description". In the "What" paragraph beginning "Remote protocol version 49 adds", add `mcp-cancel` to the frame list and one sentence stating that a caller abort or a grace-window expiry sends that frame so the local question is withdrawn, its panel closed, `Question from <tab> withdrawn` recorded and the next queued question promoted, while a call already answered is unaffected; anchor it to the abort and fail() paths in src/remote/serve-mcp.ts and to the test "withdraws an unanswered question on cancel and shows the next queued one" in src/remote/mcp-relay.test.ts. Do not edit code or bump the protocol version: src/remote/protocol.ts's changelog and product/specs/mcp-server.md already describe this behavior.
