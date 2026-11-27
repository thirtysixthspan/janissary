# test: pin onFinalClose wiring across every final channel-close path

**Complexity: 2/10** — 0 production lines or files edited, 10 requirements, 9 scenarios (p=4.12)

## Goal

Prove that channel close invokes the MCP relay cleanup instead of calling `clear()` directly in a test. `src/remote/entry-factory.ts` wires `onFinalClose: () => mcpRelay.clear()` into `RemoteChannel`, and the class calls that hook from five terminal paths, but no test spies on it. A future close path that forgets the hook would leave settled call ids in the relay across a session boundary, so a re-send in the next session would replay a stale answer instead of registering a fresh question. This change adds that verification in the two existing test files and leaves production behavior untouched.

## Requirements

1. "asserts it fires once on each final path: `close()`" — an `onFinalClose` spy is called exactly once by `close()`.
2. "disconnect()" — the same spy is called exactly once by `disconnect()`.
3. "finish()" — the same spy is called exactly once by `finish()`.
4. "fail() driven by a malformed or unknown frame" — the same spy is called exactly once when a received unknown frame faults the channel.
5. "closed() with no session id" — the same spy is called exactly once by `closed()` on a channel that has no session id.
6. "also assert it does not fire on `closed()` with a session id (the reconnect path)" — the spy is not called by `closed()` when a session id is present.
7. "or on `replaceTransport()`" — the spy is not called by `replaceTransport()`.
8. "replace the direct `relay.clear()` call with a close driven through a `RemoteChannel` wired to `mcpRelay.clear()` so the test matches its title" — the re-send test clears the relay only by invoking a real final-close path.
9. "Keep `clear()` idempotent so the double invocation from `finish()` followed by `closeAfterShutdown()` stays harmless." — a second real close still leaves a re-send registering a fresh question.
10. "covers all five paths with no production change" — only `src/remote/channel/index.test.ts` and `src/remote/mcp-relay.test.ts` are edited; no source file under `src/` other than tests changes.

## Design decisions

- The existing `harness()` in `src/remote/channel/index.test.ts` gains an `onFinalClose` spy passed into the `RemoteChannelHandlers` object and returned alongside `closes`, `attached`, and `kill`, so every existing test keeps building the same channel shape and the new test needs no second constructor setup. The hook is optional on the handler type (`src/remote/channel/types.ts:75` `onFinalClose?: () => void;`), so this adds no production requirement.
- The `fail()` path is driven by receiving an unknown frame, the same trigger the existing failing-frame test uses (`src/remote/channel/index.test.ts:242` `it('fails the channel on a frame outside the union', ...)`): `dispatch` forwards the decode error to `private fail()` (`src/remote/channel/index.ts:230` `this.fail(frame.error)`), which calls `onFinalClose`.
- The reconnect negative case sets `channel.sessionId` directly before `closed()`, because that method branches on `this.sessionId` (`src/remote/channel/index.ts:166` `if (this.sessionId)`) and returns before the final-close call; no handshake is needed to reach the branch.
- The relay test builds a real `RemoteChannel` over a minimal `ChannelTransport` with no-op required handlers and `onFinalClose: () => relay.clear()`, mirroring the production wiring at `src/remote/entry-factory.ts:159`. Calling `channel.close()` exercises the actual hook instead of the relay's method.
- `mcpRelay.clear()` stays as `pending.clear()` (`src/remote/mcp-relay.ts:42`), which is idempotent by construction; a second close cannot discard a later registration. No production edit is made to enforce this.

## Preserved behavior

1. `finish()` followed by `closeAfterShutdown()` still holds the transport through the bounded drain and then kills it exactly once, and adding the spy to the harness must not alter that timing — pinned by `it('keeps the transport briefly after final shutdown frames, then closes it')` in `src/remote/channel/index.test.ts`.
2. A re-send after a settled call has been cleared still registers a fresh question (the `register` spy reaches two calls) — pinned by `it('clears the map on channel close so a re-send registers a fresh question')` in `src/remote/mcp-relay.test.ts`.
3. `clear()` remains idempotent across repeated cleanup so the `finish()` + `closeAfterShutdown()` double invocation is harmless — no existing test pins this, so it is recorded as requirement 9 and covered by a new assertion in the relay test.

## Assumptions

1. `src/remote/channel/types.ts:75` `onFinalClose?: () => void;` makes the hook optional, so adding it to the harness changes no production call site.
2. `src/remote/channel/index.ts:101` `close(): void {`, `:110` `disconnect(): void {`, `:125` `finish(): void {`, `:174-175` `this.state = 'closed'; this.handlers.onFinalClose?.();`, and `:243-244` `private fail(message: string): void { this.handlers.onFinalClose?.();` each fire the hook exactly once.
3. `src/remote/channel/index.ts:166-173` returns from the reconnect branch when `this.sessionId` is set, before the final-close call at `:175`.
4. `src/remote/channel/index.ts:118-123` `replaceTransport(transport: ChannelTransport): void` only swaps the transport and resets state; it never calls `onFinalClose`.
5. `src/remote/channel/index.test.ts:242-247` proves `{"type":"exec",...}` faults the channel, so it is a valid `fail()` trigger for the spy assertion.
6. `src/remote/mcp-relay.ts:42` `clear(): void { pending.clear(); }` is idempotent, so a double cleanup keeps the relay usable.
7. `src/remote/entry-factory.ts:159` `onFinalClose: () => mcpRelay.clear(),` is the production contract the relay test mirrors.
8. `eslint.config.mjs:114-118` sets `'max-lines': 'off'` for `**/*.test.ts`, so growing these two test files forces no module extraction.
9. `eslint.config.mjs:124-141` enforces `.js` extensions on relative imports in `src/`, so the new `RemoteChannel` import in the relay test is `./channel/index.js`.

## Existing functionality

1. The channel test harness — `src/remote/channel/index.test.ts:7` `function harness(write?: (data: string) => void) {`.
2. The channel under test — `src/remote/channel/index.ts:16` `export class RemoteChannel {`.
3. The injected transport type — `src/remote/channel/types.ts:16` `export type ChannelTransport = {`.
4. The existing unknown-frame failure case — `src/remote/channel/index.test.ts:242` `it('fails the channel on a frame outside the union', () => {`.
5. The existing shutdown-drain case — `src/remote/channel/index.test.ts:108` `it('keeps the transport briefly after final shutdown frames, then closes it', () => {`.
6. The relay factory — `src/remote/mcp-relay.ts:10` `export function createMcpRelay(managers: Managers, send: (frame: ClientFrame) => void) {`.
7. The relay test fixture — `src/remote/mcp-relay.test.ts:7` `function fixture() {`.
8. The production hook wiring — `src/remote/entry-factory.ts:159` `onFinalClose: () => mcpRelay.clear(),`.
9. The vitest server project that runs `src/**/*.test.ts` — `package.json` test scripts.

## Implementation steps

1. In `src/remote/channel/index.test.ts`, edit `harness()`: create `const finalClose = vi.fn();`, add `onFinalClose: finalClose` to the `RemoteChannelHandlers` literal passed to `new RemoteChannel(...)`, and add `finalClose` to the returned object. Leave every other field and every existing test body untouched. Build and check with `$janissary/scripts/run.mjs check-diff`.
2. Add a `describe('RemoteChannel — final close cleanup')` block below the existing closing tests. Drive one final path per case with the same harness: call `close()`, `disconnect()`, `finish()`, and `closed()` on a channel with no session id directly, and for the `fail()` case send a handshake first and then receive `${JSON.stringify({ type: 'exec', id: 'r1' })}\n`. Assert `finalClose` was called once in every case. Build and check with `$janissary/scripts/run.mjs check-diff`.
3. In the same describe block, add the two negative cases: set `h.channel.sessionId` to a session id before `h.channel.closed()` and assert `finalClose` was not called, and call `h.channel.replaceTransport({ id: 'new', write: vi.fn(), kill: vi.fn() })` on a fresh harness and assert `finalClose` was not called. Build and check with `$janissary/scripts/run.mjs check-diff`.
4. In `src/remote/mcp-relay.test.ts`, import `RemoteChannel` from `./channel/index.js` and the `ChannelTransport` type from `./channel/types.js`. Extend `fixture()` to create a channel over a minimal transport with `vi.fn()` for the required handlers and `onFinalClose: () => relay.clear()`, and return that channel. Replace `relay.clear()` in the final test with `channel.close()`, and add a second `channel.close()` before the re-send to pin idempotence, keeping the two-call `register` assertion. Build and check with `$janissary/scripts/run.mjs check-diff`.
5. Confirm with `git diff --name-only` that the only source changes are `src/remote/channel/index.test.ts` and `src/remote/mcp-relay.test.ts`; no production file is edited. Run `$janissary/scripts/run.mjs check-diff` one final time.

## UI design

None — the change adds assertions to two existing test files and modifies no user-visible surface. The MCP relay behavior it pins is already described in `product/specs/remote-server.md`.

## Tests

The change introduces no application code; it adds test coverage only.

- Five positive `onFinalClose` cases in `src/remote/channel/index.test.ts` for `close()`, `disconnect()`, `finish()`, `fail()` from an unknown frame, and `closed()` with no session id (requirements 1–5).
- Two negative cases in the same file for `closed()` with a session id and `replaceTransport()` (requirements 6–7).
- The re-send case in `src/remote/mcp-relay.test.ts` now clears through `channel.close()` instead of `relay.clear()`, plus a repeated close for idempotence (requirements 8–9).
- All pre-existing tests in both files keep passing unchanged (requirement 10; preserved behavior 1–2).

## Out of scope

- Any edit to production code: `src/remote/channel/index.ts`, `src/remote/mcp-relay.ts`, and `src/remote/entry-factory.ts` stay byte-for-byte unchanged.
- Any functional spec, help page, or `documentation/` tree edit — no behavior changes and the existing MCP relay spec is untouched.
- Any other test file, backlog entry, or pull request description or title change.

## Verification

Run `$janissary/scripts/run.mjs check-diff`; it must pass lint and the server tests for both touched files. Then read the new `describe('RemoteChannel — final close cleanup')` block in `src/remote/channel/index.test.ts` and confirm it has exactly five single-call `finalClose` assertions and two non-firing assertions, read the final test in `src/remote/mcp-relay.test.ts` and confirm it calls `channel.close()` (never `relay.clear()`) while still asserting two `register` calls, and check `git diff --name-only` to confirm no production file appears — a production edit, a missing path, or a weakened assertion means the change was made incorrectly.
