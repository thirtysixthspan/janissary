# fix: stop a detached far-side MCP call from emitting a rejected frame

**Complexity: 3/10** — ~5 added production lines across 2 edited files, 6 requirements, 6 scenarios (p=4.53)

## Goal

A far-side MCP call made after the link-loss grace window has ended is rejected immediately with `Janissary is not connected.`, but today its `mcp-call` frame is emitted before that rejection, so the frame can be queued for replay to a later session and run there with no pending entry to receive its answer. Move the detached refusal ahead of the send so a rejected call never reaches the wire, while a first link loss still holds calls through the grace window and a restored link still relays new calls normally. Because the refusal now happens before any send, the endpoint needs the existing link predicate to tell a still-detached far side from one whose link has come back.

## Requirements

1. A call made while the far side is detached is rejected with `Janissary is not connected.` before any frame is sent — "when `this.detached` is true, reject with `new Error(NOT_CONNECTED)` and return".
2. A call made while detached produces no `mcp-call` entry in the send spy — "clearing the `send` spy after the forced expiry and asserting the call made while detached adds no entry to `send.mock.calls`".
3. A linked call is relayed as before, with the frame sent — "call `this.send(frame)` only for the linked case".
4. A first link loss still starts the grace window and holds the call — "keep the existing `delivered === false` grace start for a first link loss".
5. A call held through the grace window is re-sent when the link returns and fails with `Janissary is not connected.` when it expires — "the existing held, re-send, and expiry tests keep passing unchanged".
6. A call made after the link returns relays normally rather than staying refused — "relays a new call normally once the link is back", pinned by the earlier no-link-signal work.

## Design decisions

- Check `this.detached` at the top of the `relay` promise executor, before building the frame and before `this.send(frame)`, so the detached path cannot emit anything.
- A detached far side rejects only while its link is still down; when the link has returned, let the call continue into the existing reconnect branch, which clears `detached`, stops the grace timer, and sends the frame. Without this, the new early return would leave `detached` set forever and break recovery after expiry.
- Use the link predicate `RemoteProcesses` already owns for its send callback, passed into `FarSideMcp` as an optional constructor parameter defaulted to always linked, so existing construction sites keep working.
- Remove the now-unreachable `delivered === false && this.detached` branch: once the top check returns, any call reaching `this.send(frame)` is linked.
- Keep `const delivered = this.send(frame)`, the pending-map insert, and the `if (delivered === false) { this.startGrace(); return; }` path intact: a first link loss is still observable only from a failed send, and that call is still held for the grace window.
- Leave the reconnect branch that clears `detached`, stops the grace timer, and re-sends other pending calls unchanged; it depends on the same pending entries and frame ids.
- Assert the new behavior with the send spy rather than `relayedCalls()`, which is vacuous while offline because the test's `linkSend` records nothing when the link is down.

## Preserved behavior

1. A call made during a live link is relayed and settles when its result arrives, with exactly one `mcp-call` frame sent; it must not be refused or sent twice — pinned by `relays a question as mcp-call and settles it when mcp-result arrives` in `src/remote/serve-mcp.test.ts`.
2. Calls held through a link loss are re-sent with their original ids when the link returns and settle once; they must not be rejected at once on the first failed send — pinned by `holds in-flight and new calls through a link loss and re-sends them when it returns` in `src/remote/serve-mcp.test.ts`.
3. Held calls fail with `Janissary is not connected.` when the 60-second grace window expires; they must not stay pending beyond the window — pinned by `fails every held call with the detach error when the grace window expires` in `src/remote/serve-mcp.test.ts`.
4. An aborted call sends nothing further; it must not leave a pending entry or emit another frame — pinned by `drops an aborted call and sends nothing further for it` in `src/remote/serve-mcp.test.ts`.
5. A call made after the link returns relays normally and settles from its result; it must not stay refused by the stale detached marker — pinned by `relays a new call normally once the link is back` in `src/remote/serve-mcp.test.ts`.

## Assumptions

1. `this.detached` is set only when the grace timer expires with no link and cleared when a link returns — `src/remote/serve-mcp.ts:134-143` `startGrace` and `:162-164` reconnect branch.
2. The transport reports a failed link by returning `false` from the injected `send` callback — `src/remote/serve-mcp.ts:69` `private readonly send: (frame: ServerFrame) => boolean | void`.
3. The send spy records every attempted frame, including ones the fake link refuses — `src/remote/serve-mcp.test.ts:52` `linkSend` and `:81` `send = vi.fn()`.
4. The detach error text is the shared constant `NOT_CONNECTED` — `src/remote/serve-mcp.ts:20` `const NOT_CONNECTED = 'Janissary is not connected.'`.
5. A link predicate is already available at the production construction site — `src/remote/serve-processes.ts:55` `private linked: () => boolean = () => true` and `:117` `if (this.linked()) return this.send(out)`.

## Existing functionality

1. The relaying executor and its pending-call map — `src/remote/serve-mcp.ts:146` `private relay: ToolExecutor` and `:62` `private readonly pending`.
2. The injected send callback that signals a missing link with `false` — `src/remote/serve-mcp.ts:69` `private readonly send`.
3. The one grace timer per endpoint that holds and re-sends pending calls — `src/remote/serve-mcp.ts:134` `private startGrace` and `:120` `private resend`.
4. The detach error constant used by both the expiry path and the immediate refusal — `src/remote/serve-mcp.ts:20` `NOT_CONNECTED`.
5. The fake link and send spy in the far-side MCP tests — `src/remote/serve-mcp.test.ts:48` `send` and `:52` `linkSend`.
6. The `linked` predicate on `RemoteProcesses` that already decides whether the send callback emits — `src/remote/serve-processes.ts:55` `private linked`.

## Implementation steps

1. In `src/remote/serve-mcp.ts`, add an optional `linked` predicate to `FarSideMcp`'s constructor, defaulted to always linked, and keep it as a private field. Add a `this.detached` guard at the very top of the `relay` promise executor, immediately after the existing aborted-signal check and before the call id and `frame` are built: reject with `new Error(NOT_CONNECTED)` and return while the link is still down; when `this.detached` is set but `linked()` is true, let the call fall through to the existing reconnect branch that clears `detached` and stops the grace timer. Build and check with `$janissary/scripts/run.mjs check-diff`.
2. In `src/remote/serve-processes.ts`, pass `() => this.linked()` as the third `FarSideMcp` constructor argument at the spawn site, so the endpoint reads the same link state the send callback already uses. Build and check with `$janissary/scripts/run.mjs check-diff`.
3. In the same `relay` executor, delete the old `delivered === false && this.detached` rejection branch so `this.send(frame)` is reached only in the linked case, and leave the pending-map insert, abort listener, `delivered === false` grace start, and reconnect re-send branch as they are. Build and check with `$janissary/scripts/run.mjs check-diff`.
4. Update `src/remote/serve-mcp.test.ts` as described under Tests. Build and check with `$janissary/scripts/run.mjs check-diff`.
5. Update `product/specs/remote-server.md` to state that a call refused because the link is gone is never sent over the session, so it cannot leave a question for a later attach. Build and check with `$janissary/scripts/run.mjs check-diff`.

Each step leaves the tree green and touches only `src/remote/serve-mcp.ts` and `src/remote/serve-processes.ts` in production code. Relative imports in `src/` carry the `.js` extension per NodeNext.

## UI design

1. No new UI surface. The question panel, the MCP flag on a remote harness's metadata row, and the connection plug keep their existing behavior; a refused call simply produces no question.

## Tests

- `src/remote/serve-mcp.test.ts`: drive the `linked` predicate from the test's `online` flag at the `RemoteProcesses` construction site, so a fake offline far side reports the same link state as production. In `fails a call made while detached at once with the detach error`, clear the send spy with `send.mockClear()` after the forced expiry, then make the detached call and assert `expect(send).not.toHaveBeenCalled()` while keeping the existing rejection assertion (requirements 1–2).
- Keep `holds in-flight and new calls through a link loss and re-sends them when it returns`, `fails every held call with the detach error when the grace window expires`, `relays a new call normally once the link is back`, `holds, re-sends and expires calls through the production link callback without stubbing send`, and `drops an aborted call and sends nothing further for it` passing unchanged in their assertions (requirements 3–6).

## Out of scope

- Changing the grace duration, the detach error text, or the reconnect/replay protocol.
- Sending any explicit detach signal to the far side.
- Editing user or developer documentation, or any help page: no command, flag, or key binding changes.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then, with the far-side MCP tests' fake link, hold a call until the 60-second grace expires, clear the send spy, make another call, and confirm it rejects with `Janissary is not connected.` with no new entry in `send.mock.calls`; repeat with the link still down after restoring and dropping it again so the same holds. A failure is any `mcp-call` frame recorded for the rejected call, or a held call that is rejected before the grace window ends.
