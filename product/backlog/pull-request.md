<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* State remote MCP cancellation and grace-expiry withdrawal in the pull request description's remote paragraph.

Existing Issue: The description's protocol-49 paragraph names only `mcp-call` and `mcp-result` and describes an expired call as a tool error, while the diff adds an `mcp-cancel` frame that withdraws the local question on caller abort and on every grace-window expiry. Severity: 4/10

Existing Risk: 5/10 - A reviewer relying on the description approves the remote path without noticing that an abandoned or timed-out remote call closes the local panel, records a withdrawal line and promotes the next queued question.

Proposal Risk: 2/10 - The description then matches the shipped frames and the specs already record the behavior, with no code or protocol change.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "document remote MCP cancellation and grace-expiry withdrawal in the description". In the "What" paragraph beginning "Remote protocol version 49 adds", add `mcp-cancel` to the frame list and one sentence stating that a caller abort or a grace-window expiry sends that frame so the local question is withdrawn, its panel closed, `Question from <tab> withdrawn` recorded and the next queued question promoted, while a call already answered is unaffected; anchor it to the abort and fail() paths in src/remote/serve-mcp.ts and to the test "withdraws an unanswered question on cancel and shows the next queued one" in src/remote/mcp-relay.test.ts. Do not edit code or bump the protocol version: src/remote/protocol.ts's changelog and product/specs/mcp-server.md already describe this behavior.
