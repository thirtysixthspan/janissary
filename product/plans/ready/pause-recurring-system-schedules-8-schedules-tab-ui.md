# Add the Pause/Resume row control and keys to the Schedules tab

**Complexity: 5/10** — ~85 added lines across 4 files, 7 requirements, 9 scenarios (p=5.586)

## Goal

Give the Schedules tab a per-row Pause/Resume control and keyboard toggle so a user can suspend or restart a single recurring system schedule without leaving the list. Today each row ends in a trash icon and the list is read-only apart from selection. This change adds a Pause/Resume icon before the trash button, a `paused` row style, and `Space`/`p` keys on the selected row, all driven by the intents delivered in the previous subplan. The client keeps no local pause state; it renders the server's row and sends intents.

Source: `./product/plans/complete/pause-recurring-system-schedules.md`. Depends on `pause-recurring-system-schedules-7-wire-plugin-topics.md` for the `pause`/`resume` intents, topic actions, and the `paused` flag on the wire row.

## Requirements

1. "Each active recurring system row offers a Pause control, which pauses only that row by key" (user answer: "Tab + command"). The intents and topic actions landed in `pause-recurring-system-schedules-7-wire-plugin-topics.md`; this subplan adds the rendered control and sends the `pause` intent. Shared.
2. "Each paused system row offers a Resume control, which resumes only that row by key" (user answer: "Tab + command"). Shared with `pause-recurring-system-schedules-7-wire-plugin-topics.md`.
3. "One-shot system rows and tab rows offer no Pause or Resume control" (user answer: "Recurring system only").
4. "A pause or resume from the tab that fails to save leaves the row as it was" (user answer: "Silent, like Delete"). The failed-save error path landed in `pause-recurring-system-schedules-7-wire-plugin-topics.md`; this subplan keeps no local state so the row is unchanged. Shared.
5. "A `pause` or `resume` intent naming a key that is not a recurring system row in the current view is refused and changes nothing" (precedent: the `cancel` topic action is authorized against the current aggregated view). The server authorization landed in `pause-recurring-system-schedules-7-wire-plugin-topics.md`; this subplan sends the current row's identity. Shared.
6. "Tab-owned timers and the per-tab schedule window show no pause state and behave as today" (user answer: "Core set").
7. "The Scripts tab counts paused schedules exactly like active ones, for its clock icon and its delete warning" (user answer: "Count paused too").

## Design decisions

- The Pause/Resume button sits immediately before the trash button on a recurring system row, in both the full and docked renderings. Other rows render an empty cell in that position so grid columns stay aligned.
- The button shows `faPause` while the row is active and `faPlay` while it is paused, styled like the trash button. Its `aria-label` and `title` both read `Pause schedule <id>` while active and `Resume schedule <id>` while paused. The button carries no `aria-pressed`, following the WAI-ARIA and MDN guidance for play/pause controls.
- Pressing the icon sends the `pause` or `resume` intent at once with no dialog, does not change the selection, and returns focus to the list container so arrow keys keep working. A click whose `event.detail` is above 1 is ignored, and both the click and the double-click stop propagation so the row's focus-owner handlers do not fire, matching the Scripts tab's row buttons.
- While the list has focus, `Space` or `p` on a selected recurring system row pauses an active row and resumes a paused row. The keys count only without Cmd, Ctrl, or Alt held; `Space`'s default page scroll is prevented as the arrow handler does today. They are handled only by the focused list, so no global binding is affected. On a one-shot, a tab row, or with no selection, the keys do nothing.
- One pure predicate, `canPauseRow`, goes in `src`-adjacent client file `web/src/plugins/schedules/schedules-keys.ts`: a row is pausable exactly when it is a system row with a key and `recurring === true`. Both `SchedulesRows.tsx` and the key handler call it, keeping the rule out of JSX per `ai/guidelines/react-code-organization.md` §5.
- A paused row carries a `paused` class drawing its text in `var(--muted)` instead of the recurring accent color; its selection and hover backgrounds are unchanged. Both grids gain one column for the icon. Long ids, owners, and commands keep truncating with an ellipsis. The empty state and section titles are unchanged.
- A failed save is silent: the client keeps no local pause state, and the row redraws only on the next `schedules` topic delivery, matching a failed Delete today.
- Both `SchedulesTab.tsx` and `SchedulesRows.tsx` are edited, and the key handler grows. If either file would pass 200 lines, extract the key handling or the row button into a focused module under `web/src/plugins/schedules/` and import it back; do not compact code.

## Preserved behavior

1. Deleting a system row from the tab confirms first and then cancels by key. The new icon must not open the delete dialog or send `cancel`. Pinned by `web/src/plugins/schedules/SchedulesTab.test.tsx:300` › `confirms a system row by its key`.
2. Pressing a row icon does not move the selection. The new icon must not change the selection either. Pinned by `web/src/plugins/schedules/SchedulesTab.test.tsx:311` › `does not move the selection when the icon is pressed`.
3. Enter and a row double-click focus the owning tab. The new `Space` and `p` keys must not focus an owner, and Enter must not pause. Pinned by `web/src/plugins/schedules/SchedulesTab.test.tsx:115` › `focuses the owning tab on a double click and on Enter`.

## Assumptions

1. Each row already ends in an icon button that acts on that row without changing the selection: `web/src/plugins/schedules/SchedulesRows.tsx:47` `className="schedules-row-delete"`.
2. A row button that acts only on the first click of a double-click already exists in the Scripts tab: `web/src/plugins/scripts/ScriptRowActions.tsx:30` `if (action !== 'delete' && event.detail > 1) return;`.
3. Selection navigation lives in a pure module beside the tab: `web/src/plugins/schedules/schedules-keys.ts:6` `export { nextListSelection as nextSelection } from '../api';`.
4. The tab's key handler is one function on the list container: `web/src/plugins/schedules/SchedulesTab.tsx:65` `const onKeyDown = (e: React.KeyboardEvent) => {`.
5. A paused row arrives with `paused: true` and `next: 'paused'`, from `pause-recurring-system-schedules-7-wire-plugin-topics.md`.
6. A system row's identity for an intent is `{ tab, owner: 'system', key, id }`, as the delete and focus-owner paths already build: `web/src/plugins/schedules/SchedulesTab.tsx:44` `const identity = entry.owner === 'system' ? { tab: entry.tab, owner: 'system', key: entry.key } : { tab: entry.tab };`.

## Existing functionality

1. `ScheduleSection` owns the full and compact row renderings and the trash button: `web/src/plugins/schedules/SchedulesRows.tsx:11` `export function ScheduleSection({`.
2. `nextSelection` and `scheduleRowKey` are the pure helpers colocated with the tab: `web/src/plugins/schedules/schedules-keys.ts:8` `export function scheduleRowKey(row: ScheduleRow): string {`.
3. `capabilities.intent` is the single intent transport: `web/src/plugins/schedules/SchedulesTab.tsx:47` `void capabilities.intent('focus-owner', identity);`.
4. The list container already has `tabIndex={0}` and an `onKeyDown` handler, and focus is returned to it after a click: `web/src/plugins/schedules/SchedulesTab.tsx:89` `tabIndex={0}`.
5. `SchedulesTab.test.tsx` already pins delete confirmation, selection stability, and Enter/double-click focus behavior.

## Implementation steps

Each step ends green under `$janissary/scripts/run.mjs check-diff`.

1. Add `canPauseRow(entry: ScheduleRow)` to `web/src/plugins/schedules/schedules-keys.ts` as a pure predicate: true only when `entry.owner === 'system'`, `entry.key` is a string, and `entry.recurring === true`. It stays true for a paused recurring system row so the same control can offer Resume, and false for one-shot system rows and tab rows. Export it from that file only.
2. In `web/src/plugins/schedules/SchedulesRows.tsx`, add an `onTogglePause(entry)` prop to `ScheduleSection`. Render a Pause/Resume button immediately before the trash button when `canPauseRow(entry)` is true, otherwise an empty cell. Use `faPause` or `faPlay` from the icon the row state calls for, set `aria-label` and `title` to `Pause schedule <id>` or `Resume schedule <id>`, and carry no `aria-pressed`. Ignore a click with `event.detail > 1`, stop propagation on both click and double-click, and call `onTogglePause(entry)`. Add the matching extra heading cell in both full and compact renderings.
3. In `web/src/plugins/schedules/SchedulesTab.tsx`, add a `togglePause(entry)` handler that sends the `pause` intent when `entry.paused !== true` and `resume` otherwise, using the system identity, returns focus to the list container, and does not touch `selected`. Add `Space` and `p` handling in `onKeyDown` for `entries[selected]` when `canPauseRow` is true and no Cmd/Ctrl/Alt is held, calling `togglePause` and preventing both keys' default and propagation, as the arrow branch at `:66` does. Pass `togglePause` to both `ScheduleSection` calls. Extract into a new module if the file would pass 200 lines.
4. In `web/src/plugins/schedules/schedules.css`, add the `paused` row class using `var(--muted)` for text, add one grid column to both the full and compact `.schedules-section` rules, and style the new button like `.schedules-row-delete`. Do not change selection or hover backgrounds or the empty-state styles.
5. Add tests: `web/src/plugins/schedules/schedules-keys.test.ts` for `canPauseRow`; `web/src/plugins/schedules/SchedulesTab.test.tsx` for the icon appearing only on recurring system rows in both renderings, the icon and label switching with pause state, one intent per press, no selection move, no delete dialog, no owner focus on double-click, `Space`/`p` toggling only a selected recurring system row, and the `paused` text and class; `src/schedule/system/runscript-rows.test.ts` for a paused schedule still counting toward its runscript in the Scripts tab. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. The feature extends the Schedules tab plugin (`web/src/plugins/schedules/SchedulesTab.tsx`, `SchedulesRows.tsx`), whose System Schedules section lists system rows above Tab Schedules in both the full and docked renderings.
2. The closest existing control is the per-row trash button (`schedules-row-delete`), which opens `DeleteScheduleDialog` and does not change the selection.
3. A recurring system row carries a Pause/Resume icon button immediately before its trash button, in both renderings. It shows `faPause` while active and `faPlay` while paused and is styled like the trash button.
4. One-shot system rows and tab rows render an empty cell in that position, so the grid columns stay aligned.
5. A paused row's Next Run cell reads `paused` in both renderings; the docked rendering shows the whole word rather than a time-of-day split.
6. A paused row keeps sorting by its stored next-run time inside the System Schedules section, so it can sit among active rows.
7. A paused row carries a `paused` class drawing its text in `var(--muted)` instead of the recurring accent color. Its selection and hover backgrounds are unchanged.
8. Pressing the icon sends the `pause` or `resume` intent at once, with no dialog.
9. Pressing the icon does not change the selection, like the trash icon.
10. After the icon is pressed, focus returns to the list container so arrow keys keep working.
11. The row updates in place on the next `schedules` topic delivery, and the client keeps no local pause state.
12. While the list has focus, `Space` or `p` on a selected recurring system row pauses it when active and resumes it when paused, matching the asciicast tab's play/pause keys in `help/keys.md`. The keys count only without Cmd, Ctrl, or Alt held, and `Space`'s default page scroll is prevented.
13. `Space` and `p` do nothing on a selected one-shot system row or a tab row, or when no row is selected.
14. The key handling stays in the focused list and does not affect any global binding.
15. The icon's `aria-label` and `title` both read `Pause schedule <id>` while active and `Resume schedule <id>` while paused, and the button carries no `aria-pressed`.
16. A Pause or Resume that fails to save leaves the row as it was, with its icon and Next Run unchanged, and shows nothing else.
17. A double-click on the button counts as one press: the second click is ignored and the row's double-click does not fire.
18. Both renderings' grids gain one column for the icon. Long ids, owners, and commands keep truncating with an ellipsis.
19. The empty state (`No scheduled commands.`) and the section titles are unchanged.
20. Client code stays inside `web/src/plugins/schedules/`, and the pausable-row rule lives in the pure `schedules-keys.ts` predicate used by both the rows and the key handler.

## Tests

- `web/src/plugins/schedules/schedules-keys.test.ts`: `canPauseRow` is true only for a recurring system row with a key (Requirement 3; UI design 13 and 20).
- `web/src/plugins/schedules/SchedulesTab.test.tsx`: the icon appears only on recurring system rows in both renderings, with the right icon, label, and title; pressing it sends the matching intent without moving the selection or opening the delete dialog; a double-click sends one intent and does not focus the owner; `Space` and `p` toggle a selected recurring system row and do nothing elsewhere; a paused row shows `paused` and the `paused` class (Requirements 1 to 3, 6; UI design 3 to 17; Preserved behavior 1 to 3).
- `src/schedule/system/runscript-rows.test.ts`: a paused schedule still counts toward its runscript (Requirement 7).

## Out of scope

- No changes to the server intents, topic actions, wire shapes, or schema version; those landed in `pause-recurring-system-schedules-7-wire-plugin-topics.md`.
- No confirmation dialog for pause or resume and no notifications-feed entry.
- No pause of one-shot or tab-owned schedules, no `pause until`, and no re-sorting of paused rows to the end of a section.
- No change to the Scripts tab itself; it only needs a test pinning that paused rows still count.
- No change to the empty state or section titles.

## Verification

1. `$janissary/scripts/run.mjs check-diff`.
2. Concrete end-to-end check in the running app, from a project with `.janissary/scripts/ping.rs` containing `echo ping`: type `schedule system ping every 1m script ping`, then `schedules`. The System Schedules section shows `ping` with a pause icon before its trash icon and the tooltip reads `Pause schedule ping`. Press the icon: the row turns muted, Next Run reads `paused`, the icon becomes a play icon with tooltip `Resume schedule ping`, and the selection does not move. Wait two minutes and confirm no `System schedule ping ran` notice and no `echo ping` line. Quit and relaunch after the stored time has passed and confirm no `missed its run` notice and the row still reads `paused`. Select the row and press `Space`: the row returns to the accent color and Next Run shows a time about a minute ahead, with no immediate firing. Double-clicking the icon produces one intent and does not focus a tab.
