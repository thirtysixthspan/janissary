# Give a remote harness's live auto-approval notifications a toast

**Complexity: 3/10** — threading one boolean parameter through a single, well-understood call
chain (`SessionRouter.gateEvent()` / `SessionRouter.attach()`'s claim loop →
`SessionListener.onGateEvent` → `createRemotePtySession`'s callback → `notify()`'s existing
`detectedAt` parameter). No new architecture, no new files, and the test patterns for both the
live and replay paths already exist in the surrounding test files to mirror.

`createRemotePtySession`'s `onGateEvent` handler in `src/remote/pty-session.ts` always passes `new
Date(capturedAt)` as `notify()`'s `detectedAt` argument. `src/notifications/deliver.ts` treats any
notification with `detectedAt` set as `replayed` and skips the toast unconditionally (see
`deliverNotification`'s `if (replayed) return;`). So a live auto-approval — one the far side just
detected and delivered straight through `SessionRouter.gateEvent()` because a listener was already
registered — gets stamped with a timestamp exactly like one queued while the tab was detached and
replayed through `SessionRouter.attach()`'s claim loop on reconnect. Only the replay case was ever
meant to skip the toast.

## Goal

A remote harness's live auto-approval notification produces a toast, exactly like a local one
does; an auto-approval replayed after a reattach still does not. The distinction is which
`SessionRouter` path delivered the gate-event frame — `gateEvent()` for live delivery to an
already-registered listener, `attach()`'s claim loop for frames held while the tab was still being
rebuilt — not something computed downstream from a timestamp.

## Approach

1. **`src/remote/channel-sessions.ts`**: add a `replayed: boolean` parameter to
   `SessionListener.onGateEvent`'s type, placed before the optional `capture` parameter:
   `onGateEvent?: (message: string, capturedAt: number, replayed: boolean, capture?: string) =>
   void;`. In `attach()`'s claim loop, the `frame.type === 'gate-event'` branch passes `true` (a
   claimed frame was, by definition, held for a tab still being built). In `gateEvent()`, the
   live-delivery method, pass `false`.

2. **`src/remote/pty-session.ts`**: update `createRemotePtySession`'s `onGateEvent` callback to
   accept `replayed` and pass `replayed ? new Date(capturedAt) : undefined` as `notify()`'s
   trailing `detectedAt` argument. Update the comment above `onGateEvent`, which currently claims
   the translation is "stamped with the original detection time (not now)" unconditionally — note
   that this only holds for a replayed report; a live one is stamped with nothing so it toasts.

3. **`src/remote/channel-sessions.test.ts`**: update the three existing `listener()`-built mocks'
   `onGateEvent` assertions in `describe('SessionRouter — gate-event', …)`:
   - `'delivers live to a registered listener'` — assert the call now includes `false` for
     `replayed`: `toHaveBeenCalledWith('Auto-approved a permission prompt', 1000, false, 'text')`.
   - `'is held for an id whose tab is still being built, then delivered on attach, in arrival order
     alongside output'` — assert the claimed delivery passes `true`.

4. **`src/remote/pty-session.test.ts`**: the file's own `attachedChannel()` helper calls
   `encodeHandshake('/srv/proj')` with no session id, so `createRemotePtySession`'s
   `channel.attach()` registers the listener before any frame arrives — every existing gate-event
   test here already exercises the **live** path via `SessionRouter.gateEvent()`, not the replay
   claim loop.
   - Update `'translates a gate-event frame into notify(), stamped with the original detection
     time, and writes the capture file'` — rename to drop "stamped with the original detection
     time" (it no longer is, for this live case) and change its `notify()` assertion's trailing
     argument from `new Date(1_700_000_000_000)` to `undefined`.
   - Update `'translates a gate-event frame with no capture into notify() with no open file'` the
     same way: trailing argument becomes `undefined` instead of `new Date(1000)`.
   - Add a new test exercising the replay path, using the same session-id-set-before-handshake
     pattern `src/remote/channel.test.ts`'s `describe('RemoteChannel — frames for an id with no
     listener yet', …)` uses: build a channel, set `channel.sessionId` to a fixed UUID before
     calling `channel.receive` with `encodeHandshake(...)` including that same session id (entering
     the attaching/hold window), `channel.receive` a `gate-event` frame for an id with no listener
     yet, then call `createRemotePtySession` for that id (which calls `channel.attach`, claiming
     the held frame). Assert `notify()` was called with `detectedAt` equal to `new
     Date(capturedAt)`.

## Implementation steps

1. `src/remote/channel-sessions.ts`: widen `SessionListener.onGateEvent`'s type, thread `true`/
   `false` through `attach()`'s claim loop and `gateEvent()`.
2. `src/remote/pty-session.ts`: accept `replayed` in the `onGateEvent` callback, conditionally pass
   `detectedAt`, update the comment.
3. `src/remote/channel-sessions.test.ts`: update the two affected assertions.
4. `src/remote/pty-session.test.ts`: update the two existing gate-event tests' expectations and
   titles, add the new replay-path test.
5. Run `./scripts/run.mjs check-diff` after each step, fixing any failures.

## Tests

- `src/remote/channel-sessions.test.ts`: `SessionRouter — gate-event` — live delivery passes
  `replayed: false`; claimed (held-then-attached) delivery passes `replayed: true`.
- `src/remote/pty-session.test.ts`: the two existing gate-event translation tests updated to expect
  `detectedAt: undefined` for the live path; one new test asserting `detectedAt: new
  Date(capturedAt)` for the replay path.

`src/notifications/deliver.test.ts`'s existing coverage of `replayed` behavior in
`deliverNotification` does not need to change — this fix only corrects which callers pass
`replayed: true`, not `deliverNotification`'s own handling of that flag.

## Out of scope

- `src/notifications/deliver.ts` and `notify()`'s signature in `src/notifications/index.ts` — both
  already support this distinction correctly; only the remote gate-event callers were wrong.
- Any other `SessionListener` callback (`onOutput`, `onHistory`, `onBusyTransition`, `onExit`) —
  none of them feed a timestamp into a replay/live distinction today.
- The local (non-remote) auto-approve detection path — it already calls `notify()` without a
  `detectedAt`, so it already toasts correctly.
