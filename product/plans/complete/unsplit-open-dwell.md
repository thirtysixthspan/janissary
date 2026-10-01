# Dwell on the unsplit open and activation path

**Complexity: 2/10** — one `beginDwell` call moved above one early return, and one test case added.
The deferral machinery is built and tested; what is missing is one call on one path.

Five activation paths start the unread dwell, and the open and activation path reaches it through
`repairPaneSelections` rather than through `setActiveTabOp`. That function returns early when either
pane holds no center tabs — which is every unsplit strip, the common case — and the return sits above
its `beginDwell` call. So on a strip with no split, `open`ing or otherwise activating a badged tab
arms no dwell at all: the badge is neither cleared after three seconds nor given the chance to
survive a glance. It simply stays, indefinitely, and — since the badge is what arms the thirty-second
harness idle escalation — a harness that finished in that state is badged forever and never announced.

The inconsistency is the user-visible part. The same tab reached by clicking it, by `next`, or by the
arrow keys loses its badge after three seconds; the same tab reached by `open` keeps it for the rest
of the session. The badge stops meaning "unread" and becomes a property of how the user navigated.

## Approach

Move the existing `beginDwell` call above the early return so one call covers both the split and the
unsplit case, rather than adding a second call. In an unsplit strip the tab that is active after the
selection is resolved is simply `activeTab` as passed in, so naming it needs none of the `centerTabs`
filtering the split branch does — which is what makes a single call above the return correct for both
rather than a coincidence.

The early return itself stays exactly as it is. It exists to skip pane assignment that has nothing to
repair, and that reasoning is independent of the dwell.

## Implementation steps

1. **`src/tab/split-selection.ts`** — in `repairPaneSelections`, begin the dwell for the resolved
   active tab before the `if (leftTabs.length === 0 || rightTabs.length === 0)` early return, and
   remove the call from below it so the split path does not dwell twice. The label is
   `tabs[activeTab].label` on the unsplit path — the index the caller passed is already the active
   one, since there is nothing to swap between panes — so guard on that tab existing rather than
   reaching for `centerTabs`. Update the comment above the call to say it covers both shapes, and
   keep the split-pane clear where it is: it is inside the split branch, which the unsplit path does
   not reach, and that is correct because a strip with no split has no second pane to clear.

2. **`src/tab/manager.test.ts`** — add a case beside "clears the live tab's badge after a close
   replaces the array mid-dwell". Badge a tab in an unsplit strip, activate it through
   `applyOpenResult`, and assert the badge is still set immediately and gone after `UNREAD_DWELL_MS`.
   The split-path counterpart is that neighbouring case, and between them the two shapes are covered
   from both sides.

## Tests

One new case in `src/tab/manager.test.ts`, using the same fake-timer scoping the neighbouring cases
established. No existing case changes.

## Out of scope

- Restructuring the early return or the pane-repair logic. The return is doing its job; only the
  dwell's position relative to it is wrong.
- The `resolveTabs` defaults elsewhere. Separate recorded findings, and `src/tab/dock.test.ts` and
  `src/tab/split-selection.test.ts` still call these functions positionally and depend on them.
- Any spec change. `product/specs/tabs.md` already says focusing a tab starts a dwell and that
  switching tabs restarts the clock; this makes the open path agree rather than changing the rule.
- `help.md` and `documentation/user-documentation/`.

## Verification

`$janissary/scripts/run.mjs check-diff`.

Then confirm the case is load-bearing: move the `beginDwell` call back below the early return, run
`npx vitest run --project server src/tab/manager.test.ts`, and confirm the new case fails; restore and
confirm it passes. By hand: badge a background tab in a strip with no split, activate it with `open`,
and confirm the flag clears after about three seconds rather than staying for the session.
