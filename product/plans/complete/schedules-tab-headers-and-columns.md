# Schedules tab section titles, column order, and content-sized columns

**Complexity: 4/10** — presentational change in one feature directory: section titles, a column rename and swap, a stylesheet change to content-sized tracks with subgrid, and removal of the two section clear buttons. No protocol, server, or storage change. The one judgment call is the grid approach, which needs headings and rows to share tracks inside each section.

The schedules tab shows two sections, system and tab, each with a column-heading row. The issue asks for four things: drop the two **Clear** trash icons, add a title above each section (**System Schedules** and **Tab Schedules**), size columns to their content, rename `Next` to `Next Run` and `Spec` to `Timing`, swap those two columns, let `Timing` and `Next Run` wrap while the command column is shortened with an ellipsis.

## Design decisions

- **Clear buttons removed.** The per-section trash icons go. The tab no longer clears in bulk; `schedule system clear` and `schedule clear` remain the way to do it. The old tab-section icon cleared tab schedules across every open tab, and the terminal command only clears one tab at a time, so that cross-tab bulk clear is no longer reachable from the UI. The plugin's `clear` intent stays in place, since it is part of the plugin contract and removing it is a separate cleanup.
- **Column order.** Full layout becomes `#`, `Agent`, `Id`, `Timing`, `Next Run`, `Command`, with the row trash icon last. The compact layout has no `Timing` column, so it only gets the rename: `#`, `Next Run`, `Id`, `Agent`.
- **Content-sized tracks.** Each section is its own grid. Its headings row and each row are `subgrid`s spanning the full section width, so a column's width is shared by the heading and every row in that section. Non-command columns are `auto`, which sizes them to their longest value. The command column is `minmax(0, auto)`: it grows to its content, and shrinks (with an ellipsis) when the row is narrower than the command. Leftover width stays empty at the end of the row rather than being spread across the columns.
- **Why not one grid for both sections.** Sharing one grid across the system and tab sections would force the two sections to share column widths. Each section sizing its own columns is what "at most the length of the content" asks for, and the sections are already separate blocks.
- **Wrapping.** `Timing` and `Next Run` cells, headings included, wrap onto more lines instead of being clipped. Other cells keep the single-line ellipsis rule.
- **Section titles.** A title row sits above each section's column headings. Titles render only for a section that has rows, matching the existing rule that an empty section is not shown.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Reuse |
| --- | --- | --- |
| Section component and headings/row markup | `web/src/plugins/schedules/SchedulesRows.tsx` | Add the title, reorder and rename the cells, drop the clear button |
| Tab layout and clear wiring | `web/src/plugins/schedules/SchedulesTab.tsx` | Drop the `onClear` props and the `clear` intent calls |
| Grid, cell, and icon styles | `web/src/plugins/schedules/schedules.css` | Replace the fixed fractional tracks and add the wrap rule |
| Stylesheet tests | `web/src/plugins/schedules/schedules-style.test.ts` | Update to the new track strings and selectors |
| Terminal clear commands | `schedule clear`, `schedule system clear` | Remain the only bulk clear path |

## Proposed changes

**Section component.** In `web/src/plugins/schedules/SchedulesRows.tsx`, `ScheduleSection` drops its `onClear` prop and the trash button in its headings row. It renders a title element before the headings row, reading `System Schedules` for the system section and `Tab Schedules` for the tab section. The full headings row becomes `Agent`, `Id`, `Timing`, `Next Run`, `Command`, and the full row cells follow the same order. The compact headings read `Next Run`, `Id`, `Agent`. The `Timing` and `Next Run` heading cells carry the same classes as their row cells so the shared wrap rule applies to both.

**Tab.** In `web/src/plugins/schedules/SchedulesTab.tsx`, remove the `onClear` props from both `ScheduleSection` uses and the now-unused `clear` intent calls. The `splitAction` slot is unchanged.

**Stylesheet.** In `web/src/plugins/schedules/schedules.css`:
- `.schedules-section` becomes a grid. Its full track list is `auto auto auto auto auto minmax(0, auto) auto`, with a 12px gap. Its compact track list is `auto auto auto minmax(0, auto) auto`, with an 8px gap.
- `.schedules-headings` and `.schedules-row` span the section (`grid-column: 1 / -1`) and use `grid-template-columns: subgrid`, dropping their own fixed tracks and gap.
- `.schedules-spec` and `.schedules-next` get `white-space: normal` and `overflow-wrap: anywhere`, overriding the single-line rule for those two columns only.
- A `.schedules-section-title` rule styles the title row: foreground color, weight 600, and the same horizontal padding as the rows, with ellipsis if it does not fit.
- `.schedules-clear` is removed. `.schedules-row-delete` keeps the icon style and centering that `.schedules-clear` had.

**Spec.** In `product/specs/scheduling.md`, in the schedules-tab section:
- The docked-layout sentence says each section keeps its own title and column-heading row, not a clear control.
- The rendering sentence lists the full columns as `#`, `Agent`, `Id`, `Timing`, `Next Run`, `Command` and the compact ones as `#`, `Next Run`, `Id`, `Agent`. It states that each section is titled `System Schedules` or `Tab Schedules`, that columns are as wide as their content, that the command is shortened with an ellipsis and shows in full on hover, and that `Timing` and `Next Run` wrap instead of being shortened.
- The clearing paragraph drops the per-section trash-icon behavior. It says the schedules tab has no clear control, and that `schedule clear` and `schedule system clear` remove tab-owned and project-owned schedules respectively.
- The live-list paragraph drops the sentence about the section-header trash icons.

**User documentation.** In `documentation/user-documentation/automation/scheduling.md`, the aggregated-tab paragraph is updated to the new column order and names, to say each section has a title, and to point to `schedule clear` and `schedule system clear` in place of the header trash icons. The screenshot is not regenerated here, and the page's screenshot will be stale until it is recaptured.

**E2E driver.** `scripts/e2e/system-schedules-management.mjs` clicks the two removed buttons. It runs `schedule system clear` and `schedule clear` in the `janus` tab instead, then waits for the aggregate rows to detach as it does now. Its assertions about the persisted store and the runscript are unchanged. The driver needs the Playwright app and is not run by `check-diff`, so the report notes it as unverified.

## Tests

- `web/src/plugins/schedules/SchedulesTab.test.tsx`:
  - Remove the test that clears tab schedules from the header button, and the two section-clear tests.
  - Replace the empty-state clear assertions with a check that no section title is shown when nothing is scheduled.
  - Add: no clear control appears in either section header when both sections have rows.
  - Add: each section shows its title above its headings, and a section with no rows shows no title.
  - Add: the full headings read `''`, `Agent`, `Id`, `Timing`, `Next Run`, `Command`, and the first row's cells appear in the same order, so the heading and row columns stay aligned.
  - Add: the compressed headings read `Next Run`, `Id`, `Agent`.
- `web/src/plugins/schedules/schedules-style.test.ts`:
  - Replace the fixed-track assertions with the new `auto` and `minmax(0, auto)` track lists for both layouts.
  - Assert the headings and rows use `grid-template-columns: subgrid` and span the section.
  - Assert the `Timing` and `Next Run` wrap rule exists and the single-line ellipsis rule still applies to other cells.
  - Assert the `.schedules-row-delete` icon style rule exists.

## Out of scope

- Removing the plugin's server-side `clear` intent and its topic action. It is no longer reached from the tab and could be removed later as cleanup.
- Adding a bulk clear for tab schedules across all tabs anywhere in the UI.
- Changing the terminal `schedule clear` or `schedule system clear` commands.
- Regenerating the user-documentation screenshot.
- Changing the compressed layout beyond the rename.

## Open questions

None.

## Verification

Run `./scripts/run.mjs check-diff`. Manual check in the full and docked layouts: with both owners present, each section shows its title, the headings line up with the rows, `Timing` and `Next Run` wrap when the window is narrow, and the command column ends with an ellipsis. Confirm no trash icon appears in either section header.
