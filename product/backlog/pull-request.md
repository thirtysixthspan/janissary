<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle a far-side MCP listener bind failure so a port collision fails only the endpoint instead of crashing the remote session.

Existing Issue: The new far-side MCP server calls listen() with no 'error' listener even though its own comment acknowledges a cross-process port collision can occur, so an EADDRINUSE emits an unhandled error that terminates the entire remote-serve process and every tab on that ssh channel. Severity: 6/10

Existing Risk: 5/10 - A harness MCP launch that loses the port race to another process on the host takes down the whole remote session for all of its tabs at once, with no frame over the session explaining why.

Proposal Risk: 2/10 - The collision becomes a contained failure of just that MCP endpoint, reported over the session, while the rest of the remote session and its other tabs keep running.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "handle a far-side MCP listener bind failure so a port collision cannot crash the remote session". In src/remote/serve-mcp.ts register an 'error' listener on the createServer result before calling listen(), and turn a bind failure into a reported condition instead of an uncaught throw: mark the endpoint failed so a subsequent launch() surfaces a clear error rather than publishing an address that was never bound, and route the failure through the injected send callback so the local side sees why the endpoint is unavailable. Keep the port reservation returned in dispose() on that failure path so the claimed port is not stranded, and leave the existing `if (this.server.listening)` guard so dispose() stays safe when the bind never succeeded. Add a colocated test in src/remote/serve-mcp.test.ts that binds a real node:http server, not the mocked createServer, to the chosen port and asserts the collision is reported without throwing; the existing mocked tests in that file keep the loopback, guard, relay, and cancellation behavior pinned unchanged.
