<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Ensure the new far-side link-state lifecycle test disposes its peer on failure, matching every neighboring peer test.

Existing Issue: The new DetachedPeer lifecycle test calls peer.dispose() only on the success path, while every other test in the same file that constructs a DetachedPeer wraps cleanup in a finally block. Severity: 3/10

Existing Risk: 3/10 - A failed assertion before the final dispose leaves a listening unix socket server, a mkdtemp directory, a peer record, and the detach-expiry timer behind, which can hold the vitest worker open and leave stale peer state for later tests.

Proposal Risk: 1/10 - Cleanup runs on every exit path once disposal is in a finally and no production behavior is touched; the residual risk is only that the assertions mirror the predicate rather than the transport fact they stand for.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "wrap the new DetachedPeer link-state test's cleanup in a finally". In src/remote/serve.test.ts, inside describe('detached peer rendezvous'), change the it('reports its link state across start, attach, detach, and dispose') test so that immediately after `const peer = new DetachedPeer(...)` the assertions and the relayPeer attach are enclosed in a try block whose finally calls peer.dispose(), matching the shape of the neighboring pipe/pty attach tests and of the new it('delegates its link state to a real peer once one exists') in describe('RemoteServer'). Keep the inner `try { ... } finally { socket.destroy(); }` around the attached relay socket, and keep the final `expect(peer.linked()).toBe(false)` assertion after disposal so the disposed transition stays pinned. Assertions already covered by other tests must not be removed or weakened. Do not change src/remote/serve-detach.ts, src/remote/serve.ts, or src/remote/serve-mcp.test.ts, and leave the existing detach, attach and replay tests byte-for-byte untouched. Verify by reading the test that every path reaching peer.start() also reaches peer.dispose(), then run the server test file for src/remote/serve.test.ts to confirm the five transition assertions still hold.
