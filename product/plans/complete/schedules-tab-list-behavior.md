# Fix: schedules tab is missing its list-tab conventions

**Complexity: 5/10** — bounded to `SchedulesTab.tsx` plus a small pure keyboard-nav helper module, a one-line fix in `useViewSearchState.ts`, two prop additions in `Sidebar.tsx`, and CSS. The keyboard-nav, dock-cycle header, and click/double-click split all mirror patterns that already exist verbatim in `FileTreeTab.tsx` and `NotificationsTab.tsx`, so there is no new architecture — just applying the established list-tab shape to a tab that never got it.

## Goal

The aggregated schedules tab currently behaves like a plain list of clickable buttons and is missing several conventions every other list-style tab already follows:

1. It still shows a command bar and transcript underneath it (it renders `AgentTabBody`), even though it is a read-only view tab.
2. A single click both focuses the owning tab (destructive/navigating action) and has no separate "select without leaving" affordance.
3. There's no keyboard navigation: no Up/Down to move a selection, no Enter/Return to focus the selected entry's tab.
4. Rows aren't numbered or laid out as a table with column headings.
5. In the compact (sidebar-docked) rendering, the next-run time still includes the date, which is redundant clutter in a narrow column.
6. Its header carries no dock-cycle (⇄) button, unlike the file navigator and notifications tab it shares a sidebar with.

## Approach

**No command bar/transcript.** `web/src/useViewSearchState.ts`'s `VIEW_TAB_KINDS` list drives `App.tsx`'s `!isViewTab` gate around `AgentTabBody`. `'schedules'` is missing from that list even though `'files'` and `'notifications'` are both present — this is a plain omission bug. Adding it is a one-line fix with no other effect (the schedules tab already has its own `client.send` wiring and doesn't touch `canSearch`/search state).

**Click vs. double-click, and keyboard nav.** `FileTreeTab.tsx` already establishes the exact shape needed: a `selected` index/id in local state, single click selects, double click (or Enter) performs the "open" action, arrow keys move the selection and clamp at the ends (no wrap), and a `useEffect` scrolls the selected row into view via `scrollIntoView({ block: 'nearest' })`. `SchedulesTab` adopts the same shape, tracking `selected: number | null` (an index into `entries`, since entries have no stable DOM id better than their composite key). A new pure helper module, `web/src/schedules-keys.ts`, exports a `nextSelection(length, selected, key): number | null` function mirroring `handleFileTreeKey`'s clamp arithmetic for `ArrowUp`/`ArrowDown`/`Home`/`End` — kept pure and separate so it's unit-testable without rendering, and to keep `SchedulesTab.tsx` under the 200-line limit.

**Numbered, tabular rows.** Replace the flat `<button>` row with a `<div className="schedules-row">` grid row containing a leading `<span className="schedules-num">{i + 1})</span>` plus the existing field spans, preceded by one `<div className="schedules-headings">` row of column labels (`#`, `Owner`, `Next`, `Spec`, `Command` for the full layout; `#`, `Next`, `Id`, `Owner` for compact). CSS switches `.schedules-row`/`.schedules-headings` to `display: grid` with a shared `grid-template-columns` (compact and full each get their own column count, matching the existing `.schedules-compact` override pattern) so the two rows' columns line up.

**Hide the date in compact view.** `next` is formatted server-side by `fmtNextRun` (`src/schedule/display.ts`) as `"<Mon> <D> <time>"` (e.g. `"Jul 17 2:30pm"`) — the time is always the last space-separated token, so no protocol change is needed. `CompactRow` renders `entry.next.split(' ').pop()` instead of the full string.

**Dock-cycle header.** Mirror `NotificationsTab`'s `.notifications-header`/`.notifications-dock-cycle` exactly: `SchedulesTab` gains optional `dock?: 'left' | 'right'` and `index?: number` props (both already flow through `Sidebar.tsx`, which just isn't passing them today), and renders a `.schedules-header` with a `.schedules-dock-cycle` button — shown only when `dock` is set — sending `setDock` via `nextDock`/`dockTooltip` from `./dock-cycle`. `ViewTabBody.tsx`'s center-mounted usage passes neither prop, so the header is absent there, matching the file tree and notifications tabs' own center-vs-docked behavior.

## Implementation steps

1. `web/src/useViewSearchState.ts`: add `'schedules'` to `VIEW_TAB_KINDS`.
2. Add `web/src/schedules-keys.ts` exporting `nextSelection(length: number, selected: number | null, key: string): number | null`, handling `ArrowDown`, `ArrowUp`, `Home`, `End` with clamped (non-wrapping) arithmetic; any other key returns `selected` unchanged. `length === 0` always returns `null`.
3. Rewrite `web/src/SchedulesTab.tsx`:
   - Add `dock?: 'left' | 'right'` and `index?: number` to `Properties`.
   - Add `selected` state (`number | null`, default `null`), a `containerRef`, and a `useEffect` scrolling the selected row into view (`data-index={i}` attribute, `querySelector` + `scrollIntoView({ block: 'nearest' })`), matching `FileTreeTab`'s pattern.
   - Add a selection-clamp `useEffect`: when `entries.length` shrinks below the current `selected` index, clamp it back into range (or `null` when empty), matching `FileTreeTab`'s survivor-clamp effect.
   - `onClick` on a row sets `selected` to that row's index (no longer focuses the tab).
   - `onDoubleClick` on a row calls `focusOwner` (the existing tab-focus logic, unchanged).
   - `onKeyDown` on the container: `ArrowUp`/`ArrowDown`/`Home`/`End` call `nextSelection` and `setSelected`, `preventDefault`/`stopPropagation`; `Enter` calls `focusOwner(entries[selected].tab)` when `selected !== null`.
   - Add `tabIndex={0}` to the container so it can receive keyboard focus (click already focuses it via the browser's default button-click-in-container behavior; add an explicit `containerRef.current?.focus()` in the row click handler, matching `FileTreeTab.onRowClick`).
   - Render `.schedules-header` (dock-cycle button, shown only when `dock` is set) above the row list.
   - Render a `.schedules-headings` row of column labels above the entries.
   - Change each row's element from `<button>` to a `<div role="button" tabIndex={-1}>` (rows are no longer independently focusable/tabbable — the container owns keyboard focus, matching `FileTreeTab`'s `role="treeitem"` rows) carrying `aria-selected`, a `selected` class when `i === selected`, and the leading `<span className="schedules-num">{i + 1})</span>`.
   - `CompactRow` renders `entry.next.split(' ').pop()` instead of `entry.next`.
4. `web/src/Sidebar.tsx`: pass `dock={side}` and `index={current.index}` to `<SchedulesTab>`.
5. `web/src/theme.css`: add `.schedules-header`/`.schedules-actions`/`.schedules-dock-cycle` (copy the `.notifications-header` block, renamed), `.schedules-headings` (same grid as `.schedules-row`, muted color, bottom border), `.schedules-num` (fixed-width, muted), a `.schedules-row.selected` background (matching `.files-row`'s selected treatment), and switch `.schedules-row`/`.schedules-headings` from `display: flex` to `display: grid` with explicit `grid-template-columns` for both the full and `.schedules-compact` variants.
6. Run `./scripts/run.mjs check-diff` after each step; fix failures before continuing.

## Tests (`web/src/SchedulesTab.test.tsx`)

- Existing "renders one row per entry" and "marks recurring" tests updated for the new row markup (`.schedules-row` divs instead of buttons).
- Rows are numbered `1)`, `2)`, … in order.
- Column headings render above the rows (full layout) and the compact layout's own heading set.
- A single click on a row selects it (`selected`/`aria-selected` class) without sending `setActiveTab`.
- A double click on a row sends `setActiveTab` with the owning tab's index (replaces the old single-click test).
- Pressing `ArrowDown` then `Enter` on the container sends `setActiveTab` for the second entry.
- Pressing `ArrowUp` at the first row (or with no prior selection) stays clamped at index 0 (no wrap, no error).
- Compact rendering shows only the time portion of `next` (no month/day) while full rendering shows the full string.
- The dock-cycle button is absent with no `dock` prop, present and sends `setDock` with the next side when `dock` is set.

New `web/src/schedules-keys.test.ts` covering `nextSelection`: Down/Up move by one and clamp at both ends; Home/End jump to the ends; an unrelated key returns `selected` unchanged; `length === 0` always returns `null` regardless of key.

## Out of scope

- Any change to the aggregation logic, ordering, or server-side `AggregatedScheduleView`/`ScheduleView` protocol shape — `next`'s date+time format is parsed client-side, not changed server-side.
- Docking behavior itself (which sides allow which kinds, displacement rules) — unchanged; only the header gains a button that calls the existing `setDock` RPC.
- Type-ahead search within the list (file tree has it; the issue doesn't ask for it here).
- The floating per-tab `ScheduleWindow`/`StatusPanels` — untouched, distinct feature.

## Verification

- `./scripts/run.mjs check-diff` passes (lint, typecheck, web tests).
- Manual: run `schedules` with at least one active schedule, confirm no command bar/transcript appears below the list; confirm a single click selects a row (highlight, no tab switch) and a double click switches to the owning tab; confirm Up/Down move the highlighted row and Enter switches to its tab; confirm rows are numbered and column headings are visible; dock the tab (`schedules left`) and confirm the compact rows show only a time (no date) and a dock-cycle button appears in the header. Not runnable headless in this environment — noted here for the human to confirm.
