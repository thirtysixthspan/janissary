# Start the remote MCP grace window for calls already in flight when the link drops

**Complexity: 4/10** — ~28 added production lines in 1 file, 10 requirements and 8 scenarios (p=5.14)

## Goal

A remote harness's MCP question can be delivered to the local Janissary while the link is healthy and then lose that link before the human answers. The far-side endpoint already has a 60-second grace window, but it starts only when a call's own send returns `false` at dispatch, so a call already in `pending` when the link drops has no timer and hangs forever. Make the endpoint observe the link-state predicate it already receives and start one grace window for every pending call at the moment the link goes down, so an interrupted question either resumes on reattach or fails inside 60 seconds with the existing error text.

## Requirements

1. A call relayed while the link is up and then left pending when the link drops starts the 60-second grace window at the link loss, not at its dispatch.
2. The link-loss signal comes from the same `linked` predicate the production send wrapper in `src/remote/serve-processes.ts` already reads, so the predicate and the send result agree about whether a frame was delivered.
3. While the link is up, a pending call's watcher does nothing and does not start a grace window.
4. One shared watcher serves all pending calls on the endpoint; a second call does not start a second watcher.
5. On detected link loss, `startGrace()` starts the existing window and the detection tick counts as the window's first tick, so the call fails 60 seconds after the link drop.
6. A re-send inside the restored window uses the pending call's original `call` id and is sent once.
7. The answer to a re-sent call settles the original executor, and the local side's correlation-id dedupe attaches it to the existing question rather than opening a second one.
8. The existing re-send, `detached` flag, and `Janissary is not connected.` rejection path behaves exactly as before for calls held from dispatch.
9. A refused call is never sent over the session and leaves no question behind for a later attach.
10. The grace paragraphs in `product/specs/mcp-server.md` and `product/specs/remote-server.md` describe a window the code enforces for in-flight calls as well as calls made while down.

## Design decisions

- The endpoint polls the `linked` predicate on the same one-second cadence as the grace timer while it has pending calls; a predicate flip is the link-loss signal, so no new frame, protocol version, or transport callback is needed. Assumption 1.
- The watcher is a single interval on `FarSideMcp`, started on the first call delivered while linked and stopped when pending is empty or when a call takes the existing `delivered === false` path; the endpoint's `pending` map remains the only store of held calls. Assumption 4.
- On a false predicate the watcher stops itself, calls the existing `startGrace()`, and runs one `graceTick()` immediately so the expiry lands 60 seconds after the link drop rather than 61 seconds after it. Assumption 3.
- The grace interval callback body is extracted verbatim into `graceTick()` so the watcher and the timer share one re-send/expiry implementation; no branch or constant in that logic changes. Assumption 3.
- `relay`'s `delivered === false` branch and its recovery branch are left intact; the only addition is starting the watcher for calls that were delivered. Assumption 2.
- The local side's dedupe is untouched: re-sending a pending frame with its original `call` id makes it attach to the question already open. Assumption 5.

## Preserved behavior

1. A relayed question settles from `mcp-result` with the same tool, arguments, and correlation id, and emits no second `mcp-call` — pinned by `relays a question as mcp-call and settles it when mcp-result arrives`.
2. Calls held from dispatch are re-sent with their original distinct ids on recovery and resolve from those frames — pinned by `holds in-flight and new calls through a link loss and re-sends them when it returns`.
3. Grace expiry fails every held call with `Janissary is not connected.` rather than resolving or silently dropping it — pinned by `fails every held call with the detach error when the grace window expires`.
4. A call made after the window, while still detached, fails at once with the same text and sends nothing — pinned by `fails a call made while detached at once with the detach error`.
5. A new call after recovery relays normally and is not left in grace state — pinned by `relays a new call normally once the link is back`.
6. Holding, re-sending, and expiring through a test-flipped production `linked` predicate, with an unstubbed send wrapper, still work — pinned by `holds, re-sends and expires calls through the production link callback without stubbing send`.

## Assumptions

1. `src/remote/serve-mcp.ts:71` — `private readonly linked: () => boolean = () => true` gives the endpoint a direct read of link state already threaded from the server through `RemoteProcesses`.
2. `src/remote/serve-processes.ts:117` — `if (this.linked()) return this.send(out);` makes the production wrapper return `false` exactly when the predicate is false.
3. `src/remote/serve-mcp.ts:135` — `startGrace()` owns the one-second `GRACE_TICK_MS`, 60-tick `GRACE_TICKS`, `resend()`, `detached` flag, and `NOT_CONNECTED` expiry; these stay unchanged.
4. `src/remote/serve-mcp.ts:62` — `private readonly pending = new Map<string, Pending>()` is the single set of held calls the watcher must supervise.
5. `src/remote/mcp-relay.ts:20` — `const existing = pending.get(frame.call)` is why a re-sent call attaches to its existing question.
6. `src/remote/serve-mcp.test.ts:308` — the existing test flips a `linked` predicate the same way the new tests will, so the watcher can be exercised without stubbing send.

## Existing functionality

1. The grace timer, `resend()`, `stopGrace()`, and `fail()` machinery — `src/remote/serve-mcp.ts:113-145`.
2. The `linked` predicate threaded from `RemoteServer` through `ProvisionContext` and `RemoteProcesses` into the endpoint — `src/remote/serve-processes.ts:55`, `:116-119`.
3. The pending-call map keyed by correlation id — `src/remote/serve-mcp.ts:62`.
4. The local relay's correlation-id dedupe — `src/remote/mcp-relay.ts:20-24`.
5. The fake-timer test harness with a flipped link predicate — `src/remote/serve-mcp.test.ts:308-345`.

## Implementation steps

1. In `src/remote/serve-mcp.ts`, extract the interval callback body of `startGrace()` into a private `graceTick()` method with the same `resend()`, `detached`, tick-count, and `fail()` logic, and have `startGrace()` schedule `graceTick()` on the existing one-second interval. No branch, constant, or ordering changes. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Add one shared link watcher to `FarSideMcp`: a private interval field, `stopWatch()`, and `watchLink()` that starts the interval only when none is running. Each tick stops the watcher when `pending` is empty, returns while `linked()` is true, and on a false predicate stops the watcher, calls `startGrace()`, and invokes one `graceTick()`. Clear the watcher in `dispose()` and when a call takes the `delivered === false` branch. Build command: `$janissary/scripts/run.mjs check-diff`.
3. In `relay()`, after the pending entry and abort listener are registered, start the watcher for a call that was delivered; leave the `delivered === false` branch and the recovery branch unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.
4. Add the two tests named under Tests to `src/remote/serve-mcp.test.ts`, using the existing fake-timer setup and `linkSend` helper. Build command: `$janissary/scripts/run.mjs check-diff`.
5. Reconcile the grace paragraph in `product/specs/mcp-server.md` and the matching one in `product/specs/remote-server.md` so they state that the window starts when the link drops, including for calls already in flight. Build command: `$janissary/scripts/run.mjs check-diff`.

## User interface

1. No user interface surface is added or changed. The question panel, its answer, and the `Janissary is not connected.` text stay exactly as they are; only when that text appears for an in-flight call is now driven by the real link state.

## Tests

1. `src/remote/serve-mcp.test.ts` — requirement 1 and 5: relay a question while the link is up using the production `linked` predicate and `linkSend`, flip the predicate to false, and after advancing 60 seconds assert the executor rejects with `Janissary is not connected.` and that no `mcp-call` was emitted while down.
2. `src/remote/serve-mcp.test.ts` — requirement 6 and 7: relay a question while linked, flip the predicate to false, restore it inside the window, and assert the original `call` id is re-sent exactly once and that answering that id settles the original executor.
3. The tests named in Preserved behavior keep passing unchanged.

## Out of scope

- No edit to `src/remote/mcp-relay.ts`; correlation-id dedupe stays as it is.
- No edit to `src/remote/serve-processes.ts`, `src/remote/serve.ts`, `src/remote/serve-detach.ts`, or `src/remote/serve-provision.ts`; the predicate is already wired.
- No new frame type, protocol version, dependency, or change to the 60-second duration or error text.
- No help page or user/developer documentation edits.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then launch a remote harness with MCP, ask a question while the link is healthy, drop the transport before answering, and confirm the harness does not hang: restore the link within 60 seconds and see the same question answered once with no second panel, or leave it down and see `Janissary is not connected.` in the harness within 60 seconds of the drop. A failure is a question that never settles, a second question panel after reattach, or an error appearing at the moment of the drop instead of after the window.
