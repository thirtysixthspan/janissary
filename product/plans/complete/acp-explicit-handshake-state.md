# Make the ACP session handshake an explicit state

**Complexity: 3/10** — ~40 added lines in one production file (`src/acp/session-manager.ts`) rewriting a single method into one state machine, with 7 behavioral requirements but no new modules or cross-file wiring (p=4.77).

## Summary

The per-role ACP handshake in `AcpSessionManager.session()` (`src/acp/session-manager.ts`) is tracked by three independent variables whose ordering *is* the protocol: `connecting`, `connected`, and a write-once `failure` string. Because `failure` is never cleared and `publish()` refuses whenever it is set, an error recorded before the transport finishes connecting silently suppresses the core record and the `onConnect` hook that a later successful connect should produce. Conversely, every error that arrives after `connecting` flips to false calls `hooks.onError` again, so a session whose transport reports a fatal error twice settles its prompt twice.

The fix replaces the three flags with one explicit handshake state and funnels the "record now versus deliver now" decision through a single error transition. Error delivery happens exactly once, and a recorded error no longer blocks the publish that follows a successful connect. The hook consumer, `AcpManager.acquire` (`src/acp/manager.ts`), is unchanged: it still settles and closes the tab on the one error it receives and emits a dirty state broadcast on connect.

## Design decisions

1. **One state object, not three flags.** A local `handshake` discriminated state replaces `connecting` / `connected` / `failure`. Its phases are `connecting` (adapter setup in progress), `connected` (the connect callback has been seen), `published` (the core record exists), and `failed` (an error has been delivered). A plain `failure: string | undefined` carries only the pending error message; it is data, not a control flag — every flow decision reads `handshake`.

2. **Publish refuses only in the failed state.** `publish()` begins the core record and calls `hooks.onConnect()` only when `handshake === 'connected'`, then advances to `published`. This makes publish idempotent (a second connect callback is a no-op) and, crucially, no longer blocks it merely because an error message was once recorded. This is the direct correction of the reported bug.

3. **Error delivery is centralised and once-only.** A `fail(message)` helper is the single place that calls `hooks.onError`; it is a no-op when `handshake === 'failed'`, so a second error cannot re-settle the prompt.

4. **Defer errors seen during setup, deliver them after.** The adapter (`connectAcp` / `createRemoteAcpSession`) can call `onError` synchronously before the session object is assigned to `holder.session`; calling a hook at that moment could settle/close before the session can be killed. So `onError` records the message while `handshake === 'connecting'` and defers delivery to the post-construction drain. Once construction has returned (`connected` / `published` / any settled phase), `onError` delivers immediately through `fail`.

5. **An early error does not cancel a successful connect.** If `onConnect` arrives after an error was recorded, `publish()` still runs (decision 2), and the recorded message is then delivered once through `fail`. That produces one core record (visible agent) and one settle, which is the behavior the current flags suppress. If no connect ever arrives, the deferred message is delivered at the drain and the state ends `failed`.

6. **A late error after publish still fails the session.** `onError` is allowed to transition `published → failed`, so a transport that reports a fatal error after a successful handshake still settles and closes the prompt exactly once.

7. **All existing `current()` guards are kept.** Late callbacks from a stale session generation (label reuse, closed tab) remain no-ops.

## What already exists (reuse, don't rebuild)

| Existing piece | File | Relevance |
| --- | --- | --- |
| `AcpSessionManager.session()` | `src/acp/session-manager.ts` | The only production file that changes; lines 36–104 hold the three flags, `publish`, `onError`, `onConnect`, the adapter construction, and the post-construction drain. |
| Core record + connect hook | `beginCoreRecord` in `src/acp/record-feed.ts`, called from `publish()` | Creates the connections row; unchanged. |
| Error consumer | `AcpManager.acquire` in `src/acp/manager.ts:189-200` | Settles and closes on the one `hooks.onError` it receives, emits dirty state on `hooks.onConnect`; unchanged. |
| Adapter callbacks | `connectAcp` in `src/acp/index.ts`, `createRemoteAcpSession` in `src/remote/acp-session.ts` | May call `onError` / `onConnect` during setup or later; the reason delivery is deferred while `connecting`. |
| Indirect coverage | `src/acp/record-feed.test.ts`, `src/acp/manager.test.ts` | Existing tests pin the observable behavior; must keep passing unchanged. |

## Proposed changes

1. **`src/acp/session-manager.ts`, `session()`**: declare a local `handshake` state (phases `connecting | connected | published | failed`) plus a `failure: string | undefined` message, replacing `connecting`, `connected`, and the write-once `failure` guard.
2. Replace `publish()` so it proceeds only from `handshake === 'connected'`, begins the core record, sets `holder.model`, advances to `published`, then calls `hooks.onConnect()`.
3. Add a `fail(message)` helper: no-op if `handshake === 'failed'`; otherwise set `handshake = 'failed'` and call `hooks.onError(message)` exactly once.
4. Rewrite `onError(message)`: return unless `current()` and `handshake !== 'failed'`; store `failure = message`; if `handshake === 'connecting'`, leave delivery deferred; otherwise clear `failure` and call `fail(message)`.
5. Rewrite `onConnect()`: return unless `current()` and `handshake !== 'failed'`; if `handshake === 'connecting'`, set `handshake = 'connected'` and return (deferred); if `handshake === 'connected'` or `published`, call `publish()` (a `published` state makes this a no-op only if we change publish's precondition — keep publish's guard at `connected` so a repeat connect is inert). After a deferred error is recorded, a connect still publishes and then delivers the stored message once.
6. Restructure the post-construction drain: keep `if (!current()) holder.session.kill()`; otherwise, in order — if a `failure` message is stored, clear it and call `fail(message)`; then if `handshake === 'connected'`, call `publish()`. This delivers a recorded early error once and still publishes on a successful connect.
7. Leave `AcpManager.acquire` and every other file untouched.

## Tests

- `src/acp/session-manager.test.ts` (new, colocated): a small harness that mocks `connectAcp` so the test controls exactly when `onError` / `onConnect` fire, and captures the `ConnectHooks` passed to `session()` with spies for `onError` / `onConnect`.
  - **early error then connect**: `onError('early')` fires synchronously during adapter construction, then `onConnect()` after `session()` returns; assert `hooks.onConnect` fires once (a core record is begun) and `hooks.onError` fires once with `early` — the exact behavior the current flags suppress.
  - **two post-connect errors**: `onConnect()` fires first, then `onError('first')` and `onError('second')`; assert `hooks.onError` fires exactly once (with `first`) and `hooks.onConnect` fires once.
  - **stale callbacks**: after `current()` becomes false, a late `onError` / `onConnect` fires no hooks.
- Existing suites `src/acp/record-feed.test.ts` and `src/acp/manager.test.ts` must continue to pass unchanged — they are the regression net for the observable behavior.

## Out of scope

- Any change to `src/acp/manager.ts` or the `acquire` hook consumer.
- Any change to the adapter (`src/acp/index.ts`, `src/remote/acp-session.ts`) or the wire/record contracts.
- Changing the text of any ACP error message or record name.
- Behavior for stale-session callbacks beyond preserving the existing `current()` guards.
- Spec or user-doc changes: this is an internal handshake fix with no user-visible behavior change beyond correcting a previously broken error/record path, and no existing spec or help page documents the internal flag ordering.

## Verification

- Run `$janissary/scripts/run.mjs check-diff` after the source change and again after adding tests; both must be clean.
- Confirm `src/acp/session-manager.ts` stays under the 200-line `max-lines` limit (it is ~162 lines today).
