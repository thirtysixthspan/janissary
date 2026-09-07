# Consolidate the picker state plumbing behind one `usePickerOverlays` hook

**Complexity: 8/10** — eight picker hooks and the route-chooser state fold into one owner, three parallel prop/snapshot structures collapse into three projections of that owner, and ten files move together. No new architecture, no wire-protocol change, no user-visible behavior change; the risk is entirely in keeping the keyboard layer's ref-based snapshot shape byte-identical while its literal moves.

`web/src/pickers/overlay-registry.ts` already unified *which* overlay wins, and [`overlay-open-state-built-once.md`](overlay-open-state-built-once.md) unified the nine open/closed booleans behind `buildOverlayOpenState`. That plan's own "Out of scope" section named what this one finishes: *"The per-overlay indices, row lists, and callbacks. Only the open/closed booleans are unified here."*

Those indices, row lists, and callbacks are still spelled out by hand in three parallel places, all of them in `App.tsx`'s render body:

1. **The state fan-out.** Eight picker hooks (`useThemePicker`, `useAppThemePicker`, `useHistPicker`, `useTabNav`, `useQuickOpen`, `useQueuePicker`, `usePopulatePickers`) plus four pieces of route-chooser state (`route`, `routeIndex`, `routeReference`, `chooseRoute`) are called and destructured across ~40 lines, producing roughly fifty loose names in one scope.
2. **The render props.** ~28 of those names are re-listed as individual props on `<AppMain>`, which re-lists them again on `<PickerOverlays>`, and a fourth subset of nine is re-listed a third time inside `AppMain`'s `mountedProps` literal for `MountedViewLayers`. `AppMain` carries 78 props in total.
3. **The keyboard bags.** The same names are re-listed a final time — under a *different* vocabulary (`pickerIdx` for `pickerIndex`, `taskPickerIdx` for `taskPickerIndex`, `profiles` for `visibleProfiles`, `taskRows` for `visibleTasks`) — in the ~14-line `useAppWindowKeys` deps literal that fills `StateSnapshot & Callbacks`.

Adding a tenth overlay today means touching all four sites by hand; the registry only makes the *boolean* omission a compile error, not the missing index, row list, or callback.

## Goal

One hook, `usePickerOverlays`, owns every overlay's state and hands each consumer a bag shaped for it. `App.tsx` calls it once and passes three objects instead of fifty names. The `*Idx`/`*Index` translation happens in exactly one place instead of being restated at the call site. Every projection is built by a pure function with an explicit return type, so a field that goes missing is a compile error at the builder rather than a silently absent prop.

## Design decisions

**One owner, three projections — not one god object.** The hook returns `view` (what `PickerOverlays` renders from), `keys` (the picker half of the window-key snapshot and callbacks), and `commands` (the openers `useCommandBarSubmit` intercepts on), plus `overlays`, `route`, `serverState`, and the two queue-edit callbacks. These are not unrelated groups: they are the same state seen by the three consumers that already exist, which is the point of giving it one owner. Nothing becomes a context and nothing becomes ambient — every consumer still receives its bag explicitly.

**The projections are pure functions over a derived state type.** `buildPickerOverlayView` and `buildPickerKeyBindings` take one `PickerOverlaysState` argument and return an explicitly typed bag, so they test without a render (guidelines §8). `PickerOverlaysState` is *derived*, not restated: it is the intersection of the hooks' `ReturnType<typeof …>` plus the handful of values the hook computes itself (`recent`, `queueItems`, `tabs`, `syntaxTheme`, `commandInputRef`, `overlays`). Restating fifty fields to describe fifty fields would reintroduce the very duplication this removes.

**The keyboard snapshot's shape does not change — only where it is written.** `StateSnapshot` and `Callbacks` keep every field name and type they have today. `useWindowKeys.ts` re-declares them as `PickerKeySnapshot & { canSearch; searchOpen }` and `PickerKeyCallbacks & { openSearch }`, with the picker halves defined in `web/src/pickers/picker-key-bindings.ts`. This is the same move `overlay-open-state-built-once.md` made when it declared `StateSnapshot = OverlayOpenSources & { … }`, extended to the rest of the bag. `useAppWindowKeys` and its `useLatestRef` are untouched: the ref still receives one fresh object per render and the handler still reads it at event time, so the re-render contract is unchanged and no ref-based snapshot trades into a context.

**The dependency direction is fixed, not inverted.** The picker-facing types live in `web/src/pickers/` and the app shell (`useWindowKeys.ts`, `AppMain.tsx`, `App.tsx`) imports them — app → feature, the direction guidelines §3 requires. Declaring them the other way round (a `pickers/` module importing `../useWindowKeys`) would point a feature at the app shell. For the same reason `web/src/useTabNav.ts` and its test move to `web/src/pickers/`, beside the eight sibling picker hooks that already live there and beside the `TabNavPicker` they drive.

**`AppMain` takes one `pickers` prop and spreads it.** `PickerOverlayView` is the complete prop list of `PickerOverlays`, `queueItems` and `commandInputRef` included, so `AppMain` renders `<PickerOverlays {...pickers} />` and `PickerOverlays`'s own 40-line inline `Properties` type is replaced by that one import. The `overlays` prop leaves `AppMainProps` too — `pickers.overlays` is the same object, and it is what `commandBarSuppressed` and the `queueOpen` read already use.

**The fourth restatement becomes a function.** `mountedPickerOverlayProps` joins `PickerOverlayProps` in `web/src/pickers/picker-overlay-props.ts` and maps a `PickerOverlayView` onto the nine-field subset `MountedViewLayers` takes, reading the two open flags from `overlays.task` / `overlays.tabNav` exactly as `AppMain`'s literal does today.

**`syntaxTheme` stays in `App.tsx`.** Folding it into `useThemePicker` — mirroring how `useAppThemePicker` owns `theme` and its `data-theme` effect — is tempting and deliberately not done: the syntax theme's effect calls `applySyntaxTheme` from `web/src/editor/highlight/themes`, so moving it would make `pickers/` import `editor/`, a cross-feature import guidelines §3 forbids. `theme` has no such problem (its effect only touches `document.documentElement`), which is why the asymmetry is real rather than an oversight. `syntaxTheme` is passed into `usePickerOverlays` as an input, the way it is passed into `useThemePicker` today.

**No memoization is added.** Neither `AppMain` nor `PickerOverlays` is wrapped in `React.memo`, so today's ~78 individually-passed props are already rebuilt on every `App` render. Grouping them into objects changes render counts in neither direction, and adding `useMemo` to bags that are consumed by non-memoized components would be cost without benefit.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The ordered registry, `buildOverlayOpenState`, `firstOpenOverlay`, `commandBarSuppressed` | `web/src/pickers/overlay-registry.ts` |
| `OverlayOpenSources` — the nine open/closed inputs `PickerKeySnapshot` inherits | same file |
| The eight picker hooks being folded | `web/src/pickers/use{Theme,AppTheme,Hist,QuickOpen,Queue,Task,Profile}Picker.ts`, `web/src/pickers/usePopulatePickers.ts`, `web/src/useTabNav.ts` |
| `PickerOverlayProps` — the nine-field mounted-layer subset | `web/src/pickers/picker-overlay-props.ts` |
| The `useLatestRef` snapshot binding | `web/src/useAppWindowKeys.ts`, `web/src/useLatestRef.ts` |
| `getRecentHistory` | `web/src/history.ts` |
| The four literals being deleted | `web/src/App.tsx:36–184` (state fan-out + deps literal), `web/src/App.tsx:194–227` (`AppMain` props), `web/src/AppMain.tsx:73–89` (`PickerOverlays` props), `web/src/AppMain.tsx:130–135` (`mountedProps`) |

## Implementation steps

1. **`web/src/pickers/useTabNav.ts` — move it beside its siblings.** `git mv web/src/useTabNav.ts web/src/pickers/useTabNav.ts` and `git mv web/src/useTabNav.test.ts web/src/pickers/useTabNav.test.ts`. Fix the two relative imports inside them (`./tab-nav-match` → `../tab-nav-match`, `./ws` → `../ws`) and the test's import of the hook. No other file imports it besides `App.tsx`, which step 8 rewrites.

2. **`web/src/pickers/useRouteChooser.ts` — new.** The route chooser's four pieces of state as one hook: `route`/`setRoute`, `routeIndex`/`setRouteIndex`, the `routeRef` that `useServerState` compares against to decide when to re-highlight, and `chooseRoute` sending `{ method: 'chooseRoute', params: { index } }`. Nothing about it is new behavior — it is the same four declarations lifted out of `App.tsx` verbatim.

3. **`web/src/pickers/picker-overlays-state.ts` — new.** Export `PickerOverlaysState`: the intersection of `ReturnType<typeof …>` over the nine hooks (`useRouteChooser`, `useThemePicker`, `useAppThemePicker`, `useHistPicker`, `useTabNav`, `useQuickOpen`, `useQueuePicker`, `usePopulatePickers`) and `{ syntaxTheme: string; recent: string[]; queueItems: string[]; tabs: TabView[]; commandInputRef: React.RefObject<HTMLTextAreaElement | null>; overlays: OverlayOpenState }`. Its own module so the builders and the hook can both import it without a cycle. Use `import type { … }` for the hooks, since only their types are needed.

4. **`web/src/pickers/picker-overlay-view.ts` — new.** Export `PickerOverlayView` — the exact prop list `PickerOverlays` takes today, moved out of that file unchanged — and `buildPickerOverlayView(state: PickerOverlaysState): PickerOverlayView`, holding the one translation from state names to prop names (`chooseRoute` → `onPickRoute`, `pick` → `onPickHistory`, `visibleTasks` → `taskRows`, `visibleProfiles` → `profiles`, `selectNavTab` → `onPickTab`, `selectQueueIndex` → `onSelectQueue`, `pickQuickOpenFile` → `onPickQuickOpen`, and the rest).

5. **`web/src/pickers/picker-key-bindings.ts` — new.** Export `PickerKeySnapshot` (`OverlayOpenSources` plus the indices and row lists under the `*Idx` names the handlers read) and `PickerKeyCallbacks` (every callback in today's `Callbacks` except `openSearch`, `runCommand` included since the history picker's Enter is `cb.runCommand`), then `buildPickerKeyBindings(state: PickerOverlaysState): PickerKeySnapshot & PickerKeyCallbacks` holding the `*Index` → `*Idx` translation. Field names and types are copied from `useWindowKeys.ts` unchanged.

6. **`web/src/pickers/usePickerOverlays.ts` — new.** Takes `{ client, current, tabs, syntaxTheme, tasks, janissaryTasksDir, profiles, runCommand, inputRef, recallRef, dropRef }`. Calls the nine hooks, derives `recent` (`getRecentHistory(current?.cmdHistory ?? [], 10)`, memoized on `current` as `App.tsx` does now), `queueItems` (`current?.commandQueue ?? []`) and `harnessPtyId` (`current?.view === 'harness' ? current.harness?.ptyId : undefined`), builds `overlays` via `buildOverlayOpenState`, assembles `state` by spreading the nine hook results plus those extras, and returns `{ overlays, route, view, keys, commands, serverState, onEditQueued, onDeleteQueued }`. Declare `PickerCommands` (the six openers plus `navOpen`, `setNavOpen`, `openTabNavWithQuery`) and build it inline — it is nine fields and does not earn a module. `serverState` is `{ setRoute, setRouteIndex, setTheme, routeRef }`, exactly what `useServerState` needs from the pickers.

7. **`web/src/pickers/PickerOverlays.tsx` and `web/src/pickers/picker-overlay-props.ts`.** In `PickerOverlays.tsx`, delete the inline `Properties` type and take `PickerOverlayView` instead; the `switch` body is unchanged. In `picker-overlay-props.ts`, add `mountedPickerOverlayProps(view: PickerOverlayView): PickerOverlayProps`.

8. **`web/src/useWindowKeys.ts` — re-declare the two bags.** `StateSnapshot = PickerKeySnapshot & { canSearch: boolean; searchOpen: boolean }` and `Callbacks = PickerKeyCallbacks & { openSearch: () => void }`, keeping the comments that explain `canSearch`/`searchOpen`. Every function body in the file is untouched.

9. **`web/src/AppMain.tsx` — one prop for twenty-nine.** Replace `PickerProperties` in `AppMainProps` with `pickers: PickerOverlayView`, drop `overlays` from the props (read `pickers.overlays`), render `<PickerOverlays {...pickers} />`, and replace the nine-field picker half of `mountedProps` with `...mountedPickerOverlayProps(pickers)`.

10. **`web/src/App.tsx` — call it once.** Delete the eight picker-hook calls, the four route declarations, the `recent` memo, and the `getRecentHistory`/`buildOverlayOpenState` imports; call `usePickerOverlays` in their place. Then: `useServerState(client, { …, ...pickers.serverState })`; `useCmdWRefs(activeTab, quitConfirmOpen, unsavedQuitOpen, pickers.overlays, pickers.route)`; `useAppWindowKeys(client, handleScrollKey, handleScrollKeyUp, { ...pickers.keys, canSearch, searchOpen: search.searchOpen, openSearch: () => search.open('') })`; `useCommandBarSubmit({ ...pickers.commands, canSearch, lines, search, tabs, openQuitConfirm: guardedOpenQuitConfirm, guardRef, activeTab, runCommand })`; and `<AppMain … pickers={pickers.view} onEditQueued={pickers.onEditQueued} onDeleteQueued={pickers.onDeleteQueued} />` in place of the twenty-nine picker props. `syntaxTheme`/`setSyntaxTheme` and the `applySyntaxTheme` effect stay.

Run `./scripts/run.mjs check-diff` after each step.

## Tests

- `web/src/pickers/useRouteChooser.test.ts` — new. `chooseRoute(2)` sends `{ method: 'chooseRoute', params: { index: 2 } }`; `setRoute`/`setRouteIndex` drive the returned values; `routeRef` starts null and is the caller's to write (the contract `useServerState` relies on).
- `web/src/pickers/picker-overlay-view.test.ts` — new. `buildPickerOverlayView` puts each state field on its renamed prop and forwards every callback by identity — one case per rename, plus a case asserting the whole returned key set matches `PickerOverlays`'s props so a future field cannot be dropped silently.
- `web/src/pickers/picker-key-bindings.test.ts` — new. `buildPickerKeyBindings` maps `*Index` onto `*Idx`, `visibleTasks` onto itself, `visibleProfiles` onto `profiles`, and forwards every callback by identity; a case pins that the nine `OverlayOpenSources` fields survive the projection, since `dispatchModalKey` rebuilds the registry state from them.
- `web/src/pickers/picker-overlay-props.test.ts` — new. `mountedPickerOverlayProps` reads `taskPickerOpen` from `overlays.task` and `navOpen` from `overlays.tabNav`, not from any other field, and forwards the seven remaining values.
- `web/src/pickers/usePickerOverlays.test.tsx` — new. Rendered with `renderHook`: opening a picker through `commands` raises exactly its own flag in `overlays` and shows up in *both* `view` and `keys` (the anti-drift case that is the point of the change); `serverState.setRoute(view)` opens `overlays.route` and reaches `view.route`; `view.recent` reflects the active tab's `cmdHistory` and `view.queueItems` its `commandQueue`.
- `web/src/pickers/useTabNav.test.ts` — moves with the hook; contents unchanged apart from the import path.
- Must keep passing **unchanged**: `web/src/App.test.tsx` (the end-to-end proof that no behavior moved), `web/src/useWindowKeys.test.ts` and `web/src/useAppWindowKeys.test.ts` (the snapshot shape and the shared ref), `web/src/useCmdWRefs.test.ts`, `web/src/pickers/overlay-registry.test.ts`, and every existing per-picker hook and component test.

## Out of scope

- **Folding `syntaxTheme` into `useThemePicker`.** Blocked by the cross-feature import described above; it needs `applySyntaxTheme` to move to a shared location first, which is a separate change.
- **Replacing the nine `useState` pairs with one reducer.** The hooks stay nine independent owners; only their plumbing is consolidated.
- **Memoizing `AppMain` or `PickerOverlays`.** A render-performance change with its own measurement burden, not a plumbing one.
- **The remaining ~49 non-picker props on `AppMain`** — layout state, tab handles, dialogs, drop refs. A different set of concerns, each with its own owner.
- **`useCmdW`'s signature.** Still carries `routeRef` separately from `pickerOpenRef`, as `overlay-open-state-built-once.md` left it.
- **`web/src/tab-nav-match.ts`, `web/src/history.ts`, `web/src/fuzzy-match.ts`.** Pure modules at the `web/src/` root that pickers may import as-is; relocating them is a separate tidy-up.
