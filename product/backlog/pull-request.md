<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle non-object remote MCP arguments so they get the promised exact malformed-arguments error.

Existing Issue: src/remote/mcp-relay.ts accepts any valid JSON in an mcp-call's args, so a frame encoding null, a string, or an array passes the codec and reaches createLocalExecutor, which either throws a TypeError whose message becomes the error text or resolves a no-tab error, instead of the promised `Malformed MCP arguments: <args>` result. Severity: 4/10

Existing Risk: 4/10 - A malformed call from a far-side peer gets an implementation-specific error instead of the documented one, and its call id is marked pending before the failure is known.

Proposal Risk: 2/10 - A single object-shape check before the pending map is written, with one colocated test, has no plausible regression on the valid-argument path.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "answer non-object remote MCP arguments with the exact malformed-arguments error". In src/remote/mcp-relay.ts, after JSON.parse succeeds, require the result to be a non-null, non-array object before calling the executor and answer with the same `Malformed MCP arguments: ${frame.args}` isError result used for a parse failure, without inserting an entry into the pending map. Keep the existing success, re-send dedupe, clear-on-close, and malformed-syntax tests in src/remote/mcp-relay.test.ts passing, and add one case per non-object JSON value.
