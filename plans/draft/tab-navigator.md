# Fuzzy Tab/Workspace Navigator

**Complexity: 3/10** — one new picker component plus keyboard-handler wiring, entirely client-side, but must follow the existing centralized-keydown-listener architecture instead of adding a second, competing `keydown` listener.

## Summary

Add a command-mode picker for tabs, analogous to `hist`'s command-history picker. A keybinding (`Ctrl+G` or a `nav` command) opens a fuzzy-searchable modal list of every open tab — agent, harness, SSH, viewer, reporting — filterable by typing part of its label, with arrow/Enter to jump straight to it. The picker reuses the `hist` UI pattern, just pointed at tabs instead of command history.

## Decisions (to be confirmed with user)

1. **Trigger: dedicated keybinding + command.** `Ctrl+G` in the default keymap opens the navigator. A `nav` command (with optional fuzzy query: `nav depl`) provides a command-line entry point for agents and scripting. If the navigator is already open, `Ctrl+G` / `nav` dismisses it.
2. **Picker UI model: modal overlay, not a tab.** The picker renders as a floating modal above the command bar, mirroring the `HistPicker` / `RouteChooser` pattern. It is NOT a tab — no strip entry, no transcript, no persistence.
3. **Filtering: fuzzy substring on tab label + number.** Typing `deploy` matches tabs containing "deploy" anywhere in their label. `3` matches tab number 3 or labels containing "3". Numbers are also matched as-is for quick jump (type `3`, see tab #3 at the top).
4. **Controller model: server-owned, client-rendered.** Tab list comes from the server via the existing `StateEvent` snapshot — no new RPC needed. Selection dispatches `setActiveTab` with the chosen index. Server involvement is zero beyond serving state and honoring `setActiveTab`.
5. **Keybindings within the picker:** `Ctrl+G` (toggle), `Up`/`Down` (navigate), `Enter` (select and dismiss), `Escape` (dismiss), `Ctrl+N`/`Ctrl+P` (navigate), type-to-filter (input intercepts all printable keys).

## The central fact this plan must be built around

**All keyboard handling for pickers/modals in this app goes through one centralized `keydown` listener, not per-component listeners.** `useWindowKeys` (`web/src/useWindowKeys.ts:52-86`) attaches a *single* `globalThis.addEventListener('keydown', onKey)`. Its handler checks modal/picker state in priority order (`snap.route` → `snap.themePickerOpen` → `snap.pickerOpen` → global shortcuts like `Ctrl+R`/`Cmd+F` → tab shortcuts) and dispatches to a pure function from `keyboard-handlers.ts` (`handleRouteChooserKey`, `handlePickerKey`), then `return`s so nothing else in the chain fires. Neither `HistoryPicker.tsx` nor `RouteChooser.tsx` — both pure renderers taking `selected`/`items`/`onPick` as props — attaches its own listener; `App.tsx` owns all the open/index/query state and passes it down.

The plan's original section 1 (a component-local `useEffect` with its own `keydown` listener inside `TabNavPicker.tsx`) would create a **second, independent global listener** alongside `useWindowKeys`'s. Since `addEventListener` doesn't replace prior listeners, both would fire on every keydown: `useWindowKeys`'s chain has no way to know the tab navigator is open and would keep processing `Ctrl+R`/`Cmd+F`/tab-reorder shortcuts underneath it, and Escape/Enter could double-fire. The fix is to extend the existing single listener, not add a new one — see the redesigned Proposed changes below. This is the most important correction in this pass.

One genuine difference from `hist`/`RouteChooser`: those never handle live typed text (`hist`'s list is a fixed `getRecentHistory(...)` snapshot filtered by nothing; arrows just move a selection). Fuzzy type-to-filter has no precedent anywhere in the picker system. Extending `handlePickerKey`'s style to also capture printable characters (building a `query` string via `e.key`, with `Backspace` trimming it) is the natural extension **within the existing architecture** — see Proposed changes.

## What already exists (reuse, don't rebuild)

| Need | Existing mechanism | Location |
| --- | --- | --- |
| Floating-modal-above-command-bar rendering | `RouteChooser.tsx` / `HistoryPicker.tsx` — pure renderers, `.picker`/`.picker-row` CSS classes | `web/src/RouteChooser.tsx`, `web/src/HistoryPicker.tsx` |
| Centralized keydown dispatch for picker/modal state | `useWindowKeys` (`web/src/useWindowKeys.ts:52-86`) + pure handler functions in `keyboard-handlers.ts` (`handleRouteChooserKey`, `handlePickerKey`) | `web/src/useWindowKeys.ts`, `web/src/keyboard-handlers.ts` |
| A global chord that opens a picker regardless of focus | `Ctrl+R` → `cb.openPicker()` (`web/src/useWindowKeys.ts:75`) — `Ctrl+G` should be added the same way, in the same `onKey` chain | `web/src/useWindowKeys.ts:75` |
| Tab list mirrored client-side | `App.tsx` holds `tabs: TabView[]` from the `state` snapshot; no new RPC needed | `web/src/App.tsx` |
| Jumping to a tab | `setActiveTab` RPC (`{ method: 'setActiveTab'; params: { index: number } }`, `src/protocol.ts:87`), routed via `src/message-handler.ts:18` to `Controller.setActiveTab` | `src/protocol.ts:87`, `src/message-handler.ts:18` |
| Signaling "some modal/picker is open" to `CommandInput` | The existing combined boolean already ORs several flags together: `pickerOpen={pickerOpen || route !== null || quitConfirmOpen || themePickerOpen}` (`web/src/App.tsx:217`) — add `|| navOpen` the same way | `web/src/App.tsx:217` |

## Proposed changes

### 1. Web UI — `TabNavPicker` component

- New module `web/src/TabNavPicker.tsx`, a **pure renderer** like `HistoryPicker`/`RouteChooser` — no internal `keydown` listener, no internal state:
  - Props: `tabs: TabView[]`, `query: string`, `selected: number` (index into the filtered list), `onPick: (index: number) => void` (called with the tab's real index in `tabs[]`, matching `HistoryPicker`'s `onPick` shape).
  - Filtering/sorting is computed by the caller (`App.tsx`, via a small pure helper — see below), not inside the component, matching how `HistoryPicker` receives an already-computed `items` list rather than filtering internally.
  - Each row: `tab.number` + dot color swatch (inline CSS `background-color: tab.dotColor`) + label text with the matched substring highlighted.
  - Styling: `tab-nav-picker` class in `theme.css`, following the existing `.picker`/`.picker-row` rules `RouteChooser`/`HistoryPicker` already use (`position: absolute`, bottom-anchored above the command bar) rather than inventing new positioning.
- New pure helper (in `web/src/TabNavPicker.tsx` or a small sibling module): `filterTabs(tabs: TabView[], query: string): { tab: TabView; index: number }[]` — substring match on `label` (case-insensitive) plus exact/prefix match on `String(tab.number)`, sorted with number matches first then alphabetical by label. This is the one piece of genuinely new logic in this plan.
- `TabView`: no changes needed. The picker reads `tabs[i].label`, `tabs[i].dotColor`, `tabs[i].number`, all already present (`src/protocol.ts:30-32`).

### 2. Keyboard handling — extend the existing centralized listener, don't add a new one

- `App.tsx` gains `navOpen: boolean`, `navQuery: string`, `navIdx: number` state (mirroring `pickerOpen`/`pickerIdx`) and a `navTabs = useMemo(() => filterTabs(tabs, navQuery), [tabs, navQuery])`.
- `useWindowKeys`'s `StateSnapshot`/`Callbacks` types (`web/src/useWindowKeys.ts:7-33`) gain `navOpen`, `navQuery`, `navIdx`, `navTabs` and `setNavQuery`, `setNavIndex`, `selectNavTab`, `setNavOpen`/`openTabNav` respectively — same shape as the existing `pickerOpen`/`pickerIdx`/`recent` trio and their callbacks.
- In `useWindowKeys.ts`'s `onKey` chain (`web/src/useWindowKeys.ts:52-79`), add a `if (snap.navOpen) { handleTabNavKey(e, snap.navTabs, snap.navIdx, cb.setNavIndex, cb.selectNavTab, cb.setNavOpen, snap.navQuery, cb.setNavQuery); return; }` branch, in the same priority position as the existing `snap.pickerOpen` branch (before it, so the two modals can't both claim a keystroke).
- Add `if (e.ctrlKey && e.key.toLowerCase() === 'g') { e.preventDefault(); cb.openTabNav(); return; }` alongside the existing `Ctrl+R` case (`web/src/useWindowKeys.ts:75`) — same pattern, no PTY/editor guard needed since `Ctrl+R` has none either and both live in the same unconditional global listener.
- New `handleTabNavKey` in `web/src/keyboard-handlers.ts`, extending `handlePickerKey`'s shape (`web/src/keyboard-handlers.ts:19-34`) with query editing: `ArrowUp`/`ArrowDown`/`Ctrl+P`/`Ctrl+N` move `navIdx` clamped to `navTabs.length`; `Enter` calls `selectNavTab(navTabs[navIdx]?.index)` and closes; `Escape` closes; `Backspace` trims the last character off `navQuery`; any other single printable character (`e.key.length === 1 && !e.ctrlKey && !e.metaKey`) appends to `navQuery` and resets `navIdx` to `0`. This mirrors how the rest of the app's pickers handle keys through `e.key` rather than a real `<input>` element — consistent with `handlePickerKey`/`handleRouteChooserKey`, though it means paste and IME composition aren't supported (acceptable for a short fuzzy label filter; note this explicitly in Out of scope rather than leaving it implicit).
- The `nav` command (`nav <query>` from the command line, per decision 1) still routes through `App.tsx`'s existing `onSubmit` special-casing (`web/src/App.tsx:205-214`, next to the `syntax theme`/`quit` cases) rather than `CommandInput.tsx` itself — it calls `openTabNav()` and seeds `navQuery` with whatever followed `nav `, instead of sending the text to the server.

### 3. App integration

- `App.tsx`: add the `navOpen`/`navQuery`/`navIdx` state and `navTabs` memo above; a `selectNavTab(index)` callback that sends `setActiveTab` (`{ method: 'setActiveTab', params: { index } }`) and closes the picker.
- Render `<TabNavPicker tabs={tabs} query={navQuery} selected={navIdx} onPick={selectNavTab} />` above the command area when `navOpen` is true, positioned like `HistoryPicker`/`RouteChooser` (`web/src/App.tsx:193-197`).
- Extend the combined picker-open boolean passed to `CommandInput` (`web/src/App.tsx:217`) with `|| navOpen`, matching how `themePickerOpen`/`quitConfirmOpen` are already ORed in.
- The `hist` button in the command bar already serves as a chooser opener; the tab navigator could co-locate a second button or rely on `Ctrl+G` exclusively — decide during implementation based on how crowded the command bar already is (not load-bearing either way).

### 4. Specs

- New `specs/tab-navigator.md`: keybinding, `nav` command, picker UX (modal overlay, keyboard-only operation), filtering rules (substring, number match), data flow (server state → client render), and the `Escape` / click-outside-to-dismiss behavior.
- `specs/keyboard-navigation.md`: add `Ctrl+G` → tab navigator to the keybinding table.

### 5. Tests (colocated, run via `./scripts/run.mjs check-diff`)

- `web/src/TabNavPicker.test.tsx`: renders tab list, filters by query substring, navigates with arrows, Enter selects and calls onSelect with the correct index, Escape dismisses, Ctrl+P/N work, number matching.
- `web/src/keyboard-handlers.test.ts` (existing file — has coverage of `handlePickerKey`/`handleRouteChooserKey` already, add alongside): `handleTabNavKey` — arrows/Ctrl+P/N move `navIdx` clamped to the filtered list length, Enter selects and closes, Escape closes, Backspace trims `navQuery`, a printable character appends to `navQuery` and resets `navIdx`.
- `web/src/useWindowKeys.test.ts` (existing file, has `Ctrl+R` coverage per line 105 pattern — add alongside): `Ctrl+G` calls `cb.openTabNav()`; when `snap.navOpen` is true, keys dispatch to `handleTabNavKey` instead of falling through to tab shortcuts.
- `web/src/TabNavPicker.test.tsx`: renders the given `tabs`/`query`/`selected` props, highlights the matched substring, clicking a row calls `onPick` with that tab's index; `filterTabs` unit-tested separately for substring match, number match, and sort order.
- `web/src/App.test.tsx`: `nav <query>` typed into the command bar opens the picker seeded with that query instead of sending it to the server (mirroring the existing `hist`/`syntax theme` special-case tests already in this file).

## Out of scope

- A more sophisticated fuzzy scorer (e.g. character-subsequence matching) beyond substring/number matching — explicitly deferred per decision 3.
- Paste or IME composition support while typing the filter query, since query editing goes through `e.key` in the centralized listener rather than a real `<input>` element, matching every other picker in the app (see "central fact" above).
- A dedicated command-bar button for the navigator (deferred to implementation-time judgment, not a design decision this plan needs to make).

## Verification

- `./scripts/run.mjs check-diff` after each implementation step.
- Manual end-to-end check: open several tabs with distinct labels, press `Ctrl+G`, confirm the picker opens above the command bar; type a substring of one tab's label and confirm the list filters and highlights the match; use arrows/Ctrl+P/N to move selection, Enter to jump to it, and confirm the app's active tab changes and the picker closes; reopen with `Ctrl+G` and press Escape, confirming it closes without changing the active tab; run `nav depl` from the command line and confirm it opens the picker pre-filtered to "depl" instead of sending the text as a command.

## Implementation order

1. `filterTabs` helper + `TabNavPicker` pure-renderer component, tests. No dependency on later steps.
2. Keyboard handling: `navOpen`/`navQuery`/`navIdx` state and `openTabNav`/`selectNavTab` callbacks in `App.tsx`; `handleTabNavKey` in `keyboard-handlers.ts`; `Ctrl+G` and `snap.navOpen` branches in `useWindowKeys.ts`, tests. Depends on step 1 for the component/helper shapes.
3. App integration: render `TabNavPicker`, wire the combined `pickerOpen` boolean, `nav <query>` special-casing in `onSubmit`, tests. Depends on step 2.
4. Specs: new `tab-navigator.md` + `keyboard-navigation.md` amendment.
5. Public documentation.

Run `./scripts/run.mjs check-diff` after each step.
