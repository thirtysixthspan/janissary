# test: dispose the detached peer on every path of its link-state lifecycle test

**Complexity: 2/10** — 0 production lines or files edited, 7 requirements, 5 scenarios (p=3.705)

## Goal

Ensure the new far-side link-state lifecycle test releases its `DetachedPeer` on failure just as every neighboring peer test does. The test currently calls `peer.dispose()` only on the success path, so a failed assertion before that call leaves a listening unix socket, a temporary directory, a peer record and a detach-expiry timer behind. Wrapping its assertions and relay attach in a `try` whose `finally` disposes the peer makes cleanup unconditional without changing production behavior or weakening any assertion.

## Requirements

1. "immediately after `const peer = new DetachedPeer(...)` the assertions and the relayPeer attach are enclosed in a try block whose finally calls peer.dispose()".
2. "Cleanup runs on every exit path once disposal is in a finally" — a failed assertion before disposal must still dispose the peer.
3. "Keep the inner `try { ... } finally { socket.destroy(); }` around the attached relay socket".
4. "keep the final `expect(peer.linked()).toBe(false)` assertion after disposal so the disposed transition stays pinned".
5. "Assertions already covered by other tests must not be removed or weakened."
6. "Do not change src/remote/serve-detach.ts, src/remote/serve.ts, or src/remote/serve-mcp.test.ts".
7. "leave the existing detach, attach and replay tests byte-for-byte untouched".

## Design decisions

- The `try` opens immediately after peer construction and its `finally` holds the single `peer.dispose()` call, matching the shape of the neighboring pipe/pty attach tests and of `it('delegates its link state to a real peer once one exists')` (`src/remote/serve.test.ts:496`), so the cleanup mirrors the file's established pattern.
- The existing inner socket `try`/`finally` stays nested inside the new outer block, so the relay socket is still destroyed on every exit of its handshake wait while the peer is disposed on every exit of the test.
- The post-dispose `expect(peer.linked()).toBe(false)` stays outside the outer `finally`, keeping the disposed transition pinned after cleanup rather than during it.
- All five transition assertions and the relay wait are retained verbatim; the only structural change is the outer `try`/`finally` and dedenting the enclosed body. No new test or helper is added.

## Preserved behavior

1. The five link-state transitions (false before `start`, true after `start`, false after `detach`, true after the relay attach, false after `dispose`) keep pinning the peer lifecycle with no assertion removed or weakened — pinned by `it('reports its link state across start, attach, detach, and dispose')` in `src/remote/serve.test.ts`.
2. The attached relay socket keeps being destroyed on every exit of the handshake wait — pinned by the same test.
3. The detach, attach and replay tests of `describe('detached peer rendezvous')` keep their bodies unchanged — pinned by `it('attaches over a private socket, redraws terminals, and replays only missed transcript blocks')` in `src/remote/serve.test.ts`.

## Assumptions

1. The target test begins at `src/remote/serve.test.ts:1240`, constructs the peer at `:1241`, destroys the relay socket in an inner `finally` at `:1252`, and calls `peer.dispose()` at `:1253`.
2. The reference cleanup shape is `src/remote/serve.test.ts:501-512`, where an outer `try` ends in `} finally { peer.dispose(); }` at `:511` and the post-dispose assertion follows at `:512`.
3. `DetachedPeer.dispose()` stops the peer and clears its sink — `src/remote/serve-detach.ts:120` `dispose(): void {`.
4. `relayPeer` returns a socket whose `destroy()` releases the attached transport — `src/remote/serve-detach.ts:199` `socket.once('connect', ...)`.
5. Test files are exempt from the 200-line `max-lines` rule — `eslint.config.mjs:114-118` `files: ['**/*.test.ts', '**/*.test.tsx']` with `'max-lines': 'off'`, so the edit forces no module extraction.

## Existing functionality

1. The attach handshake helper — `src/remote/serve-detach.ts:181` `export function relayPeer(`.
2. The peer cleanup mechanism — `src/remote/serve-detach.ts:120` `dispose(): void {`.
3. The neighboring outer `try`/`finally` cleanup pattern — `src/remote/serve.test.ts:501` `try {` through `:511` `} finally { peer.dispose(); }`.
4. The server test factory — `src/remote/serve.test.ts:150` `function makeServer(`.
5. The vitest server test project that runs `src/remote/serve.test.ts` — `package.json` test scripts.

## Implementation steps

1. In `src/remote/serve.test.ts`, edit only the body of `it('reports its link state across start, attach, detach, and dispose')` inside `describe('detached peer rendezvous')`: open a `try` immediately after `const peer = new DetachedPeer(...)`, move the five transition assertions, the `output` array, the `relayPeer` call and the inner socket `try`/`finally` into it, replace the trailing `peer.dispose();` with an outer `finally { peer.dispose(); }`, and leave the final `expect(peer.linked()).toBe(false)` after that outer block. Dedent the wrapped body to match the surrounding tests; change no assertion text. Build and check with `$janissary/scripts/run.mjs check-diff`.
2. Confirm with `git status --short` and `git diff --name-only` that the only changed file is `src/remote/serve.test.ts`, that the diff is confined to that one test body, that no production file changed, and that every other test in the file is byte-for-byte unchanged. Run `$janissary/scripts/run.mjs check-diff` one final time.

The edit adds and removes only a few lines inside one test body; the file stays well under any applicable lint constraint (tests are `max-lines`-exempt, see assumption 5), and no new module, import or type is needed.

## UI design

None — the change restructures cleanup in an existing test and modifies no user-visible surface. The link-state behavior the test pins is already described in `product/specs/remote-server.md`.

## Tests

No application behavior and no application code change; no new tests are introduced.

- The existing `DetachedPeer` lifecycle test in `src/remote/serve.test.ts` keeps asserting false before `start`, true after `start`, false after `detach`, true after a `relayPeer` attach, and false after `dispose` (requirements 1, 3, 4, 5).
- The same test now disposes its peer on success and failure paths (requirement 2).
- The existing detach, attach, replay and production-callback tests are not edited (requirements 6, 7).

## Out of scope

- Any edit to `src/remote/serve-detach.ts`, `src/remote/serve.ts`, or `src/remote/serve-mcp.test.ts`.
- Any edit to a test other than `it('reports its link state across start, attach, detach, and dispose')`.
- New tests, new helpers, or new modules.
- Any functional spec, help page, or `documentation/` tree edit — the change adds no behavior and already-specified behavior is untouched.

## Verification

Run `$janissary/scripts/run.mjs check-diff`; it must pass lint, typecheck for the server project, and the server tests including `src/remote/serve.test.ts`. Then read the body of `it('reports its link state across start, attach, detach, and dispose')` in `src/remote/serve.test.ts` and confirm that every path reaching `peer.start()` also reaches `peer.dispose()`, that the inner `try { ... } finally { socket.destroy(); }` and the trailing `expect(peer.linked()).toBe(false)` are still present, that all five transition assertions are unchanged, and that `git diff --name-only` names only `src/remote/serve.test.ts` — a changed production file, an edited neighboring test, or a removed assertion means the change was made incorrectly.
