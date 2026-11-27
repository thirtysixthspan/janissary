<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Add colocated tests for the far-side link-state predicates that decide whether an MCP call is held, re-sent, or refused

Existing Issue: The new `linked()` predicates on `DetachedPeer` and `RemoteServer` and the `detached` flag on `RemoteServer` are added with no test asserting their state transitions, even though they are the only signal telling the far-side MCP endpoint whether the session is attached. Severity: 4/10

Existing Risk: 4/10 - A later change to the sink lifecycle or to the peer-versus-stdout branch can silently invert the signal, so calls are emitted into a detached peer's replay buffer for a later attach, or refused while the link is live, with no test to catch it.

Proposal Risk: 2/10 - Assertions added to the existing detach and server tests pin the transitions without changing production behavior; the remaining risk is a test that mirrors the predicate instead of the transport fact it stands for.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "add colocated tests for the far-side link-state predicates". In `src/remote/serve.test.ts`, where `DetachedPeer` and `RemoteServer` are already constructed, add assertions that `DetachedPeer.linked()` is false before `start`, true after `start(sink)` and after an attach completes through the existing socket handshake, false after `detach()`, and false after `dispose()`, and that `RemoteServer.linked()` delegates to `peer.linked()` once a peer exists while reflecting stdout writability and the detach flag before one exists. Drive the attach through the existing handshake helpers rather than calling the private `accept()` directly, and keep the existing detach, attach and replay tests unchanged. The production-callback test in `src/remote/serve-mcp.test.ts` already covers the downstream hold, re-send and expiry behavior with a test-supplied predicate and must keep doing so. Verify no production file changes.
