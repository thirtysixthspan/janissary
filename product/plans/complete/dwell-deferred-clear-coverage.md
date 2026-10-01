# Cover the deferred badge clears the plan named but left untested

**Complexity: 2/10** — five test cases across four existing suites, no source change at all. The
behavior they cover already ships; what is missing is evidence that four of the eight sites the
unread-badge consolidation touched still defer their clear.

Focusing a tab no longer clears its badge; it starts a three-second dwell. Five activation paths
defer — the direct focus path, a reorder that leaves a different tab active, a tab undocked back to
the center strip, and the tab a close promotes to active — and each is wired separately, with its own
optional `resolveTabs` argument threaded to it. Four of those five have no test exercising the
deferral, and neither does the new `TabManager.dispose()` that releases a pending dwell. The plan
this feature shipped under asked for a case per site specifically so the consolidation of eight clear
sites could not quietly drop one; that part of it was not delivered.

The gap is easy to miss because the mechanism *is* tested. `src/tab/dwell.test.ts` pins the
resolve-at-fire-time contract and the replace-on-every-call rule directly, and four sibling suites
cover the direct focus path. What nothing covers is the wiring at the four other call sites — the
kind of omission that survives review precisely because the shared behavior looks well tested.

## Approach

Add cases only. Two go in suites that already exist for the function under test, and two go in
`src/tab/operations.test.ts` rather than in the files the original entry named, because those
functions are only reachable through a `TabOperationsPort` and that file is where the port helper
lives: `src/tab/reorder.test.ts` exercises the pure `computeReorder`/`computeReorderTo` array
computations and never builds a port, and `src/tab/cleanup.test.ts` covers `closeTabResources`, the
resource walk, rather than `closeTabOp`. Putting them where the harness exists is the difference
between a test and a plan item that cannot be started.

Every case follows the pattern the feature's own suites established: `vi.useFakeTimers()` scoped to
the case in a `try`/`finally` that restores real timers, so no pending fake timer leaks into a
later case, and `UNREAD_DWELL_MS` imported from `src/tab/dwell.ts` rather than a literal.

## Implementation steps

1. **`src/tab/dock.test.ts`** — two cases. Undocking a badged tab back to the center strip leaves
   its badge set immediately and clears it after the interval, since undocking makes the tab the
   active one and so starts its dwell. Docking a badged tab into a sidebar leaves the badge in place
   and arms nothing: a docked tab is permanently visible chrome, was never selected, and so has no
   dwell coming — which is why the badge is deliberately not cleared on that branch either.

2. **`src/tab/operations.test.ts`** — three cases, using the existing `makePort` and the `tab`
   helper, which already sets `hasUnread` on every tab it builds. `reorderTab` on a three-tab strip
   leaves a different tab active, and that tab holds its badge until the interval is up;
   `reorderTabTo` likewise for the tab it lands on; and `closeTab` promotes a survivor to active,
   whose badge likewise survives the immediate moment. Read the badge back through `port.tabs`
   rather than a captured array — `removeTabAt` maps every survivor into a fresh object.

3. **`src/tab/manager.test.ts`** — one case. Begin a dwell through the manager, call the new
   `dispose()`, and assert the badge survives: that is the release path `Controller.shutdown`
   reaches through `MANAGER_DISPOSE_ORDER`, and nothing else exercises it.

## Tests

Five new cases, one to two per file as above. No existing case is modified, and no source file
changes.

## Out of scope

- Changing any behavior. Every case here asserts what the code already does; if one fails, the fix
  belongs in a separate recorded finding, not in a test edit here.
- Covering `applyOpenResult` and `repairPaneSelections` on a split, which the open-path work already
  covers, and the unsplit open path, which is a separate recorded finding.
- Any spec or documentation change. `product/specs/tabs.md` already names the five deferring paths
  and the two immediate ones; this adds evidence for text that is already written.

## Verification

`$janissary/scripts/run.mjs check-diff`.

Each case is load-bearing in the sense that it asserts a value at a specific moment — badge present
before the interval, absent after — so a regression that reverted a site to an immediate clear
fails the "before" assertion and one that dropped the `beginDwell` call fails the "after". To confirm
the wiring is genuinely covered rather than incidentally, temporarily remove the `beginDwell` call
from `applyDock` in `src/tab/dock.ts` and confirm its case fails, then restore it.
