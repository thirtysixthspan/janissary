<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Connect the far-side grace window to a real no-link signal so a lost session actually holds and expires calls

Existing Issue: The only production `FarSideMcp` construction passes `RemoteProcesses.send`, which originates from `RemoteServer.emit` (`writeFrame` or the detached-peer wrapper) and always returns `void`, so `delivered === false` never occurs outside the test stub and the grace timer, re-send path, and detach error are unreachable in a real session. Severity: 9/10

Existing Risk: 9/10 - A real link loss leaves calls queued in the detached peer's replay buffer with no 60-second expiry and no `Janissary is not connected.` answer, so a harness can wait indefinitely or be answered later by a different session after an attach.

Proposal Risk: 3/10 - The signal becomes explicit and testable, though the far side still has to agree with the peer's own replay policy so a held call is not delivered twice.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "wire the far-side MCP grace window to a real no-link signal". Add `linked(): boolean` to `DetachedPeer` in `src/remote/serve-detach.ts`, returning true only while its sink is installed by `accept()` and it is not stopped; `detach()` clears that sink. Thread a `linked` predicate from `RemoteServer` in `src/remote/serve.ts` — the peer's `linked()` once a peer exists, and stdout writability plus a flag set by `detach()` before that — through `ProvisionContext` in `src/remote/serve-provision.ts` into `RemoteProcesses` in `src/remote/serve-processes.ts` (defaulted so existing test callers need no change), and change the spawn site's callback passed to `FarSideMcp` to return `false` without emitting the frame when the link is down, so the peer's replay buffer does not also queue it. Keep the `boolean | void` signature already declared in `src/remote/serve-mcp.ts` and leave its timer logic intact. Add a test in `src/remote/serve-mcp.test.ts` that drives the grace path through that production callback by flipping the link state instead of stubbing `send`, asserting the same outcomes the fake-send tests assert: no delivery while down, re-send with unchanged `call` ids after recovery, and the `Janissary is not connected.` rejection after the window. Inspect the attach replay in `src/remote/serve-detach.ts` for duplicate `mcp-call` frames, since a held call must execute once.


* Stop a detached far-side call from emitting its frame before the immediate not-connected rejection

Existing Issue: `FarSideMcp.relay` calls `this.send(frame)` before checking `delivered === false && this.detached`, so a call made after the grace window emits and may be queued for replay even though its promise is rejected with `Janissary is not connected.` Severity: 6/10

Existing Risk: 6/10 - Once the no-link signal is wired, a detached call is replayed to the next session that attaches and executes there with no pending entry to receive its answer, so a harness is told the call failed while the tool still runs.

Proposal Risk: 2/10 - Rejecting before the send leaves no frame on the wire and the existing grace tests still cover the held-call path, with only the ordering changed.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "do not emit a far-side MCP call that is immediately rejected while detached". In `src/remote/serve-mcp.ts`, move the detached check to the top of the `relay` promise executor before `this.send(frame)`: when `this.detached` is true, reject with `new Error(NOT_CONNECTED)` and return; call `this.send(frame)` only for the linked case and keep the existing `delivered === false` grace start for a first link loss. Verify in `src/remote/serve-mcp.test.ts` by clearing the `send` spy after the forced expiry and asserting the call made while detached adds no entry to `send.mock.calls` — the current test only checks `relayedCalls()` is empty, which passes vacuously because `linkSend` records nothing while offline — while the existing held, re-send, and expiry tests keep passing unchanged.
