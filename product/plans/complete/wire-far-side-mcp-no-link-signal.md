# Wire the far-side MCP grace window to a real no-link signal

**Complexity: 5/10** — ~20 added production lines across 4 files, 11 requirements and 8 test scenarios (p=5.5218); a predicate threaded through three layers plus one callback.

## Goal

The far-side MCP endpoint already has a 60-second grace window for calls it cannot deliver, but a real remote session never reaches it: the only production `send` is the transport emit, which returns `void`, so `delivered === false` is unreachable outside a test stub. Wire a real, observable no-link signal from the detached peer through the server's provisioning context into the endpoint's send callback so a lost session actually holds calls, re-sends them unchanged on recovery, and expires them with the not-connected answer when the window closes.

## Requirements

1. `DetachedPeer.linked()` returns true "only while its sink is installed by `accept()` and it is not stopped".
2. `DetachedPeer.linked()` returns false after "`detach()` clears that sink".
3. `RemoteServer`'s predicate reports "the peer's `linked()` once a peer exists".
4. `RemoteServer`'s predicate reports "stdout writability plus a flag set by `detach()` before that" peer exists.
5. `ProvisionContext` carries the predicate from `RemoteServer` into the provisioned workspace ("thread a `linked` predicate ... through `ProvisionContext` ... into `RemoteProcesses`").
6. `RemoteProcesses` defaults the predicate "so existing test callers need no change".
7. The spawn-site callback passed to `FarSideMcp` "return[s] `false` without emitting the frame when the link is down".
8. A held call is not queued in the peer's replay buffer ("so the peer's replay buffer does not also queue it").
9. There is "no delivery while down".
10. There is "re-send with unchanged `call` ids after recovery".
11. There is "the `Janissary is not connected.` rejection after the window".

## Design decisions

- The no-link signal is a local predicate on the far side, not a new wire frame or protocol bump; the installed sink is the single fact that says a frame can reach the near side now.
- Before a peer exists, stdout writability plus a detach flag is the equivalent signal, because frames in that phase go straight to stdout (`writeFrame`).
- The callback keeps the declared `boolean | void` contract: `false` means "not delivered", `undefined` means "sent" — exactly what the existing timer logic reads.
- `FarSideMcp`'s signature and timer logic are untouched; only the callback at the spawn site changes.
- `linked` is optional on `ProvisionContext` and defaulted in `RemoteProcesses`, so existing callers that omit it need no change.
- A held call stays only in `FarSideMcp.pending`; it must never enter the peer's replay buffer, so a later attach cannot deliver it twice.

## Preserved behavior

1. The far-side question tool still relays a call and resolves it from `mcp-result` — it must not emit a second `mcp-call` or change the tool and arguments — pinned by `relays a question as mcp-call and settles it when mcp-result arrives`.
2. Held calls re-send with their original correlation ids and resolve from those frames — no new id may be minted for a re-sent call — pinned by `holds in-flight and new calls through a link loss and re-sends them when it returns`.
3. Grace expiry still fails every held call with `Janissary is not connected.` — none may be resolved or silently dropped — pinned by `fails every held call with the detach error when the grace window expires`.
4. A call made after detach still fails at once with the same text — it must not be buffered for a later session — pinned by `fails a call made while detached at once with the detach error`.
5. A call after recovery still relays normally — it must not remain in grace state — pinned by `relays a new call normally once the link is back`.
6. Endpoint bind failures keep their contained reporting — no `mcp-call` may be emitted for a bind error — pinned by `reports a real port collision without crashing the session`.

## Assumptions

1. `src/remote/serve-detach.ts:80` — `if (this.sink) { this.sink(`${encodeFrame(frame)}\n`); return; }`: an installed sink is the condition under which a frame is delivered immediately instead of buffered.
2. `src/remote/serve-detach.ts:111` — `this.sink = undefined;` in `detach()`: detach is what clears the sink.
3. `src/remote/serve.ts:31` — `writeFrame`: the pre-peer emit writes to `process.stdout`, so stdout writability is the pre-peer link state.
4. `src/remote/serve.ts:207` — `this.emit = (frame) => this.peer?.emit(frame);`: once a peer exists all frames flow through it.
5. `src/remote/serve-mcp.ts:69` — `send: (frame: ServerFrame) => boolean | void`: the contract the new callback must keep.
6. `src/remote/serve-mcp.ts:123` — `if (this.send(entry.frame) !== false) delivered = true;`: how the timer reads that contract.
7. `src/remote/serve-processes.ts:115` — `(this.mcp ??= new FarSideMcp(this.send, frame.id))`: the sole production construction site.

## Existing functionality

1. `DetachedPeer`'s `sink` lifecycle across `start`, `detach` and `accept` — `src/remote/serve-detach.ts:26`, `:111`, `:159`.
2. `DetachedPeer.emit`'s `pending` buffer and `ReplayHistory`, the path a held call must bypass — `src/remote/serve-detach.ts:76`.
3. `FarSideMcp.startGrace`, `resend` and `relay`, the grace logic reused unchanged — `src/remote/serve-mcp.ts:120`.
4. `RemoteServer.detach()`, the point that parks the peer and where the pre-peer flag is set — `src/remote/serve.ts:232`.
5. `ProvisionContext` and `provisionRemoteWorkspace`, the existing thread from server to processes — `src/remote/serve-provision.ts:33`, `:55`.
6. `RemoteProcesses.spawnPty`, the spawn site where the callback is built — `src/remote/serve-processes.ts:108`.

## Implementation steps

1. Add `linked()` to `DetachedPeer` in `src/remote/serve-detach.ts` beside `emit`, returning the conjunction of "not stopped" and an installed sink; rely on the existing `detach()` and `dispose()` sink clearing for the false cases. Do not add a new sink or change the replay loop. Build command: `$janissary/scripts/run.mjs check-diff`.
2. In `src/remote/serve.ts`, add a detached flag set by `detach()` and a `linked()` method that reads the peer's `linked()` when a peer exists and stdout writability plus that flag before one exists; pass `() => this.linked()` into the `ProvisionContext` at the `provisionRemoteWorkspace` call. Build command: `$janissary/scripts/run.mjs check-diff`.
3. In `src/remote/serve-provision.ts`, add an optional `linked` predicate to `ProvisionContext` and forward `context.linked` as the fifth `RemoteProcesses` argument, leaving the constructor default to supply `() => true` for callers that omit it. Build command: `$janissary/scripts/run.mjs check-diff`.
4. In `src/remote/serve-processes.ts`, add the defaulted `linked` constructor parameter and replace the `FarSideMcp(this.send, frame.id)` callback at the spawn site with one that returns `false` without calling `send` when `linked()` is false and otherwise forwards the frame. Keep the `boolean | void` shape; make no edit to `src/remote/serve-mcp.ts`. Build command: `$janissary/scripts/run.mjs check-diff`.
5. Add the production-callback test in `src/remote/serve-mcp.test.ts` described under Tests, then run the build command. Build command: `$janissary/scripts/run.mjs check-diff`.
6. Inspect the `accept()` replay in `src/remote/serve-detach.ts` (retained history then the `pending` buffer) and confirm no `mcp-call` enters `pending` while the link is down, so the re-send from `FarSideMcp.resend()` is the single delivery and an attach cannot replay a held call twice. Build command: `$janissary/scripts/run.mjs check-diff`.

## User interface

1. No user interface surface is added or changed. The harness question panel, its answer, cancellation text, and the `Janissary is not connected.` message stay exactly as they are; only when that existing message appears is now driven by a real link-loss signal.

## Tests

1. `src/remote/serve-mcp.test.ts` — one named test that drives the grace path through the production callback rather than stubbing `send`: construct `RemoteProcesses` with a `send` spy and a test-flipped `linked` predicate, spawn an MCP harness, and assert requirement 9 (no `mcp-call` in `send.mock.calls` while the link is down), requirement 10 (two re-sent `mcp-call` frames with distinct ids after recovery, each resolving via `mcpResult` under the id it was sent with), and requirement 11 (a call made after the link drops again rejects with `Janissary is not connected.` after the 60-second window). The tests named in Preserved behavior must keep passing unchanged.

## Out of scope

- No edits to `src/remote/serve-mcp.ts`: its `boolean | void` signature and timer logic stay intact.
- The second pull-request backlog entry (rejecting a call made while detached before emitting its frame) is a separate repair and is not implemented here.
- No new frame type, protocol version, dependency, or replay policy change for transcript/output frames.
- No help page or user/developer documentation edits.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then perform these concrete checks:

- Read `src/remote/serve-mcp.ts` and confirm `send` is still declared `(frame: ServerFrame) => boolean | void`, `startGrace` still uses a one-second tick and a 60-tick window, and `NOT_CONNECTED` is unchanged.
- Trace `DetachedPeer.emit` into `pending` and the `accept()` replay: while the link is down the production callback returns `false` before any `send`, so no `mcp-call` reaches `pending`; an attach replays none, leaving `FarSideMcp.resend()` as the one delivery.
- End-to-end interaction: launch a remote harness with MCP, drop the transport, ask a question and see it held; restore the transport within 60 seconds and see the same question answered once; drop again and wait out the window to see `Janissary is not connected.` in the harness. A failure looks like the question being answered by a later session after reattach, a question never expiring, or a duplicated `mcp-call` frame.
