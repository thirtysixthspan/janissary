# Report a failed harness recording the way a failed ssh recording is already reported

**Complexity: 3/10** — one new notification event type, one callback passed at one spawn site, and one optional constructor parameter made required. No new architecture, no wire-protocol change; one new user-visible notification line.

`src/harness/observers.ts` has the two spawn paths that build a `HarnessRecorder`. `sshRuntime` passes an `onFailure` callback that raises the `ssh-recording-failed` notification, with a comment arguing that "a silent gap would defeat the point of an audit recording". `harnessRuntime`, three lines earlier, constructs the same recorder with the argument omitted — and `src/harness/recorder.ts` documents in as many words that "callers that omit it fail silently".

So a named harness whose `.cast` stream dies on an `EACCES` at open, or on a mid-session write error, stops recording with nothing shown anywhere. The tab keeps running and looks healthy, and the operator finds out when they go looking for the recording and it is truncated or absent. `product/specs/harness-recording.md` records this as intended today ("A harness tab's recording failure is silent"), which is the line this change overturns.

## Goal

A harness tab's abandoned recording produces one notification, exactly as an ssh tab's does, and the recorder's constructor no longer lets a spawn path opt out of reporting by accident.

## Design decisions

**A separate `harness-recording-failed` event, not a widened `ssh-recording-failed`.** The two lines say different things to the reader — `ssh recording failed` names the ssh session, and a harness tab's line should name the harness. Reusing the ssh event would either put "ssh" in front of a harness failure or force the ssh line's wording to change, and that wording is pinned by `product/specs/ssh-tab.md`, `product/specs/harness-recording.md`, and `documentation/user-documentation/advanced-agents/harness.md`. A second member of an existing union costs one `case` in each of the two switches in `src/notifications.ts`.

**The new event is explicit, not ambient** — it returns `true` from `shouldNotify` before the focus and config checks, in the same `case` group as `ssh-recording-failed`. The reason is the one already written down for the ssh event: the tab whose recording just failed is very often the tab the user is watching, which is exactly the case focus suppression would discard. It also means the failure is reported whether or not any `notifications.events` toggle is on, which matches how an audit gap should behave.

**`onFailure` becomes required.** Passing the callback from `harnessRuntime` fixes today's gap; making the parameter required is what stops the next spawn path from reintroducing it. Both are in the item, and only the second one holds against the next spawn path. With the parameter non-optional, `abandon()` calls `this.onFailure()` directly rather than `this.onFailure?.()`, and the recorder's class comment loses the "callers that omit it fail silently" sentence, which will no longer be true of any caller.

**`abandon()`'s once-only guard is unchanged.** The `failed` flag already makes both failure paths — the synchronous throw at open and the stream's async `'error'` event — report exactly once. The harness path inherits that for free, so "recorded once per tab, never repeated" holds for the new line the same way it does for the ssh one.

**Nothing about the recording itself changes.** The session still carries on unaffected; the recorder still stops writing. Only the reporting is added.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The callback shape and the notification it raises | `sshRuntime` in `src/harness/observers.ts:53`–`:55` |
| The once-only failure guard both paths land on | `HarnessRecorder.abandon()` in `src/harness/recorder.ts:96`–`:100` |
| The explicit-event `case` group that bypasses focus suppression | `shouldNotify` in `src/notifications.ts:48`–`:62` |
| The line-text switch | `notificationText` in `src/notifications.ts:90`–`:107` |
| The test style for a recorder failure and its callback | `src/harness/recorder.test.ts:155`, `:175` |
| The test style for an explicit event's `shouldNotify`/`notificationText` | `src/notifications.test.ts:111`–`:123` |

## Implementation steps

1. **`src/notifications.ts`: add the event.** Add `'harness-recording-failed'` to `NotificationEventType`; add it to the explicit `case` group in `shouldNotify`; return `'harness recording failed'` for it in `notificationText`. Extend the module's leading comment where it enumerates what each event means.

2. **`src/harness/recorder.ts`: make `onFailure` required.** Drop the `?` from the constructor parameter, call `this.onFailure()` in `abandon()`, and update the class comment so it no longer describes an omitting caller.

3. **`src/harness/observers.ts`: pass the callback from `harnessRuntime`.** Give the `new HarnessRecorder(...)` in `harnessRuntime` a sixth argument raising `notify(managers, 'harness-recording-failed', label)`, and update the factory's comment to say the recording failure is reported, dropping the asymmetry the current comment pair implies.

## Tests

- `src/harness/recorder.test.ts` — every existing construction site gains a callback (a `vi.fn()` where the test does not care). The last case, `leaves a caller that passed no callback failing silently`, describes a caller the type system no longer permits; it becomes `never lets a recording problem reach the session`, keeping the assertion that the failing emit does not throw and that no file is written, and adding that the callback fired exactly once. The two existing cases already cover the async stream-error path and the synchronous open-failure path, so no third failure case is needed.
- `src/notifications.test.ts` — a `harness-recording-failed` block mirroring the `ssh-recording-failed` one: it notifies with notifications all off, with an undefined config, and while the failing tab is the active tab; `notificationText('harness-recording-failed', 'claude')` is `'harness recording failed'`.

## Spec files

- `product/specs/harness-recording.md` — the recording-failure paragraph currently ends "A harness tab's recording failure is silent." Replace that with the harness line's behavior, alongside the ssh one.
- `product/specs/notifications.md` — add a `harness-recording-failed` bullet beside the `ssh-recording-failed` one, and drop the trailing "A harness tab's recording failure produces no notification." from the ssh bullet.

## Out of scope

- **`product/specs/ssh-tab.md` and the SSH section of `documentation/user-documentation/advanced-agents/harness.md`.** Both describe ssh behavior only, and ssh behavior does not change.
- **New user documentation for harness recording failures.** The docs' Recordings section never described the failure case, and adding a first description of it is a documentation-backlog item, not this fix.
- **Making `HarnessScreenReader` or the transcript tailer report their own failures.** Only the recorder's asymmetry is in the item.
- **Changing what a failure does to the session** — it still runs on, unrecorded.
