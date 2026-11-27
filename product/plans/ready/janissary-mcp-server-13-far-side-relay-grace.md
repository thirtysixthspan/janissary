# feat: hold remote MCP calls through a link-loss grace window

**Complexity: 4/10** — ~70 added lines, 1 edited file, 8 requirements, 7 scenarios (p=5.14)

## Goal

Make a far-side MCP call survive a temporary loss of the link to the local Janissary: hold calls for a 60-second grace window, re-send them when the link returns, and fail them with `Janissary is not connected.` if it does not. A deliberate Detach gives the far side no signal, so its calls fail when the grace window ends rather than at once. This subplan extends the pending map and relaying executor already working from the previous subplan.

Source: `./product/plans/complete/janissary-mcp-server.md`. Depends on `janissary-mcp-server-12-far-side-endpoint.md`.

## Requirements

1. A detached remote session's harness has no access to Janissary commands through the MCP server — user answer: "dettached sessions will not have access to the janissary mcp".
2. When the far side loses its link to the local side, for any reason, its in-flight MCP calls keep waiting for a 60-second grace window — user answer: "Hold with a grace window": "Any loss holds calls for a fixed grace (e.g. 60 s, the reconnect backoff's scale)".
3. A link that returns within the grace window delivers every waiting call's answer to its harness — user answer: "Hold over reconnect": "in-flight and new calls wait and are re-sent once the link is back."
4. A new call made during the grace window waits like an in-flight one — same user answer.
5. When the grace window ends with no link, every waiting call fails with the tool error `Janissary is not connected.` — user answer: "If no link returns in time, they fail."
6. A call made after the grace window has ended, while there is still no link, fails at once with `Janissary is not connected.` — user answer: "calls made while detached fail the same way at once."
7. A deliberate Detach is not signalled to the far side; its calls fail when the grace window ends — user answer: "A Detach therefore fails calls after the grace rather than at once, and no protocol change is made to Detach."
8. Once a link exists again (a reconnect or an Attach), new calls are relayed normally — follows from requirement 35.

## Design decisions

- On link loss, start one 60-second grace timer for the endpoint, not one per call. While the timer runs, a new call is held like an in-flight one rather than rejected.
- When the link returns before the timer fires, re-send every pending `mcp-call` with its original `call` id; the local side deduplicates by that id (see `janissary-mcp-server-14-local-relay.md`), so the re-send attaches to the existing question rather than registering a second one.
- When the timer fires, fail each pending call with `Janissary is not connected.` and mark the endpoint as detached so later calls fail at once with the same text until a link returns.
- Detach needs no protocol change: it drops the transport without telling the peer, so the far side sees exactly the same link loss as any other reason and follows the same grace path.
- A caller abort removes its pending entry and sends nothing further, including during the grace window.

## Preserved behavior

None found.

## Assumptions

1. A deliberate Detach gives the far side no signal, so it sees the same thing as a lost connection — `product/specs/remote-server.md:559` "drops the transport without telling the peer anything".
2. The relaying executor already keeps a pending map keyed by `call` — `src/remote/serve-mcp.ts`, added by `janissary-mcp-server-12-far-side-endpoint.md`.
3. The local side deduplicates re-sent calls by `call` id — `src/remote/mcp-relay.ts`, added by `janissary-mcp-server-14-local-relay.md`.
4. A link's presence is observable at send time from the existing channel state — `src/remote/channel/index.ts` channel state, used by the relaying executor.
5. The grace duration follows the reconnect backoff's scale — source plan requirement 41a and user answer "e.g. 60 s, the reconnect backoff's scale".

## Existing functionality

1. Pending-call map and relaying executor — `src/remote/serve-mcp.ts`, added by `janissary-mcp-server-12-far-side-endpoint.md`.
2. Correlated request/reply frames over the live channel — `src/remote/protocol-frames.ts:307` `type: 'acp-tool-request'` and `:192` `type: 'acp-tool-result'`.
3. Channel state that tells a sender whether a link exists — `src/remote/channel/index.ts` `state` and `send`.
4. The detached-session correlation precedent — `product/specs/remote-server.md` "Each capture request carries a correlation id".

## Implementation steps

1. In `src/remote/serve-mcp.ts`, make the relaying executor observe link state at send time. When no link exists, put the call into the pending map without sending and start one 60-second grace timer if one is not already running. A new call during the grace window takes the same path. Build and check with `$janissary/scripts/run.mjs check-diff`.
2. When the link returns before the timer fires, cancel the timer and re-send every pending `mcp-call` with its original `call` id, then clear the detached marker so new calls relay at once. When the timer fires, fail every pending call with `Janissary is not connected.`, clear the map, and mark the endpoint detached so later calls fail at once with the same text until a link returns. A caller abort removes its entry in either state. Build and check with `$janissary/scripts/run.mjs check-diff`.
3. Update `product/specs/remote-server.md` § Detached-session auto-accept, notifications, and captures with the relay's grace window and the exact error text, noting that Detach is not signalled. Build and check with `$janissary/scripts/run.mjs check-diff`.

Every step leaves the tree green and touches only `src/remote/serve-mcp.ts` in production code. Relative imports in `src/` carry the `.js` extension per NodeNext.

## UI design

1. No new UI surface. While a remote tab reconnects, the MCP flag keeps its `mcp`/`mcpInUse` state and any pending question panel stays up as usual; the existing connection plug shows the reconnect.

## Tests

- `src/remote/serve-mcp.test.ts`, with a fake send and fake timers: a link lost and back within 60 s re-sends and settles (requirements 2–4); a grace expiry fails pending calls with `Janissary is not connected.` and fails a later call at once (requirements 5–7); once a link exists again, new calls relay normally (requirement 8). Keep the link-present round-trip case from `janissary-mcp-server-12-far-side-endpoint.md` passing.

## Out of scope

- The local side's deduplication and relay execution: `janissary-mcp-server-14-local-relay.md`.
- Adding any frame or protocol change to Detach.
- Automatic reattach of a detached harness, or MCP access for a detached session.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then, against a remote session with a fake link, drop the link mid-call and confirm the call does not fail immediately; restore it inside 60 s and confirm the same call settles once; drop it again and advance past 60 s and confirm the call fails with `Janissary is not connected.` and that a later call fails at once. A failure is an immediate failure on link loss or a second question registered after re-send.
