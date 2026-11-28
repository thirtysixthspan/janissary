# Track the remote MCP grace window across idle link transitions

**Complexity: 4/10** — Five production files, four requirements, and seven test scenarios (p=5.13)

## Goal

Make the remote MCP grace window follow the session's connection so an idle endpoint uses the same deadline as a pending question.

## Requirements

1. “Start ... the remote MCP grace window on actual link transitions” means a disconnect starts a 60-second window whether a call is pending or not.
2. “Reset the remote MCP grace window on actual link transitions” means a reconnect ends that outage even if the endpoint is idle.
3. “Preserve in-flight IDs” means each held call is sent immediately on reconnect using its original identifier.
4. “Preserve ... cancellation” means expiry and a caller abort withdraw their own outstanding calls.

## Design decisions

- Report link transitions from the transport that owns them. Use its disconnect timestamp to initialize a workspace or endpoint created during the outage.
- Keep one deadline timer in the far-side endpoint. Hold calls in its existing pending map and resume them only after the peer's attach and replay frames.

## Preserved behavior

1. A resent call keeps its original identifier and never creates a second local question. The existing test “re-sends an in-flight call once with its original id when the link returns inside the window” pins the far side's identifier.
2. A call that outlives the window fails with the disconnect error and sends cancellation for that call. It never receives a later answer. The existing test “fails every held call with the detach error when the grace window expires” pins both failures and both cancellations.
3. Another loss after a successful recovery gives the pending call a new grace window. The existing test “fails a held call when the link drops a second time after an in-window re-send” pins the second expiry and the two sends with one identifier.

## Assumptions

1. The remote service has no reusable transport before settling a root. `src/remote/serve.ts:241` checks `this.root === undefined` and shuts down.
2. The peer knows when attach replay ends. `src/remote/serve-detach.ts:172` writes the frames from `busyTransitionFrames` before passing new input to the server.

## Existing functionality

1. `src/remote/serve-detach.ts:111` owns the shared `detach()` path for explicit detach and an attached socket closing.
2. `src/remote/serve-mcp.ts:45` stores each call and its stable frame in `pending` until result, cancellation, or expiry.
3. `src/remote/serve-processes.ts:76` lazily creates and owns the single `FarSideMcp` endpoint.

## Implementation steps

1. Update `DetachedPeer`, `RemoteServer`, and workspace provisioning to report transport availability to `RemoteProcesses`. Store the disconnect time and pass the current value when a workspace or its first MCP endpoint starts during an outage. Replace the endpoint's polling with one deadline, hold new calls until a reconnect, and resend pending frames after the attach replay. Use `$janissary/scripts/run.mjs check-diff`.
2. Cover idle and in-flight transitions in the endpoint tests and verify that the real detached peer reports both transitions. Update the MCP and remote server specs with the exact idle and repeated-outage behavior. Use `$janissary/scripts/run.mjs check-diff`.

## UI design

1. Remote MCP callers still see `Janissary is not connected.` when a question outlives the session's grace window.

## Tests

1. For requirement 1, make the first question near the end of an idle outage and assert it gets only the remaining time. Instantiate the endpoint late in an outage and confirm it uses the original deadline.
2. For requirement 2, expire an idle outage, reconnect briefly without a call, and disconnect again. Confirm a new call gets the second outage's grace period.
3. For requirements 3 and 4, reconnect before the old polling interval would have elapsed and check the existing call resends immediately with the same identifier. Preserve expiry and cancellation assertions. Add a real transport test for the peer's disconnect and attach signals.

## Out of scope

Changes to the MCP protocol, the locally hosted endpoint, or the seven-day lifetime of the remote session.

## Verification

1. Run `$janissary/scripts/run.mjs check-diff`.
2. With MCP enabled, launch `harness opencode on <host>` from the local command bar. Keep the harness idle and drop its SSH connection. Before 60 seconds elapse, have that remote harness issue a question through its configured MCP endpoint, then use **Attach** in Sessions before the 60-second deadline. The question should appear once on the rebuilt tab, and its answer should reach the harness. A question that appears twice, waits another 60 seconds after a late call, or fails immediately during a new outage after an idle Attach indicates a regression.
