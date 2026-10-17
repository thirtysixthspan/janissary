# Show system schedules as their own section in the schedules tab

**Complexity: 3/10** — web-only. It reuses the existing row and heading markup, adds one pure grouping helper, and splits the row rendering into a small component so `SchedulesTab.tsx` stays under the 200-line limit. No protocol, server, or payload change, because `ScheduleRow.owner` already distinguishes system rows.

Today the `schedules` tab renders one flat list ordered next-to-run, so project system schedules are interleaved with tab timers and share a single column-heading row. The issue asks for system schedules to appear in their own list above the tab schedules, with each section carrying its own header row.

## Design decisions

- **Grouping**: split the aggregated `entries` by `owner === 'system'` into a system group and a tab group. Each group keeps the next-to-run order the server already supplies. A pure helper `sectionSchedules` in `web/src/plugins/schedules/schedules-sections.ts` does the split so it can be unit-tested without rendering.
- **Order**: the system section renders first, the tab section second. The flat `ordered` list (system then tab) replaces `entries` everywhere the tab uses it, so keyboard selection, Enter, Delete, and `data-index` all follow the on-screen order.
- **Numbering**: rows number `1)`, `2)`, … continuously across both sections, not restarting per section. The number then matches the flat selection index, which keeps the keyboard and scroll logic unchanged.
- **Header rows**: each rendered section gets its own column-heading row, using the same `FullHeadings` / `CompactHeadings` markup as today, in both the full and docked renderings.
- **Empty sections are omitted**: a section with no rows renders nothing, including no header row. When both groups are empty the existing "No scheduled commands." empty state is shown unchanged.
- **Separation**: a small gap between sections so the second header row reads as a new list.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Reuse |
| --- | --- | --- |
| Owner discriminator on each row | `src/plugins/schedules/shared.ts` (`ScheduleRow`) | Partition on `owner === 'system'`; no contract change |
| Flat selection, nav, Enter, Delete | `web/src/plugins/schedules/SchedulesTab.tsx` | Keep operating on one flat list, now the ordered list |
| Heading and row markup, full and compact | `web/src/plugins/schedules/SchedulesTab.tsx` (`FullHeadings`, `CompactHeadings`, `FullRow`, `CompactRow`) | Move unchanged into a new module and render once per section |
| Row keys | `web/src/plugins/schedules/schedules-keys.ts` (`scheduleRowKey`) | Unchanged |
| Column grid and heading border | `web/src/plugins/schedules/schedules.css` (`.schedules-headings`, `.schedules-row`) | Each section reuses the same grid, so columns stay aligned |

## Proposed changes

**Grouping helper.** Create `web/src/plugins/schedules/schedules-sections.ts` exporting:

- `type ScheduleSections = { system: ScheduleRow[]; tabs: ScheduleRow[]; ordered: ScheduleRow[] }`
- `sectionSchedules(entries: ScheduleRow[]): ScheduleSections`, which filters by owner, keeps relative order within each group, and sets `ordered` to `[...system, ...tabs]`.

**Row rendering module.** Create `web/src/plugins/schedules/SchedulesRows.tsx` and move `FullHeadings`, `CompactHeadings`, `FullRow`, and `CompactRow` there unchanged. Add an exported `ScheduleSection` component with props `{ entries: ScheduleRow[]; offset: number; compact: boolean; selected: number | null; onRowClick: (index: number) => void; onRowDoubleClick: (entry: ScheduleRow) => void }`. It renders a `<div className="schedules-section">` containing a `.schedules-headings` row followed by one `.schedules-row` per entry. Each row uses `data-index={offset + i}`, `aria-selected`, the `selected` / `recurring` classes, and `{offset + i + 1})` as its number. The component returns `null` when `entries` is empty.

**SchedulesTab.** In `web/src/plugins/schedules/SchedulesTab.tsx`:

- Compute `const sections = sectionSchedules(payload.entries)` and set `const entries = sections.ordered`, so the existing keyboard, selection, and dialog logic is untouched.
- Replace the single headings-plus-map block with two `ScheduleSection` renders: the system group with `offset={0}`, and the tab group with `offset={sections.system.length}`.
- Keep the empty-state branch and the `FullHeadings`/`CompactHeadings` imports removed from this file.

**Stylesheet.** In `web/src/plugins/schedules/schedules.css`, add a rule so a section after the first has a top margin (for example `.schedules-section + .schedules-section { margin-top: 8px; }`). No other rule changes.

**Spec.** In `product/specs/scheduling.md`, section "Scheduling tab", update the description of the list so that: system rows appear in their own section above the tab-owned rows; each section has its own column-heading row; each section is ordered next-to-run first; rows are numbered continuously from the top across both sections; and sections with no rows are not shown. Remove the statement that the whole tab is a single flat list ordered soonest-to-run first regardless of owner.

**User documentation.** In `documentation/user-documentation/automation/scheduling.md`, update the schedules-tab paragraph (around the sentence describing the single list ordered by next-to-run) to describe the system section above the tab section. Do not change the screenshot or add new documentation.

## Tests

- `web/src/plugins/schedules/schedules-sections.test.ts` (new): splits mixed entries by owner, keeps relative order within each group, yields `ordered` as system rows followed by tab rows, and returns empty groups for an empty input.
- `web/src/plugins/schedules/SchedulesTab.test.tsx`, added cases:
  - With a system row and a tab row, two `.schedules-section` elements render with the system section first, and each contains exactly one `.schedules-headings` row.
  - With only tab rows, only one section and one headings row render.
  - With only system rows, only one section renders.
  - Row numbers `1)` and `2)` continue across the two sections.
  - Pressing Home then Enter focuses the system row, showing that keyboard order follows the on-screen order.
  - Both full and docked (`dock='left'`) modes render a headings row per section.

Existing tests (the duplicate-system-row owner-key test in both modes, selection, delete confirmation, and double-click focus) must keep passing unchanged.

## Out of scope

- The trash icon moving into the section header row (a separate backlog item).
- A per-row action column (a separate backlog item).
- Section titles or labels beyond the column-heading row.
- Any change to the server, the payload, or the schedule window.

## Open questions

None.

## Verification

Run `./scripts/run.mjs check-diff`. Manual check: create one system schedule and one tab schedule, open `schedules`, and confirm that the system section appears above the tab section, each with its own header row, and that the docked layout matches.
