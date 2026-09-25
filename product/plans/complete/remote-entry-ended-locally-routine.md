# One "ended locally" routine for a remote entry

Backlog: technical debt — "Give a remote entry one idempotent "ended locally" routine that every way an entry ends calls, instead of five hand-written teardown sequences that have drifted apart."

Complexity rating: 5/10

## Goal

A remote entry ends locally in five ways: `terminateRemoteEntry` and `detachRemoteEntry` in `src/remote/attach.ts`, the last-label branch of `RemoteManager.release` and `RemoteManager.closeAll` in `src/remote/manager.ts`, and `remoteChannelClosed` in `src/remote/manager-closed.ts`. Each re-lists what an ending releases, and they have drifted: only terminate and detach release a pending session-state wait, `closeAll` clears neither the workspace file cache nor the handlers, and `release` reaches the genuine-end branch of `remoteChannelClosed` only because `channel.finish()` happens to clear `sessionId` first.

The visible consequence: closing the placeholder tab while an accepted attach waits for the peer's session-state answer leaves that wait running for the full thirty-second deadline.

## Approach

Add one idempotent `markEntryEnded(entry)` beside `dropRemoteLabels` in `src/remote/attach.ts`. It returns immediately when the entry is already closed; otherwise it sets `closed`, stops `attach`, calls `cancelSessionState`, clears the workspace file cache, and clears the handlers, returning the handlers it cleared so the callers that notify tabs (terminate, the genuine channel close) still can. Labels stay with the caller, which knows the table they sit in.

Every one of the five paths calls it. `remoteChannelClosed` gains an `ending` parameter: `release` passes `true` so the "established session, try to recover" branch is skipped by saying so, not by relying on `finish()` having cleared the session id. The stale "fifteen lines below" comment goes.

`RemoteChannel.finish()` assigns `this.state = 'closed'` twice; the trailing duplicate is removed.

## Implementation steps

1. `src/remote/attach.ts`: add `markEntryEnded`; use it in `terminateRemoteEntry` (whose returned handlers now come from it) and `detachRemoteEntry`.
2. `src/remote/manager-closed.ts`: add `ending = false`; skip the recovery branch when it is set; replace the hand-written close steps with `markEntryEnded`; drop the direct file-cache import.
3. `src/remote/manager.ts`: `release`'s last-label branch calls `channelClosed(entry, true)` after `finish()` and drops its own `attach.stop()` and stale comment; `closeAll` calls `markEntryEnded` before `finish()`; `channelClosed` forwards `ending`.
4. `src/remote/channel.ts`: drop the duplicate `state = 'closed'` in `finish()`.

## Tests

- New in `src/remote/resume.test.ts`: a session-state query pending on an entry is released (resolves `undefined`) as soon as the last label releases the entry through `RemoteManager.release`.
- `src/remote/manager.test.ts` (shared-channel, detach, close-all and last-release drain blocks), the rest of `src/remote/resume.test.ts`, `src/remote/channel.test.ts` and `src/sessions/attach.test.ts` keep passing unchanged.

## Out of scope

- The sessions-side re-derivation of lookups and the established predicate (a separate backlog item).
- Any change to which endings announce themselves or close their tabs.

## Specs and docs

- `product/specs/remote-server.md`: the bounded session-state wait also ends at once, without an answer, when the session ends locally while it is outstanding.
- `help.md` and `documentation/user-documentation/`: do not describe the wait; no edit.
