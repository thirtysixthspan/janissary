# Schedules tab keeps its dock-cycle header when empty

**Complexity: 2/10** — a small restructure of one early-return branch in `SchedulesTab.tsx`; no new state, no protocol changes.

## Goal

`NotificationsTab` always renders its `.notifications-header` (with the dock-cycle button) whenever the tab is docked, regardless of whether it has any content. `SchedulesTab` does the same when it has entries, but its empty-state branch (`entries.length === 0`) returns early with only `<div className="schedules-tab"><div className="schedules-empty">…</div></div>` — skipping the header entirely. A docked, empty Schedules tab therefore has no dock-cycle button, so it cannot be cycled left/right until a schedule exists. Fix `SchedulesTab` so the header renders in the empty state too, matching `NotificationsTab`'s behavior.

## Approach

`web/src/SchedulesTab.tsx:41-47` currently short-circuits before the `dock &&` header block. Move the empty-state check so it only replaces the row list, not the header — i.e. keep the outer `<div className="schedules-tab...">`, the `dock && <div className="schedules-header">…</div>` block, and render either the empty message or the headings+rows depending on `entries.length`. This mirrors how `NotificationsTab` always renders its header and then conditionally renders content (`Transcript` handles its own empty state via `showEmptyHint`).

## Implementation steps

1. In `web/src/SchedulesTab.tsx`, remove the early `if (entries.length === 0) return (...)` block.
2. In the main return statement, keep the `dock && <div className="schedules-header">…</div>` block unconditional on `entries.length`.
3. Below it, render `entries.length === 0 ? <div className="schedules-empty">No scheduled commands.</div> : <>...(headings + rows)...</>`.
4. Keep the `ref`, `tabIndex`, and `onKeyDown` on the outer container in both cases (currently the empty branch renders a plain, non-interactive `div` with none of those — align it with the non-empty branch since a docked user should still be able to reach the dock-cycle button via the same container).

## Tests

- **`web/src/SchedulesTab.test.tsx`**: add a test that with `entries={[]}` and `dock="left"`, `.schedules-dock-cycle` is present. Add a second test that clicking it while empty still sends `setDock` with the flipped side (mirrors the existing non-empty dock-cycle test at `:117-124`).
- Confirm the existing `'shows "No scheduled commands." when the list is empty'` test (`:54-58`) still passes unchanged (no `dock` prop, so no header, same as before).

## Spec updates

- `product/specs/scheduling.md` — the "Scheduling tab" section (`:37-43`) documents docking/dock-cycle behavior and the empty state as separate paragraphs but doesn't say whether the header persists when empty. Add a short clause to the docking paragraph (`:39`) noting the dock-cycle button stays available even when the tab has no entries.

## Out of scope

- No changes to `NotificationsTab` or `FileTreeTab` — they already behave correctly.
- No shared `MetadataBar` component extraction; the three tabs remain independently implemented copies, consistent with current codebase convention (per exploration, no such shared component exists today).
