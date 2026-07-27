# Drag tab labels to reorder

**Complexity: 5/10** — the server half is small and well-precedented (one pure function beside `computeReorder` reusing `removeTabAt`/`renumberTabs`, one op beside `reorderTabOp`, one RPC beside `reorderTab`, and a validity check that is `canMoveTab`'s same-group comparison at arbitrary distance). The number is driven by the web half, a first-of-its-kind interaction here: there is no drag-and-drop anywhere in `web/src/` today, only the resize-divider mouse gesture (`web/src/drag-resize.ts`), so the live-shuffle preview and its Escape/commit state machine are new logic, wired into three strip call sites and coexisting with `TabItem`'s already-overloaded mouse-down/double-click handling.

## Summary

Tabs can be reordered today only with `Ctrl+←` / `Ctrl+→`, which walks the **active** tab one slot at a time and refuses to cross a group boundary (`canMoveTab`, `src/tab/utils.ts:11`, `return tabs[index].group === tabs[index_].group`). This plan adds direct manipulation: press a tab's label, drag it along its strip, and drop it in a new position. While the pointer moves, the strip reorders live — the dragged tab follows the pointer and its neighbors slide out of the way — so the strip always shows the order that will result on release. Dropping commits the move in one server round-trip.

The move is confined to the tab's own group, exactly as the keyboard reorder already is, so `tabs.md`'s group-contiguity invariant is preserved without changing the grouping model. All three tab strips get the gesture — the central action strip, the sidebar strips, and the reporting (monitor) strip — but a drag never leaves the strip it started in, so docking and undocking remain command-driven and untouched.

## Design decisions

1. **Live shuffle, not an insertion marker.** During the drag the dragged tab tracks the pointer and the other tabs in the strip shift into their would-be positions, so the strip is a continuous preview of the resulting order. No separate caret or ghost element.
2. **Clamped to the tab's own group.** The drop slot is constrained to the range spanned by the dragged tab's group run. Dragging the pointer past that range pins the preview at the group's edge rather than showing an invalid drop. This mirrors `canMoveTab` and means the feature introduces no way to re-parent a tab into another group and no way to move a group as a unit.
3. **All three strips, no cross-strip drags.** The central action strip, both sidebar strips, and the reporting strip each support reordering among their own entries. A drag is captured by the strip it began in; releasing over a different strip is treated as releasing outside (decision 7). Dragging a tab into or out of a sidebar — docking — stays out of this feature.
4. **The new RPC is `reorderTabTo { from, to }` — not `moveTab`.** `moveTab` is **already taken**: `src/protocol.ts:167` (`| { method: 'moveTab'; params: { dir: -1 | 1 } }`) is the active-tab *cycling* call, dispatched at `src/message-handler.ts:36` into `Controller.moveTab` (`src/controller.ts:123`) and `TabManager.moveTab` (`src/tab/manager.ts:156`, delegating to `moveTabOp`). Reusing that name would collide with an unrelated behavior. `reorderTabTo` names the absolute-destination sibling of the existing relative `reorderTab { dir }` (`src/protocol.ts:168`) and sorts next to it everywhere in the chain. The existing `reorderTab` stays exactly as it is for the keyboard path — this plan adds a call, it does not replace one.
5. **Indices are the server's full-array indices, not strip positions.** `from` and `to` both index `TabManager.tabs`, the same convention every other tab RPC already uses (`closeTab`/`renameTab` take `index`, `src/protocol.ts:158-159`), and the same translation the strips already perform: `useTabEntries` keeps each entry's server index precisely so RPCs can address it (`web/src/useTabEntries.ts:5-13`, "Each entry keeps its index in the server's full tab list for RPCs"), and `App.tsx` already maps through it for select/close/rename (`web/src/App.tsx:183-185`, `actionEntries[index].index`). The client translates its strip-local drop position into server indices before sending.
6. **Press still selects immediately; drag begins after a movement threshold.** Mouse-down keeps today's behavior — select the tab and focus the command bar (`web/src/TabItem.tsx:60-64`). The drag starts only once the pointer has moved past a small fixed threshold, so an ordinary click and the double-click-to-rename gesture (`web/src/TabItem.tsx:79-84`) are both unaffected, and a jittery click never reorders anything. The threshold is a module-level constant in the new drag hook, not a prop.
7. **Escape cancels; releasing outside the strip commits.** Pressing Escape mid-drag returns the tab to its original position and sends nothing to the server. Releasing the mouse anywhere else — including outside the strip or over another strip — commits the last valid slot the preview was showing.
8. **The dragged tab ends up focused, per strip.** In the central strip a committed drop leaves the dragged tab active, matching both the mouse-down-selects behavior and `Ctrl+←`/`Ctrl+→`, which keeps the moved tab focused (`src/controller.test.ts:386`, "focus follows the moved tab"). Two consequences that differ per strip, and are decided rather than left to the implementer:
   - **Sidebar strips need no work.** `Sidebar` holds its selection as a *view kind*, not a position (`web/src/Sidebar.tsx:86`, `entries.find((e) => e.tab.view === selectedView)`), so it already follows a reordered tab. Do not add index bookkeeping there.
   - **The reporting strip does need work.** `ReportingSection` holds `selected` as an **index** into `entries` (`web/src/ReportingSection.tsx:46,54`, `entries[Math.min(selected, entries.length - 1)]`), so after a reorder that index points at whatever tab now occupies the slot. Change it to track the selected tab's **label** and derive the index from it, so the selection follows the moved tab.
9. **Validity is `canMoveTab`'s comparison at arbitrary distance — not a whole-array contiguity validator.** Groups are already contiguous runs before any move, so a move is safe exactly when the destination lands inside the dragged tab's own run — that is, when `tabs[to].group === tabs[from].group`, the same single comparison `canMoveTab` makes against an immediate neighbor (`src/tab/utils.ts:11-15`). Splicing within one contiguous run cannot split any group, so nothing more needs checking; do not build a resulting-array scan.
10. **Docked and reporting tabs are exempt from that check.** The group rule exists to keep each group's colored band a single connected run *in the central strip* (`tabs.md:38`). A docked tab is not rendered there at all (`tabs.md:38`, "A tab can be temporarily absent from the strip while docked into a sidebar"; `web/src/useTabEntries.ts:12` filters `!e.tab.dock`), and reporting tabs are **group 0**, deliberately "outside the action-tab group system" (`src/monitor/window.ts:15-16`, `makeTab(..., 0, dotColor)`). So the comparison is skipped when the dragged tab is docked or in group 0. Without this exemption sidebar drags would be rejected almost always: a docked tab inherits its creator's group (`src/tab/creators.ts:59-61`, `creator?.group ?? 1`), so two sidebar entries routinely sit in different groups.
11. **Reporting-strip moves cannot shift action-tab indices.** Reporting tabs are appended at the end of the array precisely so "action-tab indices (including `activeTab`) never shift" (`src/monitor/window.ts:41-49`). Because they form a contiguous run at the tail and a drag is confined to its own strip (decision 3), a reporting-strip move only permutes that tail run. The implementer must not "fix up" `activeTab` for reporting moves — it is unaffected by construction.
12. **Persist only tabs that are persisted today.** `reorderTabOp` persists both affected tabs unconditionally (`src/tab/navigation-commands.ts:46-47`), and `TabManager.persist` writes straight to disk with no view-tab guard (`src/tab/manager.ts:109-113` → `saveAgentState`, `src/agent/state.ts:42-45`). `buildAgentStateFromTab` does not record `view` (`src/tab/agent-state.ts:13-27`), so persisting a monitor or file-navigator tab would write a state file that rehydrates as a plain agent tab — contradicting `tabs.md:150` ("View tabs are **live, in-memory** — none are persisted to agent state or restored on `--relaunch`"). The new op therefore skips the persist call for any tab carrying a `view`, and persists the rest exactly as `reorderTabOp` does. This is a deliberate divergence from `reorderTabOp`, not an oversight to be "corrected" back.
13. **Sidebar strips hold at most one tab per view kind.** Docking a second tab of the same view into an occupied side undocks the incumbent (`src/tab/dock.ts:26-28`), so a sidebar strip has at most three entries (files, notifications, schedules). The gesture is still wired there per decision 3, but do not build affordances that only pay off for long strips.

## What already exists (reuse, don't rebuild)

| Need | Existing precedent | Location |
| --- | --- | --- |
| Same-group validity comparison (the whole check — see decision 9) | `canMoveTab` | `src/tab/utils.ts:11-15` |
| Remove-a-tab-and-renumber half of the splice | `removeTabAt` | `src/tab/reorder.ts:15-17` |
| Renumber after the reinsert | `renumberTabs` | `src/tab/utils.ts:7-9` |
| Pure tab-array reorder computation to sit beside | `computeReorder` | `src/tab/reorder.ts:7-12` |
| Reorder side effects (unread clear, persist, `dirty` emit) | `reorderTabOp` | `src/tab/navigation-commands.ts:35-49` |
| Full RPC → controller → manager chain to mirror | `reorderTab` | `src/protocol.ts:168`, `src/message-handler.ts:38`, `src/controller.ts:127-129`, `src/tab/manager.ts:166-172` |
| Window-level mouse-drag gesture (move + self-removing mouseup) | `startDrag`, `beginResizeDrag` | `web/src/drag-resize.ts:7-27` |
| Strip rendering and its server-index mapping | `TabStrip`, `useTabEntries` | `web/src/TabStrip.tsx:13-39`, `web/src/useTabEntries.ts:10-20` |
| Existing overloaded press/double-click handling on a tab | `TabItem` | `web/src/TabItem.tsx:60-84` |
| The three strip call sites | central strip, sidebar strip, reporting strip | `web/src/App.tsx:180-190`, `web/src/Sidebar.tsx:93-103`, `web/src/ReportingSection.tsx:62-84` |
| Existing strip CSS to extend | `.tabstrip`, `.tab`, `.tab.active` | `web/src/theme.css:153-166` |
| Server tests for the keyboard reorder to mirror | reorder-within-group, edge no-op, cross-group blocked | `src/controller.test.ts:379-408` |
| RPC dispatch test to mirror | `routes reorderTab` | `src/message-handler.test.ts:122-125` (mock at `:36`) |

**One stale comment to ignore, not to trust.** `src/tab/reorder.ts:4-6` claims `computeReorder` swaps "skipping docked tabs, per `swapTabsLeft`/`swapTabsRight`". `swapTabsLeft`/`swapTabsRight` (`src/tab/utils.ts:17-33`) do no such skipping — they compare `group` only. Do not model the new function's behavior on that comment; model it on the code.

## Proposed changes

### Server — an absolute move alongside the existing relative one

A new pure function in `src/tab/reorder.ts`, alongside `computeReorder`, takes the tab array and a `from`/`to` index pair and returns the resulting array plus the moved tab's new index — or `undefined` when the move is a no-op or invalid, matching `computeReorder`'s `undefined`-means-no-op contract. It does not hand-roll the array surgery: `removeTabAt` (`src/tab/reorder.ts:15-17`) already drops a tab and renumbers, and `renumberTabs` (`src/tab/utils.ts:7-9`) already fixes up `number` after the reinsert — the function is a splice-in between those two existing helpers. Validity is the single same-group comparison of decisions 9 and 10, not a scan of the result. Out-of-range indices and `from === to` return `undefined`, consistent with how `setActiveTabOp` silently ignores an out-of-range index (`src/tab/navigation-commands.ts:17`); the range check stays because `from`/`to` arrive over an RPC, not from trusted in-process code.

A companion operation in `src/tab/navigation-commands.ts`, modelled on `reorderTabOp` (`:35-49`), wraps that computation with the same bookkeeping: apply the result, clear the moved tab's `hasUnread`, persist the affected tabs *unless they carry a `view`* (decision 12), and emit `state`/`dirty`. `TabManager` gains a `reorderTabTo(from, to)` method next to `reorderTab` (`src/tab/manager.ts:166-172`) delegating to it with the same `applyResult`/`persist`/`buildAgentState` callback shape; `Controller` gains the matching pass-through beside `reorderTab` (`src/controller.ts:127-129`); `src/protocol.ts` gains a `reorderTabTo` variant on the RPC union directly after `reorderTab` (`:168`); `src/message-handler.ts` gains its dispatch case beside `reorderTab`'s (`:38`).

Because `@shared` resolves to `../src` (`web/vite.config.ts:13`), the protocol addition is visible to the web client with no second declaration to keep in sync.

Size check: `src/tab/reorder.ts` is 17 lines and `src/tab/navigation-commands.ts` is 49; both stay far under the 200-line `max-lines` limit with these additions, so no extraction is needed on the server side. Relative imports in `src/` carry the `.js` extension, as the existing imports in these files already do.

### Web — a reusable strip-drag hook

A new module under `web/src/` owns the gesture, so none of the three strips duplicate it. It is given the strip's ordered entries (each carrying its server index and its group), the index the drag started on, and a commit callback; it returns the presentational state the strip needs — which entry is being dragged, its current pointer offset, and the previewed order — plus the handlers to attach.

The gesture is built on the app's existing mouse-drag helper, **not** on the browser's native HTML5 drag-and-drop API. Native DnD would cover a plain drop-target reorder, but it cannot drive the live-shuffle preview decision 1 asks for without hand-managing geometry anyway, and its default drag image and text-selection behavior fight the strip's "labels are not selectable" rule (`tabs.md:91`). `startDrag` (`web/src/drag-resize.ts:7-14`) already gives the exact lifetime this needs — a `mousemove` listener plus a `mouseup` that removes both — and is what every other drag in the app uses.

Its behavior: on mouse-down it records the origin and defers to today's select/focus path; once movement exceeds the threshold (decision 6) it captures the drag via `startDrag`. The strip's item rectangles are measured **once, at drag start** (`getBoundingClientRect` per rendered tab), not re-measured on every `mousemove` — during the drag the items only move by visual transforms, so the start-time geometry stays the right frame of reference and the pointer-to-slot mapping stays stable. The target slot is the item whose measured center is nearest the pointer by straight-line distance, clamped to the dragged tab's group run (decision 2). Nearest-center in two dimensions rather than a left-to-right position test is deliberate and required for correctness, not polish: `.tabstrip` is `display: flex; flex-wrap: wrap` (`web/src/theme.css:153`), so a strip with many tabs wraps onto multiple rows and an x-axis-only model would pick wrong slots on every row but the first.

A window `keydown` listener registered for the drag's lifetime cancels on Escape and discards the pending move (decision 7); the drag's own mouse-up commits the last previewed slot. `startDrag` self-removes its own pair on mouseup, so only the `keydown` listener needs explicit cleanup. Commit calls back with the source and destination positions *within the strip*; the strip's owner translates those to server indices (decision 5) and sends `reorderTabTo`.

`TabStrip` grows an optional reorder callback and passes each item its drag offset as a single optional number prop — the dragged tab's follow-the-pointer displacement, and each neighbor's shift — rather than a drag-state object; there is one call site per strip and nothing else needs the shape. `TabItem` applies it as a CSS transform alongside the `style` it already sets (`web/src/TabItem.tsx:59`). Its existing mouse-down handler is **chained, not replaced**, so selection, command-bar focus, and the double-click rename guard (`gestureStartedInactiveRef`, `web/src/TabItem.tsx:37,61,80`) keep working unchanged. New rules for the dragged and shifting states go beside the existing `.tab`/`.tabstrip` rules in `web/src/theme.css:153-166`.

Each strip wires the callback to its own entry list. `App.tsx` maps strip positions through `actionEntries` exactly as its existing `onSelect`/`onClose`/`onRename` handlers do (`web/src/App.tsx:181-185`); `Sidebar.tsx` does the same through its `entries` (`web/src/Sidebar.tsx:94-98`) and needs no selection change (decision 8); `ReportingSection.tsx` does the same through its `entries` (`web/src/ReportingSection.tsx:63-68`) and switches `selected` from an index to a label (decision 8).

**Deliberate ceiling on the preview.** The measure-once model assumes the strip's rows do not re-flow mid-drag. That holds for reordering, which permutes fixed-width items within a fixed set, but not for a tab opening, closing, or renaming while a drag is in flight — a rare race whose worst case is a preview one slot off until the drag ends, never a wrong committed move (the server validates `from`/`to` on arrival). If it ever needs fixing, the upgrade path is re-measuring when the strip's entry list changes identity, not a continuous measurement loop.

Size check: `TabStrip.tsx` (39 lines), `TabItem.tsx` (99), `Sidebar.tsx` (123) and `ReportingSection.tsx` (101) all have room. **`App.tsx` is 237 lines** and is the one file at risk — keep its addition to the single reorder handler passed into `TabStrip`, and if that pushes it over the limit, extract the handler into a small module beside `useTabEntries.ts` (the precedent for exactly this: `useTabEntries` was itself "split out of App.tsx to keep it under the file-size limit", `web/src/useTabEntries.ts:8-9`). Do not compact existing code to make room. Relative imports in `web/src/` stay extensionless.

### Spec

`product/specs/tabs.md` gains a short subsection describing drag-to-reorder: the live-shuffle preview, the group clamp, the threshold that keeps clicking and double-click rename intact, Escape-cancels / outside-release-commits, and that the dragged tab ends up focused. The Tab grouping section's existing reordering sentence (`tabs.md:38`, "Reordering (`Ctrl+←` / `Ctrl+→`) may only swap a tab with a neighbor **in the same group**") is extended to name dragging alongside the keyboard chords as a path subject to the same constraint. `product/specs/sidebars.md` notes that a sidebar's strip is reorderable within itself, that dragging never docks or undocks a tab, and that a reordered docked tab's new position is where it reappears on undock (`sidebars.md:39-40` currently promises "its original position within its group"). `product/specs/monitoring.md` notes the reporting strip is reorderable within itself.

## Implementation order

Land the server half first, then the web half — each is independently green.

1. Pure function in `src/tab/reorder.ts` + its tests. No callers yet.
2. Op in `src/tab/navigation-commands.ts`, `TabManager.reorderTabTo`, `Controller.reorderTabTo`, the `src/protocol.ts` variant, and the `src/message-handler.ts` dispatch case + their tests. The RPC is now reachable and testable with no UI.
3. The web drag hook + `TabStrip`/`TabItem` wiring + CSS, then the central strip call site in `App.tsx`.
4. The sidebar and reporting call sites, including `ReportingSection`'s index-to-label selection change.
5. Spec updates.

`./scripts/run.mjs check-diff` after each step.

## Tests

Server tests, colocated as `src/**/*.test.ts`:

- **New file `src/tab/reorder.test.ts`** (`src/tab/` has `utils.test.ts`, `index.test.ts`, `manager.test.ts`, but no `reorder.test.ts` today) — moving a tab left and right within its group; a move whose destination is in another group rejected; `from === to` and out-of-range indices returning `undefined`; `number` renumbered by position after the move; a docked tab moved past tabs of another group **accepted** (decision 10); group-0 reporting tabs permuted among themselves accepted.
- `src/controller.test.ts` — an end-to-end case beside the existing reorder trio (`:379-408`), reusing `makeController`/`c.dispatch('agent bob')`: `reorderTabTo` moves a non-active tab, leaves it active, renumbers, and does not disturb tabs outside its group. Add a case asserting a reporting-tab move leaves `activeTab` untouched (decision 11) and writes no state file for the view tab (decision 12).
- `src/message-handler.test.ts` — a `routes reorderTabTo` case mirroring `:122-125`, with the mock added beside `reorderTab: vi.fn()` at `:36`.

Web tests, colocated as `web/src/*.test.tsx`:

- `web/src/TabStrip.test.tsx` (exists) — mouse-down with no movement selects and emits no reorder; mouse-down + movement past the threshold + mouse-up emits exactly one reorder with the expected positions; Escape mid-drag emits nothing and restores the original order; release outside the strip commits the last previewed slot; a drag past a group boundary emits a position clamped inside the group; the double-click rename path still opens after a press that produced no movement.
- `web/src/Sidebar.test.tsx` (exists) — a reorder in the sidebar strip keeps the same view selected.
- `web/src/ReportingSection.test.tsx` (exists, see "renders the MonitorTab for the selected entry" at `:57`) — after reordering, the selected entry is still the same monitor tab, not whatever now sits at the old index.

## Out of scope

- Dragging a tab between strips, or dragging to dock/undock a tab into a sidebar.
- Re-parenting a tab into a different group, or dragging a whole group as a unit.
- Any change to `Ctrl+←`/`Ctrl+→`, to `moveTab`'s active-tab cycling, or to the grouping/persistence model.
- Touch or pointer-event support beyond the mouse gesture the rest of the app already uses.
- Reordering from the tab navigator picker or from a command.
- Fixing the stale `computeReorder` comment (`src/tab/reorder.ts:4-6`) — noted above so it misleads nobody, but this plan changes no existing code there.

## Open questions

None.

## Verification

- `./scripts/run.mjs check-diff` after each implementation step.
- Manual: with several tabs open across at least two groups (`agent bob`, then `profile launch <something>` for a second group), drag a tab within its group and confirm the neighbors shift live and the order sticks on release; drag past the group's edge and confirm the preview pins at the boundary and the order is unchanged there; press Escape mid-drag and confirm the strip snaps back with nothing sent; single-click a tab and confirm it still just selects and focuses the command bar; double-click the active tab's label and confirm rename still opens; dock a file navigator and a notifications tab into one sidebar and reorder them, confirming the visible view does not change; open two monitors and reorder the reporting strip, confirming the selected reporting body still shows the same monitor and the central strip's active tab is untouched; relaunch (`--relaunch`) and confirm the central strip's new order is restored and no monitor/file-navigator tab was resurrected as an agent tab.
