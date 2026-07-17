# Scheduling tab

**Complexity: 5/10** — a new tab view-kind spanning server and web: a new protocol payload, a `ScheduleManager` aggregation method, the full notifications-style tab-creation chain across ~6 server files, and dual (main-area + compressed sidebar) rendering. No new RPC, persistence, or concurrency — every piece mirrors the existing notifications tab and reuses `setDock`/`setActiveTab` — which holds it below the subsystem tier.

A singleton, view-only tab that aggregates every scheduled command across all open tabs into one list, ordered by which fires next. Today each tab's schedule is visible only in that tab's own floating schedule panel, so there is no single place to see everything that is queued to run. The scheduling tab collects the entries the scheduler already tracks (keyed by tab label in `ScheduleManager`), tags each with its owning tab, and renders them next-to-run first. It has two renderings of the same data: a full main-application-area view with a row per entry, and a compressed one-line-per-entry view when docked into a sidebar. It mirrors the existing notifications tab — a singleton, dockable, view-only tab kind — differing only in that its body reflects live aggregated schedule state rather than an appended event feed.

## Design decisions

- **Open command.** A new `schedules` command (plural, distinct from the singular `schedule` command that creates/manages timers) opens or focuses the singleton tab; `schedules left` / `schedules right` docks it into that sidebar, and bare `schedules` on a docked tab undocks it back to center — exactly the open/dock/reuse shape of the `notifications` command.
- **Singleton, view-only, dockable.** Like the notifications tab, there is at most one; a second `schedules` reuses it. It is a new `TabView` view kind and is dockable into either sidebar via the existing `setDock` RPC.
- **Ordering.** Entries are listed strictly in order of next run (soonest first), across all tabs, as a single flat list — not grouped by owning tab.
- **Scope of aggregation.** The list includes entries from every open tab that can hold a schedule: agent tabs (persisted) and harness tabs (in-memory). This matches the full set the scheduler fires against.
- **Main-area view.** One row per entry showing: the owning tab, the timer name/id, the next-run time, the schedule spec (e.g. "every 2h"), and the command to run. Recurring vs one-shot entries are visually distinguished, reusing the recurring flag the schedule panel already carries.
- **Compressed sidebar view.** One compact line per entry: next-run time, timer name, and a short owning-tab indicator — no command text or full spec. Still ordered next-to-run first.
- **Interaction.** Read-only content, except that clicking a row focuses (switches to) the tab that owns that entry, via the existing `setActiveTab` RPC. No cancel or edit from this tab — changing a schedule stays on the `schedule cancel/clear` commands in the owning tab.
- **Empty state.** When no tab has any scheduled entry, the tab shows a short placeholder line, "No scheduled commands." (matching `schedule list`'s empty wording). The tab still opens and stays open.
- **Label.** The tab's label/title is "schedules" (lowercase), matching the command and the lowercase "notifications" convention.
- **Live updates.** The list is recomputed on each state emit, so it reflects new schedules, fired one-shots dropping off, and advanced next-run times as the scheduler's 1-second tick re-emits state — no separate refresh mechanism.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Reuse |
| --- | --- | --- |
| Singleton, dockable, view-only tab | `src/notifications-tab.ts`, `src/commands/notifications.ts` | Copy the open-or-reuse + optional-dock shape for the new `schedules` command and tab opener |
| Per-tab schedule state + row shape | `src/schedule/manager.ts:45` (`view(label)`), `ScheduleView` in `src/protocol.ts:12` | The aggregate iterates the same `schedules` map across all labels; the row type extends `ScheduleView` with the owning tab label and command |
| Schedule entries keyed by tab label | `ScheduleManager.schedules` (`src/schedule/manager.ts:12`), `allLabels()` usage in `tick()` | The full source of entries to aggregate; add an aggregate accessor beside `view(label)` rather than reaching into the map elsewhere |
| Humanized next-run + ordering data | `fmtNextRun`, `computeNextRun`, `ScheduleEntry.nextRun` | `nextRun` is the numeric sort key; `fmtNextRun` produces the displayed "next" string, as it already does for `view()` |
| New view-kind wiring | `TabView.view` union + `bufferLines`/`monitor`/`files` payload fields in `src/protocol.ts:53`, populated in `src/tab/view.ts` | Add a `'schedules'` view kind and the `aggregatedSchedules` payload field the same way; populate it in `buildTabView` only for the schedules tab |
| Center-area render by view kind | `web/src/ViewTabBody.tsx:26` (the `notifications` branch) | Add a `'schedules'` branch rendering the new main-area component |
| Sidebar render + tab switcher | `web/src/Sidebar.tsx:32` (`selectedView` union), `:74`–`:82` (per-view body) | Add the schedules tab as a third dockable view with its compressed body |
| Dock cycle + focus RPCs | `setDock` and `setActiveTab` in `src/protocol.ts` | Reuse `setDock` for docking and `setActiveTab` for row-click focus; no new RPCs |

## Proposed changes

**Protocol (`src/protocol.ts`).** Add `'schedule'` — spelled `'schedules'` (plural) — to the `TabView.view` union at `src/protocol.ts:54` (with a doc-comment entry in the sentence at `src/protocol.ts:53`, the same place `'notifications'` is described). Use the plural `'schedules'` deliberately so it never reads as the existing singular `schedule: ScheduleView[]` per-tab field at `src/protocol.ts:48`. Add an aggregated row type named `AggregatedScheduleView` — `ScheduleView` (`src/protocol.ts:12`: `id`, `spec`, `next`, `recurring`) plus a `tab: string` (owning tab label) and a `command: string` (the per-tab `ScheduleView` deliberately omits the command; the aggregate needs it for the main-area view). Add an optional `aggregatedSchedules?: AggregatedScheduleView[]` payload field on `TabView`, present only when `view === 'schedules'`, documented the way `monitor`/`files` are (`src/protocol.ts:67`/`:71`). This field name is distinct from the existing `schedule` field, avoiding any collision.

**Server — aggregation.** Add an `aggregatedView(): AggregatedScheduleView[]` method to `ScheduleManager` (`src/schedule/manager.ts`, beside `view(label)` at `:45`). It iterates the `schedules` map (`src/schedule/manager.ts:12`), and — mirroring the open-tab guard in `tick()` (`src/schedule/manager.ts:58`–`:60`, which skips a label with no matching open tab) — for each label that still has an open tab, emits one row per entry: `{ tab: label, id: e.id, spec: e.spec, next: fmtNextRun(e.nextRun), recurring: e.recurring, command: e.command }`. It sorts all rows ascending by the entry's numeric `nextRun` (soonest first) before mapping through `fmtNextRun`, so the sort key is the raw timestamp, not the humanized string. It reuses the same per-entry `id`/`spec`/`next`/`recurring` shaping `view(label)` produces so the two do not diverge. The method adds ~12 lines; `src/schedule/manager.ts` (~102 lines) stays well under the 200-line limit.

**Server — the tab.** Mirror the notifications-tab creation chain end to end, one new symbol per existing one:
- `src/schedules-tab.ts` (paralleling `src/notifications-tab.ts`): a `SCHEDULES_LABEL = 'schedules'` constant, a `schedulesTab(managers)` singleton lookup (`t.view === 'schedules'`), and an `openSchedulesTab(managers, dock?)` open-or-reuse-plus-optional-dock opener copying `openNotificationsTab` (`src/notifications-tab.ts:20`), including the "bare command undocks a docked tab back to center" behavior. No `appendNotification` equivalent is needed — this tab reflects computed state, not an appended feed.
- `makeSchedulesTab` in `src/tab/index.ts` (beside `makeNotificationsTab` at `src/tab/index.ts:70`), `view: 'schedules'`, `title: 'schedules'`.
- `addSchedulesTab` in `src/tab/creators.ts` (beside `addNotificationsTab` at `src/tab/creators.ts:66`).
- `openSchedulesTab` in `src/tab/openers.ts` (beside `openNotificationsTab` at `src/tab/openers.ts:53`) and the one-line `TabManager.openSchedulesTab` delegate (beside `src/tab/manager.ts:356`).
- `src/commands/schedules.ts` (paralleling `src/commands/notifications.ts`), matching `/^schedules\b/i`, appending the command echo and calling the opener with the parsed `left`/`right`. Register it in `src/commands/index.ts` (the command registry, `src/commands/index.ts`) where `notifications` is registered.

**Payload threading.** Populate the aggregate once per state emit and hand it to `buildTabView`, which attaches it only to the schedules tab. Concretely: add an `aggregatedSchedules: AggregatedScheduleView[]` parameter to `TabManager.view` (`src/tab/manager.ts:319`) and to `buildTabView` (`src/tab/view.ts:7`), passed from `Controller.view()` (`src/controller.ts:72`–`:77`) as `this.managers.schedule.aggregatedView()` — exactly like the existing `(l) => this.managers.schedule.view(l)` argument at `src/controller.ts:76`, except computed once rather than per-label. In `buildTabView`, set `aggregatedSchedules: tab.view === 'schedules' ? aggregated : undefined`, leaving it undefined for every other tab.

**Web — main-area component.** Add `web/src/SchedulesTab.tsx` reading `tab.aggregatedSchedules`: render the full list (owning tab, timer name, next-run, spec, command; recurring entries styled distinctly — reuse the recurring/accent treatment the schedule panel already applies, `ScheduleView.recurring`), or the "No scheduled commands." placeholder when the list is empty (the exact wording `formatSchedule` emits, `src/schedule/display.ts:18`). Each row is clickable and, on click, finds the owning tab's index in the client's `tabs` list by `label` and sends `setActiveTab` (`src/protocol.ts:111`); agent and harness tabs are never docked, so they can always be made active. Wire a `tab.view === 'schedules'` branch into `web/src/ViewTabBody.tsx` (beside the `'notifications'` branch at `web/src/ViewTabBody.tsx:26`) that renders it.

**Web — compressed sidebar rendering.** No server dock change is needed: `setDock`/`TabManager.setDock` is view-agnostic and operates on any tab index (`src/controller.ts:212`–`:215`). Extend `web/src/Sidebar.tsx`: broaden its `selectedView` state type (`web/src/Sidebar.tsx:32`) and the two casts at `:52` and `:69` from `'files' | 'notifications'` to include `'schedules'`, and add a `current.tab.view === 'schedules'` body branch beside the notifications one (`web/src/Sidebar.tsx:80`) rendering the compressed one-line-per-entry form (next-run, timer name, short tab indicator). Render the compressed form via a `compact` boolean prop on `SchedulesTab` (decided: one component, not a sibling) so the row-click-to-focus behavior is shared. Keep `SchedulesTab.tsx` under the 200-line limit, extracting a row/helper module if the two layouts push it over.

**Spec.** Add a "Scheduling tab" section to `product/specs/scheduling.md` documenting: the `schedules` command and its `left`/`right` dock forms, that it is a singleton view-only tab labeled "schedules", the next-to-run ordering across all agent and harness tabs, the two renderings (full main-area columns vs compressed sidebar line), the row-click-to-focus behavior, the read-only boundary, and the empty-state message. Cross-reference the existing "Schedule window" section, which stays as the per-tab floating panel.

## Tests

- `src/schedule/manager.test.ts`: `aggregatedView()` returns entries from multiple tabs merged and sorted soonest-first by `nextRun`, tagged with the correct owning tab label and carrying each entry's `command`, and an empty array when no tab has a schedule; harness-tab entries are included; entries for a label with no open tab are excluded.
- Server command/tab tests mirroring the notifications ones (`src/notifications-tab.test.ts` / any `notifications` command test): `schedules` opens the singleton (and reuses it on a second call), `schedules left`/`right` docks it, bare `schedules` on a docked tab undocks it; a `src/tab/view.test.ts` case that `buildTabView` sets `aggregatedSchedules` only when `tab.view === 'schedules'` and leaves it undefined otherwise.
- `web/src/SchedulesTab.test.tsx`: renders one row per aggregated entry with the expected fields and next-to-run ordering; shows "No scheduled commands." when empty; clicking a row sends `setActiveTab` with the owning tab's index; the `compact` variant renders the one-line form. Model on `web/src/NotificationsTab.test.tsx`.
- `web/src/Sidebar.test.tsx`: the schedules tab docks and renders its compressed body alongside the file-tree and notifications views.

## Out of scope

- Any way to create, cancel, edit, or clear a schedule from this tab — it is read-only apart from click-to-focus. Management stays on the `schedule cancel/clear` commands.
- Grouping entries by owning tab, per-tab collapsible sections, or any ordering other than next-to-run.
- A terminal/TUI rendering of the aggregated tab; this is web-app only. The existing per-tab schedule window in the TUI is unchanged.
- Filtering, searching, or paginating the list.
- Changes to how schedules fire, persist, or to the existing per-tab floating schedule panel.

## Open questions

None.

## Verification

Run `./scripts/run.mjs check-diff`. Manual check: create schedules in two different tabs (e.g. one `every 1m` in an agent tab and one `at <time>` in a harness tab), run `schedules`, and confirm both appear in one list ordered by next-to-run with owning tab, name, spec, and command shown; run `schedules right` and confirm the tab docks into the right sidebar showing the compressed one-line form; click a row and confirm the app switches to that entry's owning tab; cancel one schedule in its tab and confirm it drops from the aggregated list within a tick; cancel all schedules and confirm the "No scheduled commands." placeholder appears.
