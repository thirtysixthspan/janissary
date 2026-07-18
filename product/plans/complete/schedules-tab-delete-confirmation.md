# Delete a schedule entry from the schedules tab with a confirmation dialog

**Complexity: 4/10** — spans server and web with one new label-scoped RPC, but every step copies an existing pattern: the delete-key → confirm-dialog flow from the file-tree tab, and the `deleteFileTreeItem` RPC wiring. No new architecture.

Today the aggregated `schedules` tab is read-only apart from selecting and focusing rows — cancelling a timer means switching to its owning tab and typing `schedule cancel <name>`. This adds a direct action: pressing Backspace or Delete on a selected schedule row opens a confirmation dialog, and confirming removes that entry from its owning tab's schedule (persisting the change for agent tabs, exactly as the `schedule cancel` command does).

## Design decisions

- **Trigger**: Backspace or Delete while a row is selected, mirroring the file-tree tab's delete gesture (`web/src/FileTreeTab.tsx:105`). Works in both the full and docked (compact) renderings, since both share the same container `onKeyDown` and selection state.
- **Confirmation**: reuse `ConfirmDialogShell` (the same shell `DeleteFileDialog` wraps) via a new thin `DeleteScheduleDialog` component. Title names the timer: `Delete schedule "<id>"?`, confirm label `Delete`, cancel label `Cancel`. Escape / click-outside / Cancel dismisses without deleting, matching the shared shell's trapped keyboard behavior.
- **Server action**: a new label-scoped RPC `cancelSchedule { tab, id }` — not a dispatched `schedule cancel …` command. A dedicated method mirrors `deleteFileTreeItem` (already the established pattern for a UI-confirmed mutation) and avoids the ambiguity of which tab is the "issuing" tab when the command is sent from the view-only schedules tab. The removal reuses the exact filter/persist/emit logic the scheduler's `tick()` already uses.
- **Persistence**: agent tabs persist the change to their state file (via `buildAgentState`/`persist`); harness tabs hold schedules in memory only, so they are not persisted — identical to `tick()` at `src/schedule/manager.ts:107` and the `schedule` command's `persistSchedule` at `src/commands/schedule.ts:20`.
- **Live refresh**: after removal, emit `state.dirty` so the aggregated view (and every other schedule surface) recomputes, the same signal `tick()` emits after a firing.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Reuse |
| --- | --- | --- |
| Delete-key → pending-delete → confirm dialog flow | `web/src/FileTreeTab.tsx:105`, `:90`, `:198` | Copy the shape into `SchedulesTab` |
| Two-button confirm modal | `web/src/ConfirmDialogShell.tsx`, wrapped by `web/src/DeleteFileDialog.tsx` | Add a sibling `DeleteScheduleDialog` wrapper |
| Label-scoped UI-confirmed mutation RPC | `src/protocol.ts:177` (`deleteFileTreeItem`), `src/message-handler.ts:69`, `src/controller.ts:198` | Follow the full path for `cancelSchedule`; one protocol file, imported by web as `@shared/protocol` |
| Filter + persist + emit on schedule change | `src/schedule/manager.ts:96` (`tick`), `:107` | Add a `cancel(label, id)` method reusing the same persist/emit calls |
| Aggregated view carries `tab` + `id` per row | `AggregatedScheduleView` in `src/protocol.ts`, `src/schedule/manager.ts:80` | The web row already has both fields to send |

## Proposed changes

**Protocol.** Add to the `RpcCall` union in `src/protocol.ts`, after `deleteFileTreeItem` (`src/protocol.ts:177`), with a doc comment in the same style: `{ method: 'cancelSchedule'; params: { tab: string; id: string } }` — remove one scheduled entry, identified by its owning tab label and timer id, after the client has confirmed with the user. The web app picks it up through the `@shared/protocol` alias; there is no second protocol file.

**Server — schedule manager.** Add a `cancel(label: string, id: string): boolean` method to `ScheduleManager` (`src/schedule/manager.ts`). It reads the tab's current entries, filters out the one whose `id` matches, and returns `false` when nothing changed. Otherwise it stores the reduced list, persists it for non-harness tabs (`this.managers.tab.persist(this.managers.tab.buildAgentState(tab, { schedule: next }))`, guarded by looking the tab up in `this.managers.tab.tabs` and checking `tab.view !== 'harness'`, exactly as `tick()` does at `:107`), emits `messageBus.emit('state', { type: 'dirty' })`, and returns `true`.

**Server — controller + handler.** Add a one-line delegate `cancelSchedule(tab: string, id: string): void` to `Controller` (`src/controller.ts`) that calls `this.managers.schedule.cancel(tab, id)`, placed near the other schedule delegates (`:91`). Add `case 'cancelSchedule': { controller.cancelSchedule(message.params.tab, message.params.id); break; }` to the `switch` in `src/message-handler.ts`. Relative imports in `src/` carry `.js` (NodeNext) — no new imports are needed here.

**Web — dialog.** Add `web/src/DeleteScheduleDialog.tsx`, a thin wrapper over `ConfirmDialogShell` mirroring `DeleteFileDialog.tsx`: props `{ id: string; onConfirm: () => void; onCancel: () => void }`, title `Delete schedule "<id>"?`, confirm label `Delete`, cancel label `Cancel`.

**Web — SchedulesTab.** In `web/src/SchedulesTab.tsx`: add `pendingDelete` state holding the entry to remove (`AggregatedScheduleView | null`). In `onKeyDown`, before the nav-key branch, when `e.key` is `Backspace` or `Delete` and `selected !== null`, `preventDefault`/`stopPropagation` and set `pendingDelete` to `entries[selected]`. Render `<DeleteScheduleDialog>` when `pendingDelete` is set; `onConfirm` sends `{ method: 'cancelSchedule', params: { tab: pendingDelete.tab, id: pendingDelete.id } }` and clears it, `onCancel` clears it. If `SchedulesTab.tsx` would exceed the 200-line limit after the change, extract the key-handling into the existing `web/src/schedules-keys.ts` helper rather than compacting.

## Tests

- `src/schedule/manager.test.ts` (new `describe('ScheduleManager cancel', …)`): cancelling an existing entry removes it, persists the reduced list for an agent tab and emits `state.dirty`, returns `true`; cancelling a harness tab's entry removes it and emits but does **not** call `persist`; cancelling an unknown id (or unknown tab) leaves the schedule unchanged, does not emit, and returns `false`. Mirror the existing `makeManagers`/`emitSpy` helpers in that file.
- `web/src/DeleteScheduleDialog.test.tsx`: renders the title with the timer id and the Delete/Cancel buttons, and confirm/cancel invoke their callbacks — mirroring `web/src/DeleteFileDialog.test.tsx`.
- `web/src/SchedulesTab.test.tsx`: pressing Delete (and Backspace) on a selected row opens the dialog; confirming sends `cancelSchedule` with the selected row's `tab` and `id`; cancelling sends nothing and closes the dialog; pressing Delete with no selection does nothing. Mirror the existing keyboard-driven tests in that file.

## Out of scope

- No bulk/clear-all action from the schedules tab (that stays on `schedule clear`).
- No editing of an existing schedule from the tab.
- No change to the per-tab floating schedule window or the `schedule` command itself.

## Open questions

None.

## Verification

Run `./scripts/run.mjs check-diff`. Manual check: open two agent/harness tabs, schedule a timer in each, run `schedules` to open the aggregated tab, select a row, press Delete, and confirm the dialog — the row disappears from the list and, for an agent tab, does not reappear after a relaunch. Press Delete then Escape to confirm the entry survives a cancelled dialog.
