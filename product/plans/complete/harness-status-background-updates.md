# Fix: harness status updates stall while the tab is backgrounded

**Complexity: 3/10** — one-file server fix plus regression tests; the busy/ready detection
pipeline already works, it just never notifies clients of its results, so the fix is emitting the
existing `state: dirty` bus event at the right moments.

## Goal

A harness tab's busy dot (and permission-gate unread badge) should update the moment the
harness's actual state changes, whether or not that tab is the active one. Today the dot only
changes once the tab is foregrounded.

## Background (verified)

- Busy/ready recognition is server-side and always on: `HarnessScreenReader`
  (`src/harness/screen.ts`) mirrors every harness PTY into a headless xterm and produces a
  capture ~1s after each output burst, regardless of which tab the client is viewing. Each
  capture flows through the handler built by `busyStatusHandler`
  (`src/harness/busy-status.ts`), which calls `managers.tab.addBusy(label)`,
  `managers.tab.deleteBusy(label)`, and `managers.tab.markUnread(label)`.
- Those `TabManager` mutations (`src/tab/manager.ts`) update the busy set and `tab.hasUnread`
  silently — none of them emits a `state: dirty` bus event, and neither does the busy-status
  handler. Clients only receive fresh state when something emits `state: dirty`
  (`wireControllerEvents` in `src/controller-events.ts` maps it to `sinks.emitState()`).
- The codebase convention is that the flow *around* a busy mutation emits `dirty` itself:
  `TabManager.finishRunning` and `TabManager.append` both mutate and then emit; the ACP manager's
  busy calls ride on appends that emit. The harness busy handler is the one flow with no
  accompanying emission, so its state changes sit server-side, invisible.
- Foregrounding the tab "fixes" it because `TabManager.setActiveTab` emits `state: dirty`
  (`src/tab/manager.ts:174-181`), pushing the accumulated state — which is exactly the reported
  symptom: status only changes once the harness is foregrounded.
- The spec (`product/specs/harness.md`, "Busy/ready status") says the dot "tracks what the
  harness is actually doing" with no focus requirement, and the tab-strip section describes the
  dot blinking while the harness works — behavior that must hold for background tabs to be
  useful at all.

## Reproduction

Regression tests in `src/harness/busy-status.test.ts` (`describe('busyStatusHandler state
push')`) subscribe to the `state` bus channel and feed captures through the handler built by
`busyStatusHandler` with a stateful `TabManager` stub:

- a busy capture (claude's spinner title) emitted **zero** `dirty` events — expected one;
- a committed busy→ready transition (two consecutive idle captures) emitted zero — expected one;
- a permission-gate capture that badges the tab unread emitted zero — expected one.

All four new tests fail on master with `expected +0 to be 1`.

## Correct behavior

When the busy-status handler changes a harness tab's busy state or unread badge, the server must
emit `state: dirty` so connected clients are pushed the new tab state immediately — the dot and
badge then update live for background tabs, matching the spec. Captures that do not change
anything (repeated busy frames, the first debounced ready frame) must not emit, so an active
harness's ~1s capture cadence doesn't spam full-state broadcasts.

## Approach

Keep the mutation logic in `busyStatusHandler` exactly as is, but wrap it: snapshot the tab's
busy + unread state before applying a capture, and emit `state: dirty` after only if the
snapshot changed. This keeps the emission at the flow level (matching `finishRunning`/`append`
convention) rather than making every `addBusy`/`deleteBusy` caller emit, and makes emissions
exactly transition-edged for free — no new debounce state.

## Implementation

1. **`src/harness/busy-status.ts`** — import `messageBus`; extract the current handler body into
   an inner `apply(capture)` closure (unchanged logic, including `pendingReady`); return a
   handler that computes `before = isBusy(label) + hasUnread`, calls `apply`, recomputes, and
   emits `state: dirty` when they differ. Update the function's doc comment to note the
   client push.
2. **`src/harness/busy-status.test.ts`** — the new `busyStatusHandler state push` describe block
   (already written as the reproduction) with a stateful stub exposing `tabs`, `isBusy`,
   `addBusy`, `deleteBusy`, `markUnread`; existing debounce tests' `make()` helper gains the
   same stateful fields so the wrapper's `isBusy`/`tabs` reads work.

## Tests

`src/harness/busy-status.test.ts`, `describe('busyStatusHandler state push', ...)`:

1. `'pushes state when the harness turns busy'` — one `dirty` on the ready→busy edge.
2. `'pushes state when the debounced ready transition commits'` — no emission on the first
   (debounced) ready capture, one on the committing second.
3. `'does not push again while captures keep the same state'` — repeated busy captures emit once.
4. `'pushes state when a permission gate badges the tab unread'` — gate capture with no approver
   marks unread and emits.

All four fail without the fix (verified on master) and must pass with it.

## Verification

`./scripts/run.mjs check-diff` passes clean, including the four new tests. Manual: launch two
harness tabs, give the backgrounded one a prompt, and watch its tab-strip dot start blinking and
stop on completion without focusing it. Not runnable unattended in this environment — noted in
the report if skipped.

## Out of scope

- Making `TabManager.addBusy`/`deleteBusy`/`markUnread` emit `state: dirty` themselves — other
  callers already emit at flow level; changing the primitives would double-emit on those paths.
- Busy/ready recognition rules, capture cadence, and the two-capture ready debounce — unchanged.
- The unread badge's focus-suppression rule (`markUnread` skips the active tab) — unchanged.
