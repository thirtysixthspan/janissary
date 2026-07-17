# Fix: duplicate "schedules tab list behavior" entry in the backlog

**Complexity: 1/10** — no source, test, or spec changes; this is a stale backlog entry, not an open bug.

## Goal

`product/backlog/issues.md` lists: "schedules tab should have no command bar or transcript. schedules tab should require a double click to focus on an agent tab. keyboard navigation using up and down arrows to navigate and scroll the schedule list. enter/return to focus tab. the list of schedules should be numbered `1)` `2)` `3)` and presented in a tabular format with column headings. date is should be hidden in sidebar view. The metadata bar should have a switch button similar to files and notification tabs."

This is word-for-word the issue already resolved by `fix(scheduling): give the schedules tab list-tab behavior (#418)`, whose plan lives at `product/plans/complete/schedules-tab-list-behavior.md`. That commit's diff removed the line from `issues.md`, but a later `chore: planning` commit (`9ad7f4b`) re-added the identical line, and it has sat in `## ready` since.

## Approach

Verified every clause of the issue text against the current code and confirmed each is already true:

- No command bar/transcript: `'schedules'` is in `VIEW_TAB_KINDS` (`web/src/useViewSearchState.ts`), and `ViewTabBody.tsx`/`Sidebar.tsx` render `SchedulesTab` directly with no command bar or transcript.
- Double click focuses the owning tab: `SchedulesTab.tsx`'s row `onDoubleClick` calls `focusOwner`.
- Up/Down (and Home/End) keyboard navigation with scroll-into-view: `onKeyDown` + `nextSelection` (`web/src/schedules-keys.ts`) + the `scrollIntoView` effect.
- Enter/Return focuses the selected row's tab: handled in `onKeyDown`.
- Rows numbered `1)`, `2)`, …: `<span className="schedules-num">{i + 1})</span>`.
- Tabular layout with column headings: `FullHeadings`/`CompactHeadings` plus grid CSS.
- Date hidden in the compact (sidebar) view: `CompactRow` renders `entry.next.split(' ').pop()`.
- Dock-cycle switch button matching files/notifications: `.schedules-header`/`.schedules-dock-cycle`, wired the same as `NotificationsTab`.

All of this is covered by existing tests in `web/src/SchedulesTab.test.tsx` and `web/src/schedules-keys.test.ts`, and documented in `product/specs/scheduling.md`'s "Scheduling tab" section. There is nothing left to implement.

## Implementation steps

1. Remove the duplicate line from `product/backlog/issues.md` (the only change this fix makes).

## Tests

None — no behavior changes; the existing `SchedulesTab.test.tsx` and `schedules-keys.test.ts` suites already cover every clause of the (already-resolved) issue.

## Out of scope

- Any change to `SchedulesTab.tsx`, `schedules-keys.ts`, `Sidebar.tsx`, `ViewTabBody.tsx`, `useViewSearchState.ts`, or `theme.css` — all already implement the requested behavior.
- Any change to `product/specs/scheduling.md` — already documents this behavior.

## Verification

`./scripts/run.mjs check-diff` passes (no source changes are made, so this is a no-op check). No manual verification needed since no behavior changes.
