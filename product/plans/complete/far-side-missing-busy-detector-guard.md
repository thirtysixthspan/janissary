# Apply the missing-busy-detector guard on the far side too

Complexity 4/10 - a guard added at one call site (`buildHarnessDetection`), following the
alternative shape the entry's own Proposal offers, plus one new field on the value returned when
there is no detector. No new architecture, no change to `BusyTracker`'s public surface, and no
change to `busyStatusHandler`'s already-correct local behavior.

`busyStatusHandler` in `src/harness/busy-status.ts` checks `Object.hasOwn(BUSY_TABLE, name)`
before ever building a `BusyTracker`, returning `undefined` (leaving the tab coarsely busy for
its whole lifetime) for a harness name absent from the table. `buildHarnessDetection` in
`src/remote/serve-processes-detect.ts` builds a `BusyTracker` unconditionally for every remote
harness spawn, so an unknown harness's remote tab gets fine-grained (and wrong) busy/ready
tracking that the identical tab run locally never gets.

## Goal

`buildHarnessDetection` skips building a `BusyTracker` entirely for a harness name absent from
`BUSY_TABLE`, mirroring `busyStatusHandler`'s guard exactly, so an unknown harness behaves
identically whether local or remote: coarsely busy for the whole process lifetime, no
`busy-transition` frames sent, and its attach-time `snapshot()` reports `{ busy: true, unread:
false }` rather than the tracker's actual (nonexistent) state.

## Approach

In `src/remote/serve-processes-detect.ts`, import `BUSY_TABLE` from `../harness/busy-classify.js`
(the same module `busy-status.ts` already imports it from). In `buildHarnessDetection`, compute
`const tracker = Object.hasOwn(BUSY_TABLE, harnessName) ? new BusyTracker() : undefined;`. In the
`HarnessScreenReader` capture callback, change `const transition = tracker.observe(...)` to
`const transition = tracker?.observe(...)`, so no transition is ever computed or sent for an
undetected harness. In the returned `HarnessDetection`, change `snapshot: () => tracker.snapshot()`
to `snapshot: () => tracker?.snapshot() ?? { busy: true, unread: false }` — the same shape
`BusyTracker.snapshot()` returns while genuinely busy, since an unknown harness never reports
ready.

This is the entry's "alternatively, guard at the call site" option rather than moving the guard
into `BusyTracker`'s constructor: it changes one file instead of `BusyTracker`'s public
constructor signature (which `busy-status.test.ts` constructs directly in a dozen places with no
harness-name argument today), and needs no change to `observe()`'s existing per-call
`harnessName` parameter.

## Implementation steps

1. Import `BUSY_TABLE` in `serve-processes-detect.ts`.
2. Guard the `BusyTracker` construction and thread `tracker?.` through the capture callback and
   the returned `snapshot`.
3. Run `check-diff`.

## Tests

- `src/remote/serve-processes.test.ts`: a case spawning a harness with no `BUSY_TABLE` entry,
  asserting no `busy-transition` frame is ever sent for it and `busyStates()` reports `{ busy:
  true, unread: false }` for its id.
- The existing claude/codex/opencode cases in `serve-processes.test.ts` and
  `busy-status.test.ts`'s `BusyTracker` block pin the detector-backed behavior and must keep
  passing unchanged — `busy-status.test.ts` itself needs no new case, since `BusyTracker` is
  unchanged; the guard this entry asks for is `busyStatusHandler`'s existing behavior, now also
  applied at the one remote call site that lacked it.

## Out of scope

- Moving the guard into `BusyTracker`'s constructor — the entry's own Proposal offers this as an
  equally valid alternative, and the call-site guard is the smaller, non-breaking change.
- Any change to `busyStatusHandler` itself, which already has this guard.
