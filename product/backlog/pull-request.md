<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Stop a detached far-side call from emitting its frame before the immediate not-connected rejection

Existing Issue: `FarSideMcp.relay` calls `this.send(frame)` before checking `delivered === false && this.detached`, so a call made after the grace window emits and may be queued for replay even though its promise is rejected with `Janissary is not connected.` Severity: 6/10

Existing Risk: 6/10 - Once the no-link signal is wired, a detached call is replayed to the next session that attaches and executes there with no pending entry to receive its answer, so a harness is told the call failed while the tool still runs.

Proposal Risk: 2/10 - Rejecting before the send leaves no frame on the wire and the existing grace tests still cover the held-call path, with only the ordering changed.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "do not emit a far-side MCP call that is immediately rejected while detached". In `src/remote/serve-mcp.ts`, move the detached check to the top of the `relay` promise executor before `this.send(frame)`: when `this.detached` is true, reject with `new Error(NOT_CONNECTED)` and return; call `this.send(frame)` only for the linked case and keep the existing `delivered === false` grace start for a first link loss. Verify in `src/remote/serve-mcp.test.ts` by clearing the `send` spy after the forced expiry and asserting the call made while detached adds no entry to `send.mock.calls` — the current test only checks `relayedCalls()` is empty, which passes vacuously because `linkSend` records nothing while offline — while the existing held, re-send, and expiry tests keep passing unchanged.
