# Retire remote MCP results when replay is no longer possible

**Complexity: 6/10** — About 70 added lines across ten production files and twelve test scenarios (p=5.79).

## Goal

Keep completed results only while the far-side caller might replay its request. Preserve pending questions and the original answer through repeated reconnects within the far-side grace window.

## Requirements

1. “Split in-flight state from settled replay state.”
2. Retire a completed result when the far side acknowledges receiving it.
3. Retire completed results that the far side excludes from its pending list on reattach.
4. “Avoid expiring an active question” during a reconnect or replay reconciliation.
5. Keep protocol-49 peers that omit the additive fields able to exchange the existing frames.

## Design decisions

- Keep the in-flight controllers and completed results in separate maps owned by the channel's local relay. Reconciliation changes only completed results.
- Add an optional `received: true` marker to the existing far-to-local `mcp-cancel` frame as terminal acknowledgement of a delivered result. The far side sends it after taking a result out of its pending map or ignoring a result the caller no longer needs. A normal cancellation keeps its existing meaning.
- Include the optional `mcpPending` list on an accepted `attach-result`, before replay. The far side uses its own grace clock to report the calls it can still resend. Absent metadata from an older version-49 peer leaves the cache available.
- The attach retry deadline terminates only its current transport. Calling the channel's final close there would clear valid cached answers before a later retry could replay them.

## Preserved behavior

1. A duplicate pending call reuses the original question and does not create another one. The `attaches a re-sent call to the in-flight question instead of registering a second` test in `src/remote/mcp-relay.test.ts` covers that case.
2. A normal late cancel preserves the panel's answer without a withdrawal notice. The `ignores a cancel in the same turn as the answer and still replays the stored result` test in `src/remote/mcp-relay.test.ts` covers that case.
3. A final close releases this channel's own questions without emitting a withdrawal notice or disturbing unrelated questions. The `silently releases only its own questions from a surviving tab on final close` test in `src/remote/mcp-relay.test.ts` covers that case.

## Assumptions

1. `src/remote/serve-mcp.ts:92` implements `linkChanged` and owns the far side's grace timing and resend.
2. `src/remote/serve-detach.ts:165` emits the accepted `attach-result` before replaying frames on the new link.

## Existing functionality

1. `src/remote/entry-factory.ts:163` clears the relay through `onFinalClose`.
2. `src/remote/serve-mcp.ts:84` removes a matching far-side pending entry when `result` arrives.

## Implementation steps

1. Extend the existing protocol frames and decoders with the optional acknowledgement and attach snapshot fields. Make the far-side endpoint acknowledge received results and expose its replayable ids through the workspace's process owner and parked peer. Separate local pending and settled maps, wire in the accepted snapshot, and keep the retry deadline from running final cleanup. Run `$janissary/scripts/run.mjs check-diff`.
2. Add coverage in the relay, remote manager, far-side listener, detached peer, and protocol codec suites. Describe the supported replay lifetime in `product/specs/remote-server.md`. Run `$janissary/scripts/run.mjs check-diff`.

## UI design

1. A reconnect can show the current question while the caller still awaits an answer. A replay of an already answered question returns its recorded answer without reopening the panel.

## Tests

1. In `src/remote/mcp-relay.test.ts`, confirm a delivered acknowledgement retires the stored result without affecting a different or still-pending call (requirements 1, 2, and 4).
2. Confirm a pending-id snapshot retires an abandoned result and preserves the original result through repeated reconnects, including a question that ran longer than the grace window before the answer (requirements 3 and 4).
3. Confirm final close clears cached results and pending registrations (requirements 1 and 4).
4. In `src/remote/serve-mcp.test.ts` and `src/remote/serve.test.ts`, verify acknowledgement emission, replayable ids during the far side's grace period, and the snapshot's placement on the attach response (requirements 2 and 3).
5. In `src/remote/manager.test.ts`, time out an attach attempt, allow the next attempt to succeed, and verify the accepted call still replays its original answer without reopening the question (requirement 4).
6. In `src/remote/protocol.test.ts`, exercise both added fields, malformed metadata, and the existing frame forms without the fields (requirement 5).

## Out of scope

Changing the grace duration, tool arguments, or wire version.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Launch an MCP-enabled harness over SSH, ask it to open a question, and interrupt the SSH transport while the question is pending. Answer on the local tab before a successful in-window reconnect. The remote harness receives the answer after reconnect and the panel stays closed. A second panel or an absent answer on an in-window reconnect signals a regression.
