# Left-align schedules table cells, shorten long text with ellipses, and show full text on hover

**Complexity: 2/10** — a stylesheet change plus a `title` attribute on each text cell. The sessions table already solved the same problem with `minmax(0, …)` tracks and ellipsis cells, so this copies that approach. No behavior, data, or server change.

Today the schedules tab's grid uses plain `1fr` tracks. A `1fr` track can grow to fit its content, so one long command or spec widens its column past the row and the text never truncates. Cells also have no `min-width: 0`, so they cannot shrink to make ellipsis apply. Hovering a cell shows nothing, so a truncated value cannot be read in full.

## Design decisions

- **Alignment**: every cell stays left-aligned with `text-align: left`, and its track stretches to the column width rather than shrinking to content. Headings and rows keep the same grid, so columns still line up.
- **Shrinking**: text tracks use `minmax(0, …)` so they can shrink below their content width. The fixed-width tracks (the `#` column and the trailing icon column) are unchanged.
- **Truncation**: each text cell gets `min-width: 0`, `overflow: hidden`, `white-space: nowrap`, and `text-overflow: ellipsis`. This applies to every cell in both the full and docked layouts, not only the command cell.
- **Tooltip**: each text cell carries a native `title` attribute holding its full text, so the full value shows on hover. Native titles match the sessions list's row tooltips and need no new component. The title is set on every cell, not only truncated ones, since CSS cannot tell whether a cell has been cut.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Reuse |
| --- | --- | --- |
| `minmax(0, …)` shared grid with ellipsis cells | `web/src/plugins/sessions/sessions.css` | Same track and cell pattern |
| Native title tooltips on list rows | `web/src/plugins/sessions/SessionList.tsx` | Same tooltip mechanism |
| Stylesheet assertions read as raw text | `web/src/plugins/sessions/sessions-style.test.ts` | Same test style for the new rules |
| Section rendering and cell markup | `web/src/plugins/schedules/SchedulesRows.tsx` | Add titles here |

## Proposed changes

**Stylesheet.** In `web/src/plugins/schedules/schedules.css`:
- Change the full grid to `2em minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 2fr) 1.5em`.
- Change the compact grid to `1.5em minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) 1.5em`.
- Add one rule for the cell spans of headings and rows: `.schedules-headings > span, .schedules-row > span { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; text-align: left; }`.
- Remove the now-redundant `.schedules-command { overflow: hidden; text-overflow: ellipsis; }` rule, since the shared rule covers it.

**Cells.** In `web/src/plugins/schedules/SchedulesRows.tsx`, add `title={…}` to each text cell in `FullRow` (owner, id, next, spec, command) and `CompactRow` (next, id, owner), using the same value the cell displays. For the compact next-time cell the title is the full `entry.next` string, not the time-only part shown.

**Spec.** In `product/specs/scheduling.md`, in the "Scheduling tab" section, add one sentence: cell text is left-aligned, a value too long for its column is shortened with an ellipsis, and the full value is shown on hover.

**User documentation.** No change. The user docs do not describe column alignment or truncation.

## Tests

- `web/src/plugins/schedules/schedules-style.test.ts` (new, mirroring `sessions-style.test.ts`, which reads the stylesheet as raw text):
  - the full and compact grids use `minmax(0, …)` for their text tracks and keep the fixed `2em` / `1.5em` tracks;
  - the shared cell rule sets `min-width: 0`, `overflow: hidden`, `text-overflow: ellipsis`, and `text-align: left`;
  - the headings and rows share one grid rule.
- `web/src/plugins/schedules/SchedulesTab.test.tsx`, added case: in the full layout, a long command cell's `title` equals its full text, and in the compact layout the next-time cell's `title` equals the full `next` string.

Existing tests (selection, delete, sections, clear) must keep passing unchanged.

## Out of scope

- The per-row trash action column (a separate backlog item). The trailing track already exists and is left empty here.
- Any change to what the cells display, to sort order, or to column widths beyond the minimum needed to let text shrink.
- A custom tooltip component.

## Open questions

None.

## Verification

Run `./scripts/run.mjs check-diff`. Manual check: schedule a timer with a long command and spec, open `schedules`, and confirm that the text is cut with an ellipsis, columns stay aligned with the headings, and hovering shows the full text in both the full and docked layouts.
