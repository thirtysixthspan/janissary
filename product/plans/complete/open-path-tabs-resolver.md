# Pass a live tabs resolver from the open and activation path

**Complexity: 2/10** — one optional parameter added to one pure function, one argument added at its
single production call site, and one test case. The mechanism it fixes is already built and already
tested; what is missing is one caller using it.

The unread dwell deliberately resolves the tabs array when its interval is up rather than capturing
it when the dwell begins, because several operations replace the array wholesale and `removeTabAt`
maps every surviving tab into a fresh object. A captured array is therefore a detached copy within
seconds, and a dwell writing to one leaves the real tab untouched. Five of the six production callers
of the deferring operations pass a live resolver for exactly this reason. `applyOpenResult` in
`src/tab/open-result.ts` is the sixth, and it does not — so the dwell it begins on the open and
activation path captures `result.tabs` and can end up clearing a copy.

The consequence is worse than a badge that lingers. A close or reorder inside the three-second window
replaces the array; the dwell then clears the *detached* copy, which means the real tab keeps a badge
no amount of looking will remove, and the detached clear still announces itself on the `tabs` bus
channel, so it also cancels that tab's pending harness idle escalation. A harness that finished is
left visibly badged and never announced.

## Approach

Add the optional `resolveTabs` parameter to `applyOpenResult` in `src/tab/open-result.ts` and pass it
through to its `repairPaneSelections` call, then supply `() => port.tabs` from `applyOpenResult` in
`src/tab/selection-operations.ts`. That is the whole fix, and it is the same two-line shape the other
five call sites already use.

The parameter stays optional and the `resolveTabs ?? (() => tabs)` fallbacks in the other callers stay
where they are. They are not an oversight to be tidied away: `src/tab/dock.test.ts` and
`src/tab/split-selection.test.ts` call `applyDock` and `repairPaneSelections` directly with positional
arguments and rely on the default, so making the parameter required would mean rewriting test suites
to satisfy a production concern. The review entry that raised this explicitly made dropping the
fallbacks conditional on those callers still compiling; they would not, so the fallbacks remain and
this plan records why.

## Implementation steps

1. **`src/tab/open-result.ts`** — add `resolveTabs?: () => Tab[]` as the last parameter of
   `applyOpenResult` and pass it as the fourth argument to its `repairPaneSelections` call, matching
   how `src/tab/selection-operations.ts` already calls the same function for `repairSelections`.
   Extend the function's comment to say why the resolver is needed — that the dwell resolves at fire
   time because the array is replaced wholesale — so the next caller threading arguments through here
   knows to pass one rather than reaching the default.

2. **`src/tab/selection-operations.ts`** — pass `() => port.tabs` from `applyOpenResult` to
   `applyOpenResultOp`. The closure reads the field at fire time, so it resolves the array the
   manager holds then, not the one it held when the dwell began. Note in a comment that the guard
   inside `beginDwell` also resolves immediately, and that this is correct here: a tab being
   *opened* is not in `port.tabs` yet and so correctly arms nothing, while a pre-existing badged tab
   being activated already is.

## Tests

One new case in `src/tab/manager.test.ts`, driving the real `TabManager.applyOpenResult` and then
replacing the manager's tabs with fresh tab objects the way `removeTabAt` does, asserting the live
tab's badge comes off when the interval elapses. It fails against the current code, because the dwell
holds the pre-replacement array and clears a copy.

The existing case in `src/tab/dwell.test.ts` that "resolves the tabs array when the interval is up,
not when the dwell began" pins the mechanism and must keep passing; it is the reason this gap was
hard to see, because it exercises the resolver directly rather than through this caller. The
direct-call suites `src/tab/dock.test.ts` and `src/tab/split-selection.test.ts` rely on the default
and must keep passing untouched.

## Out of scope

- Removing the `resolveTabs ?? (() => tabs)` fallbacks. Two test suites call the affected functions
  positionally and depend on the default; removing it is a separate change with its own cost.
- Changing `beginDwell`'s guard to resolve only at fire time. The immediate resolution is what keeps
  the common case free of timers, and on this path it is correct for both kinds of tab.
- Any spec change. `product/specs/tabs.md` already describes the dwell's behavior; this brings one
  caller into line with it.
- `help.md` and `documentation/user-documentation/`. The documented behavior does not change.

## Verification

`$janissary/scripts/run.mjs check-diff`.

Then confirm the new case is load-bearing: revert the two-line change, run
`npx vitest run --project server src/tab/manager.test.ts`, and confirm it fails; restore and confirm
it passes. By hand: badge a background tab, run an `open` that activates it, close another tab within
three seconds, and confirm the badge is gone rather than stuck.
