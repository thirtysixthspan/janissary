# test: add colocated assertions for the far-side link-state predicates

**Complexity: 2/10** — 0 production lines or files edited, 12 requirements, 9 scenarios (p=4.236)

## Goal

Pin the state transitions of the two predicates that tell the far-side MCP endpoint whether the session is attached. `DetachedPeer.linked()` and `RemoteServer.linked()` are added with no test asserting their transitions, even though they are the only signal deciding whether a call is held, re-sent, or refused. Colocated assertions in the existing server test file make an inverted sink lifecycle or a flipped peer-versus-stdout branch visible without changing production behavior.

## Requirements

1. `DetachedPeer.linked()` is false before `start`.
2. `DetachedPeer.linked()` is true after `start(sink)`.
3. `DetachedPeer.linked()` is true after an attach completes through the existing socket handshake.
4. `DetachedPeer.linked()` is false after `detach()`.
5. `DetachedPeer.linked()` is false after `dispose()`.
6. `RemoteServer.linked()` delegates to `peer.linked()` once a peer exists.
7. `RemoteServer.linked()` reflects stdout writability before a peer exists.
8. `RemoteServer.linked()` reflects the detach flag before a peer exists.
9. The attach is driven through the existing handshake helpers rather than calling the private `accept()` directly.
10. The existing detach, attach and replay tests are unchanged.
11. The production-callback test in `src/remote/serve-mcp.test.ts` keeps covering downstream hold, re-send and expiry with a test-supplied predicate.
12. No production file changes.

## Design decisions

- Assertions land in new `it` blocks in `src/remote/serve.test.ts` rather than inside existing tests, so the existing detach, attach and replay tests stay byte-for-byte unchanged (requirement 10).
- A real `DetachedPeer` is used for every transition; the attach goes through `relayPeer`, the same handshake helper the neighboring tests use, rather than the private `accept()` (requirement 9).
- `RemoteServer`'s delegation is checked with a real peer placed on the server through a test-local cast, so each assertion compares the predicate against the peer's observable lifecycle rather than a stub that echoes the predicate back (requirement 6).
- The no-peer branch is observed with the real `process.stdout.writable` value and with a getter spy that forces it false, then with a settled root and no relay so `detach()` sets the flag without shutting the server down (requirements 7, 8).
- `src/remote/serve-mcp.test.ts` is left untouched; it already proves hold, re-send and expiry through the production callback (requirement 11).

## Preserved behavior

1. The private-socket attach and replay test keeps asserting its frame order and retained output, with no edit to its body or assertions — it must not start asserting a new predicate that changes what it proves — pinned by `it('attaches over a private socket, redraws terminals, and replays only missed transcript blocks')` in `src/remote/serve.test.ts`.
2. The far-side MCP hold, re-send and expiry behavior through the production link callback keeps passing with a test-supplied predicate, with no edit to that test or its `send` setup — pinned by `it('holds, re-sends and expires calls through the production link callback without stubbing send')` in `src/remote/serve-mcp.test.ts`.

## Assumptions

1. `DetachedPeer.linked()` reads `!this.stopped && this.sink !== undefined` — `src/remote/serve-detach.ts:76` `linked(): boolean {`.
2. `start(sink)` assigns the sink before the socket is published — `src/remote/serve-detach.ts:49` `this.sink = sink;`.
3. `detach()` clears the sink and arms the expiry — `src/remote/serve-detach.ts:113` `this.sink = undefined;`.
4. `dispose()` stops the peer and clears the sink — `src/remote/serve-detach.ts:120` `this.stopped = true;`.
5. An accepted handshake installs a fresh sink and clears the expiry — `src/remote/serve-detach.ts:161` `this.sink = (chunk) => { socket.write(chunk); };`.
6. `RemoteServer.linked()` uses stdout writability and `detached` only while no peer exists — `src/remote/serve.ts:227` `linked(): boolean {`.
7. `relayPeer` writes the attach frame on connect and returns the socket — `src/remote/serve-detach.ts:199` `socket.once('connect', ...)`.
8. `RemoteServer.detach()` sets its flag when a root is settled and no relay exists — `src/remote/serve.ts:241` `if (this.relay || this.root === undefined)`.
9. `makeServer` constructs a server with a frame-collecting emit and a fake exit — `src/remote/serve.test.ts:150` `function makeServer(`.
10. `process.stdout.writable` is an inherited accessor that can be shadowed with a getter spy and restored — `vitest` spy behaviour against Node 24's `Writable.prototype` accessor.

## Existing functionality

1. The attach handshake helper — `src/remote/serve-detach.ts:181` `export function relayPeer(`.
2. The peer lifecycle used by every neighboring test — `src/remote/serve-detach.ts:20` `export class DetachedPeer`.
3. The server test factory — `src/remote/serve.test.ts:150` `function makeServer(`.
4. The workspace-ready wait — `src/remote/serve.test.ts:161` `function waitForWorkspaceReady(`.
5. A stdout `vi.spyOn` setup and restore pattern — `src/remote/serve.test.ts:1027` `const write = vi.spyOn(process.stdout, 'write')`.
6. The production-callback MCP test — `src/remote/serve-mcp.test.ts:305` `it('holds, re-sends and expires calls through the production link callback without stubbing send'`.

## Implementation steps

1. In `src/remote/serve.test.ts`, inside `describe('detached peer rendezvous', ...)`, add one `it` that constructs a real `DetachedPeer`, asserts `linked()` false before `start`, true after `start`, detaches and asserts false, attaches with `relayPeer` and waits for the accepted frame before asserting true, then disposes and asserts false (requirements 1–5, 9). Place it beside the existing peer tests and leave their bodies alone. Build and check with `$janissary/scripts/run.mjs check-diff`.
2. In `describe('RemoteServer', ...)`, add one `it` for the no-peer branch: assert `linked()` true with the real stdout, shadow `process.stdout.writable` with a getter spy returning false, assert false, restore the spy, provision through `makeServer` and `waitForWorkspaceReady`, call `detach()` with a settled root and no relay, and assert false (requirements 7, 8). Shut the server down at the end. Build and check with `$janissary/scripts/run.mjs check-diff`.
3. In the same describe, add one `it` for delegation: start a real `DetachedPeer`, put it on a `makeServer` server through a test-local cast, assert `server.linked()` equals the peer's state across its live, detached, re-attached through `relayPeer`, and disposed states (requirement 6). Dispose the peer at the end. Build and check with `$janissary/scripts/run.mjs check-diff`.
4. Confirm with `git status --short` and `git diff --name-only` that the only source file changed is `src/remote/serve.test.ts`, that no production file changed, and that `src/remote/serve-mcp.test.ts` is untouched (requirements 10–12). Run `$janissary/scripts/run.mjs check-diff` one final time.

No file in `src/` gains or loses enough code to approach the 200-line `max-lines` limit, and no new module is needed. No production import is added or changed.

## UI design

None — this change adds assertions to an existing test file and modifies no user-visible surface. The behavior the predicates feed is already described in `product/specs/remote-server.md`.

## Tests

No application behavior and no application code change; these tests pin predicates that already exist rather than inventing new behavior.

- A new `DetachedPeer` lifecycle test in `src/remote/serve.test.ts`: false before `start`, true after `start`, false after `detach`, true after a `relayPeer` attach, false after `dispose` (requirements 1–5, 9).
- A new `RemoteServer` no-peer test in `src/remote/serve.test.ts`: true with a writable stdout, false with a non-writable stdout, false after `detach()` with a settled root (requirements 7, 8).
- A new `RemoteServer` delegation test in `src/remote/serve.test.ts`: the server's `linked()` tracks a real peer across live, detached, re-attached and disposed states (requirement 6).
- The existing detach, attach, replay and production-callback tests are not edited (requirements 10, 11).

## Out of scope

- Any edit to `DetachedPeer.linked()`, `RemoteServer.linked()`, the `detached` flag, or the sink lifecycle.
- Any edit to existing detach, attach or replay tests.
- Any edit to `src/remote/serve-mcp.test.ts` or its test-supplied predicate.
- Any functional spec, help page, or `documentation/` tree edit — the behavior is already specified and this change adds no new behavior.
- New test helpers or new test modules.

## Verification

Run `$janissary/scripts/run.mjs check-diff`; it must pass lint, typecheck for the server project, and the server tests including `src/remote/serve-mcp.test.ts`. Then read `src/remote/serve.test.ts` and confirm three new `it` blocks assert every transition listed in requirements 1–9, that no pre-existing test body was touched, and that `git diff --name-only` names only `src/remote/serve.test.ts` among source files — a changed production file or an edited `serve-mcp.test.ts` means the change was made incorrectly.
