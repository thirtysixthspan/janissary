# Keep the far side's busy tracker in sync with the attach-time snapshot it hands out

Complexity 6/10 - the core fix is a small, additive method on `BusyTracker`, but it has to be
threaded through three more files (`serve-processes-detect.ts`, `serve-processes.ts`,
`serve-detach-capture.ts`, `serve-detach.ts`) purely as plumbing, since `HarnessDetection`'s
`currentBusy(): boolean` and `busyTransitionFrames`'s hardcoded `unread: false` both need to
carry the real value through instead. No new architecture; the risk is only in keeping every
call site's type in sync.

`BusyTracker.observe` suppresses any decision equal to the last one it *itself* reported via
`observe()`. But `DetachedPeer.accept()` sends its attach-time snapshot straight from
`busyStates()` with `unread: false` hardcoded, never touching the tracker's own `reported`
value. After an attach, the tracker can believe it already reported `{ busy: false, unread:
true }` (its last real `observe()` decision) while the client was actually told `{ busy: false,
unread: false }` by the attach snapshot. The next genuine stand-down or ready transition that
happens to compute that same `{ busy: false, unread: true }` value is then dropped as a
"repeat" the tracker thinks it already sent — even though the client was never told.

## Goal

`BusyTracker` gains a `snapshot()` method that returns `{ busy: this.busy, unread: false }` —
the exact shape `busyTransitionFrames` already sends on attach — and records that value as
`reported`, so the tracker's own bookkeeping never disagrees with what a caller sent on its
behalf. `HarnessDetection` exposes `snapshot()` instead of the bare `currentBusy(): boolean`,
so `busyStates()` and `busyTransitionFrames` carry the real `unread` value the tracker computed
rather than a value hardcoded at the call site.

## Approach

1. **`src/harness/busy-status.ts`**: add `snapshot(): BusyTransition { const transition = {
   busy: this.busy, unread: false }; this.reported = transition; return transition; }` to
   `BusyTracker`, directly below `current()`.
2. **`src/remote/serve-processes-detect.ts`**: change `HarnessDetection`'s `currentBusy: () =>
   boolean` field to `snapshot: () => BusyTransition` (import `BusyTransition` from
   `../harness/busy-status.js`, already imported for `BusyTracker`), and `buildHarnessDetection`'s
   returned object to `snapshot: () => tracker.snapshot()`.
3. **`src/remote/serve-processes.ts`**: change `busyStates()`'s return type to `Array<{ id:
   string; busy: boolean; unread: boolean }>` and its body to `[...this.detections].map(([id,
   detection]) => ({ id, ...detection.snapshot() }))`.
4. **`src/remote/serve-detach-capture.ts`**: change `busyTransitionFrames`'s parameter type to
   `Iterable<{ id: string; busy: boolean; unread: boolean }>` and stop hardcoding `unread:
   false` — map straight through: `{ type: 'busy-transition', id, busy, unread }`.
5. **`src/remote/serve-detach.ts`**: update `DetachedPeer`'s constructor parameter type
   `currentBusyStates: () => Iterable<{ id: string; busy: boolean }>` to add `unread: boolean`.
   No behavioral change here — it already just forwards whatever the function returns into
   `busyTransitionFrames`.

`serve.ts` needs no change: `() => this.processes?.busyStates() ?? []` keeps compiling once
`busyStates()`'s return type grows the `unread` field.

The "unread as an edge rather than a level" redesign the entry's Proposal Risk paragraph raises
is explicitly a "consider" aside, not a requirement, and is left alone: it would change
`busyStatusHandler`'s and `buildHarnessDetection`'s re-badge/re-`addBusy` behavior after a user
clears an unread flag or after `tab/cleanup.ts`/`profile/manager.ts` call `deleteBusy`, which is
a separate, deliberate behavior change outside what this entry's severity/risk assessment covers.

## Implementation steps

1. Add `BusyTracker.snapshot()` in `busy-status.ts`.
2. Change `HarnessDetection` and `buildHarnessDetection` in `serve-processes-detect.ts`.
3. Change `busyStates()` in `serve-processes.ts`.
4. Change `busyTransitionFrames` in `serve-detach-capture.ts`.
5. Change the `currentBusyStates` type in `serve-detach.ts`.
6. Run check-diff after each step; fix the ripple of type errors in test files last, together.

## Tests

- `src/harness/busy-status.test.ts`'s `BusyTracker` block: a case that observes a busy
  decision, takes a `snapshot()` (which resets the tracker's `reported` baseline to `{ busy:
  true, unread: false }`, matching what the snapshot itself carries), then drives the tracker
  through a ready transition and back to busy, asserting the decision that would have been
  wrongly suppressed under the old bug (identical to a decision from before the snapshot) is
  reported again because `snapshot()` reset the baseline.
- `src/remote/serve-processes.test.ts`: update the existing `busyStates()` case to assert the
  `unread` field is present and correct, not just `id`/`busy`.
- `src/remote/serve.test.ts`'s `capture-request and detection frames` block: update the existing
  `sends exactly one busy-transition frame on attach` case's `currentBusyStates` mock to supply
  `unread`, and assert the frame carries it through rather than the old hardcoded `false`. Add a
  case attaching twice with `currentBusyStates` returning the identical `{ busy, unread }` value
  both times, asserting the second attach still carries that value rather than it being dropped
  as a repeat — the DetachedPeer-level guarantee this entry's fix depends on holding.

The existing `busyStatusHandler debounce` tests in `busy-status.test.ts` pin the local debounce
and recap behavior and must keep passing unchanged.

## Out of scope

- The "unread as an edge, not a level" redesign (re-badging after the user clears a badge,
  re-`addBusy` after an external `deleteBusy`) — a separate, deliberate change.
- `src/tab/cleanup.ts` and `src/profile/manager.ts`'s `deleteBusy` calls — untouched.
- Any change to `busyStatusHandler`'s local (non-remote) behavior — it has no snapshot/attach
  concept at all; this entry is about the far side's detection only.
