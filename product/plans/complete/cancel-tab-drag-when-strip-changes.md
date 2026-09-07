# Reconcile a tab-strip drag against the tab list underneath it

**Complexity: 4/10** — one hook carries the dragged tab's label alongside its index and checks it against the live tab list at the three points the drag reads geometry. One source file plus its test; no component, protocol, or server change.

## Goal

Stop a tab appearing or disappearing mid-drag from taking the window down, by ending the drag without reordering instead of indexing rectangles that no longer describe the strip.

## Approach

`useTabReorder` fills `Drag.rects` from `measuredTabs(strip)` once, the first time the pointer passes the drag threshold, and never revisits it. `transformFor` is rebuilt on every render and calls `previewOrder(tabs.length, …)` against the current `tabs` prop, then indexes `drag.rects[slot]` and `drag.rects[index]` with the result. Any render where `tabs.length` exceeds `rects.length` dereferences `undefined` — and there is no error boundary above the tab strip, so that render throw blanks the window until the user reloads. The tab list is server-driven: an agent opening a tab through its plugin capability, a schedule firing, a monitor's reporting tab arriving are all ordinary events that can land mid-gesture.

Carry the dragged tab's `label` on the `Drag` record beside `from`, and add one predicate — the strip a drag measured is still the strip on screen when the list is the same length and the dragged tab is still at `from` under the same label. Where it fails, the drag is over: `transformFor` returns `undefined` for every tab, so the preview unwinds and the tabs sit where they were, and the `mouseup` handler skips both `crossStripDrop.onDrop` and the reorder callback.

Re-measuring rather than cancelling is the larger change and can wait; cancelling is what stops the crash.

The gesture also reads two different tab arrays today — `allowedRange` runs inside the move callback and sees the `tabs` captured when `begin` was created, while `transformFor` sees the latest. Reconciling against a stale array would defeat the point, so the hook holds `tabs` in a ref and the drag callbacks read that. The divergence goes away as a consequence, and `begin` stops being rebuilt on every tab change.

`web/src/TabStrip.tsx` is the only caller and passes `tabs` straight through, so nothing else needs touching.

## Implementation steps

1. In `web/src/useTabReorder.ts`, add `label: string` to the `Drag` type and a `tabsRef` holding the current `tabs` prop.
2. Add a pure `dragMatchesStrip(drag, tabs)` returning whether the list is still the same length as the captured rectangles and still carries the dragged tab's label at `from`.
3. In `begin`, read the label from `tabsRef.current[from]` and bail out when there is no tab there; store it on the `Drag` record. Drop `tabs` from the callback's dependencies.
4. In the move callback, read the tab list from `tabsRef.current` and stop updating the previewed slot once `dragMatchesStrip` fails — the drag is finished, only the release still has to know not to act.
5. In the `mouseup` handler, require `dragMatchesStrip(current, tabsRef.current)` before either the cross-strip drop or the reorder callback runs.
6. In `transformFor`, return `undefined` for every tab when the check fails, before any rectangle is indexed.

## Tests

`web/src/TabStrip.test.tsx` covers the threshold, Escape cancellation, release outside the strip, the cross-strip drop, and group clamping — every one of them holding the tab list fixed for the whole gesture. Those must keep passing. Added:

- A tab inserted between `mousedown` and `mouseup`: the rerender does not throw, and the release reorders nothing. This is the crash.
- The dragged tab removed between `mousedown` and `mouseup`: the release reorders nothing, rather than moving whatever now sits at that index.
- A cross-strip drop released after the source strip gained a tab: `onDrop` is not called.

## Spec updates

`product/specs/tabs.md` — under the tab reordering description, state that a drag ends without reordering if the tab list changes while it is in flight.

## Docs

None. `documentation/user-documentation/getting-started/tabs.md` describes dragging a tab label to reorder it and to move it between panes, but says nothing about what happens when the list changes underneath the gesture — it does not even document the existing Escape cancellation. Nothing there is now wrong. `help.md` does not cover the drag.

## Out of scope

- Re-measuring the strip mid-drag so the gesture survives the change instead of ending.
- An error boundary above the tab strip.
- The residual case the item accepts: a tab inserted just before the release can still shift which slot the drop resolves to when the length happens to match.
