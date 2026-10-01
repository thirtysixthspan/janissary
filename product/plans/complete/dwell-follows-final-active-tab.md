# Begin the unread dwell on the tab each operation actually leaves active

**Complexity: 4/10** — three small call-site changes in `src/tab/`, each naming a different tab for an existing `beginDwell` call, plus one widened callback return type. The risk is in the interaction: `setActiveTabOp` calls `beginDwell` after its callback has already run `repairSelections`, which begins a dwell of its own, and every `beginDwell` replaces the pending one, so the last call wins and must name the right tab.

The unread dwell has exactly one candidate — the active tab — and every `beginDwell` replaces whatever was pending. Two deferring sites name that candidate before the final active tab is settled:

- `reorderTabToOp` (`src/tab/navigation-commands.ts`) dwells the *moved* tab, but when the moved tab is docked or a group-0 reporting tab the previously active tab stays active. The dwell then runs against a hidden tab the user never sat on, and the active tab's own pending dwell is thrown away.
- `repairPaneSelections` (`src/tab/split-selection.ts`) dwells the tab it was passed, but on a split strip whose passed active tab is not a center action tab (a monitor tab) it swaps the active tab to the first left-pane tab. That tab never gets a dwell, so its badge is never taken off.

`setActiveTabOp` compounds the second: it dwells `tabs[index]` after `applyActiveTab` has repaired the selection, so even a fixed repair would be overwritten by a dwell on the monitor tab.

## Goal

Every `beginDwell` call names the tab the operation leaves active, so a badged tab the user is on loses its badge after the dwell and no hidden tab loses one through a dwell nobody sat through.

## Approach

1. **`src/tab/navigation-commands.ts` — `setActiveTabOp`.** Widen `applyActiveTab` to return the index that ended up active, and dwell `tabs[thatIndex]`. The only production caller, `setActiveTab` in `src/tab/operations.ts`, returns `port.activeTab` after `port.repairSelections()`. The tabs array is not replaced by a selection change, so indexing the same `tabs` is correct.
2. **`src/tab/navigation-commands.ts` — `reorderTabToOp`.** Dwell `result.tabs[nextActive]` instead of `moved`, skipping the call when `nextActive` names no tab (`findIndex` returned -1).
3. **`src/tab/split-selection.ts` — `repairPaneSelections`.** In the split branch, when the repair swapped the active tab (`nextActiveTab !== activeTab`), begin the dwell again for `liveActive`, replacing the one begun above the early return.

## Implementation steps

1. `setActiveTabOp` and `setActiveTab`: callback returns the resulting active index; dwell that tab.
2. `reorderTabToOp`: dwell the tab at `nextActive`.
3. `repairPaneSelections`: re-dwell `liveActive` when the split branch swapped the active tab.
4. Tests, below.

## Tests

- `src/tab/operations.test.ts` — dragging a badged docked tab with `reorderTabTo` while a badged active tab's dwell is pending leaves the active tab's dwell in place: after `UNREAD_DWELL_MS` the active tab's badge is gone and the docked tab's badge is still set.
- `src/tab/operations.test.ts` — `setActiveTab` on a monitor tab in a split strip, with a port whose `repairSelections` runs the real `repairSelections` from `src/tab/selection-operations.ts`, leaves the first left-pane tab active and clears that tab's badge after the dwell.
- `src/tab/split-selection.test.ts` — `repairPaneSelections` on a split strip whose passed active index is a monitor tab dwells the left-pane tab that becomes active.

Existing coverage that must keep passing: `src/tab/dwell.test.ts`, the deferred-clear cases in `src/tab/operations.test.ts`, `src/tab/dock.test.ts`, `src/tab/split-selection.test.ts`, the focus-path case in `src/controller.test.ts`, and the open-path cases in `src/tab/manager.test.ts`.

## Out of scope

- Whether a reorder of a docked or reporting tab should clear that tab's own badge at all. Before this pull request it did, immediately; after it, nothing clears it, which matches the rule that only a tab the user goes to dwells.
- Any change to the dwell module itself (`src/tab/dwell.ts`) or its interval.
- No spec change: `product/specs/tabs.md` § Unread badge already says the tab a route selects is the one that dwells; this fix makes the code match it.
