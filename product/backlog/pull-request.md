<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's caller-abort withdrawal for remote MCP questions, which currently leaves the local panel and queue stuck.

Existing Issue: src/remote/mcp-relay.ts executes each relayed call with a fresh AbortController that is never aborted, and src/remote/serve-mcp.ts removes an aborted or grace-expired call only from its own pending map, so a remote caller that gives up leaves the local question registered, its panel open, no `Question from <tab> withdrawn` line, and the next queued question blocked. Severity: 7/10

Existing Risk: 7/10 - A remote harness that disconnects or times out pins a question panel on the local tab and freezes that tab's queue until a human cancels by hand, with no notification explaining why.

Proposal Risk: 3/10 - An explicit cancel frame wired to the existing abort handler, pinned by relay and far-side tests, leaves only the routine risk of one more frame on an already-framed channel.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "wire remote MCP cancellation through to the local question". Add an mcp-cancel server frame carrying the call id to src/remote/protocol-frames.ts and its frame-type registry, a decode case in src/remote/frame/decode.ts, and an entry in src/remote/channel/types.ts so it reaches the local handler within protocol 49; it needs no base64 field. In src/remote/serve-mcp.ts send that frame from the abort handler in relay and from the grace-expiry fail() path before rejecting, and in src/remote/entry-factory.ts route it to the relay. In src/remote/mcp-relay.ts keep one AbortController per pending call, abort it on mcp-cancel, and clear it on settlement so createLocalExecutor's named abort handler withdraws the panel, records the withdrawal notification, and shows the next queued question. Keep the in-flight and settled re-send dedupe and the malformed-argument path in src/remote/mcp-relay.test.ts, and keep every hold, re-send and second-drop case in src/remote/serve-mcp.test.ts passing; add colocated tests for abort before answer and abort after answer.


* Handle non-object remote MCP arguments so they get the promised exact malformed-arguments error.

Existing Issue: src/remote/mcp-relay.ts accepts any valid JSON in an mcp-call's args, so a frame encoding null, a string, or an array passes the codec and reaches createLocalExecutor, which either throws a TypeError whose message becomes the error text or resolves a no-tab error, instead of the promised `Malformed MCP arguments: <args>` result. Severity: 4/10

Existing Risk: 4/10 - A malformed call from a far-side peer gets an implementation-specific error instead of the documented one, and its call id is marked pending before the failure is known.

Proposal Risk: 2/10 - A single object-shape check before the pending map is written, with one colocated test, has no plausible regression on the valid-argument path.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "answer non-object remote MCP arguments with the exact malformed-arguments error". In src/remote/mcp-relay.ts, after JSON.parse succeeds, require the result to be a non-null, non-array object before calling the executor and answer with the same `Malformed MCP arguments: ${frame.args}` isError result used for a parse failure, without inserting an entry into the pending map. Keep the existing success, re-send dedupe, clear-on-close, and malformed-syntax tests in src/remote/mcp-relay.test.ts passing, and add one case per non-object JSON value.
