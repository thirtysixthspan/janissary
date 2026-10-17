# System schedules 15: system target and runscript picker in the dialog

**Complexity: 4/10** — a small web dialog extension plus one additive launch snapshot field, with correctness centered on target reconciliation and preserving the existing submit and cancel paths.

## Goal

Let the web creation dialog create project-owned system schedules from existing runscripts while preserving tab schedule creation. Source: `product/plans/ready/add-system-schedules.md`.

## Decisions and dependencies

- Dependencies: completed plans 01 (hidden-tab identity), 07 (runscript catalog and safe reads), 12 (system schedule grammar and script-name completion), and 13 (fresh catalog completion). Plans 12 and 13 use the same `catalogRunscripts` source; the dialog receives its picker options in the launch snapshot and adds no completion RPC. The system owner and aggregate schedules surface are already delivered by 11 and 14; this dialog neither changes them nor depends on their internals. Plan 16 owns the full browser matrix.
- Add the sorted names from `catalogRunscripts` (`src/schedule/system/runscript-files.ts:41`, `catalogRunscripts`) to the existing `ScheduleLaunchView` snapshot. Reuse the one-second cached-listing pattern in `src/state/listings.ts:10` (`LISTING_TTL_MS`) and compute the catalog only while the launch dialog is open. A missing or unsafe catalog yields no picker options; the empty state tells the user to add a valid `.rs` file under `.janissary/scripts/`. Repeated state snapshots refresh the catalog within the existing listing TTL; every submit still goes through the command path, which re-reads and rejects a missing or unsafe script.
- Keep tab labels in `ScheduleLaunchView.targets` and `active`; never include the managed system shell as an ordinary tab target, even when revealed. The project system target is always a separate choice, including when no system shell is running or the script catalog is empty. When the active tab is the system shell, default the dialog to the system target; otherwise default to the active eligible tab.
- Represent the local selection as a discriminated system-or-tab choice, not a string that can confuse project ownership with a tab label. Reconcile remembered tab targets against the latest eligible targets, falling back to the active eligible tab, then the first eligible tab, then the system target if no tab remains eligible. If the remembered runscript is no longer in the refreshed catalog, clear only that selection and keep system submission disabled until the user chooses an available script. Do not silently select a different script. Preserve both the tab command draft and system script choice when switching target modes, along with all five form values and module-memory across dialog reopens in the same app process; do not persist dialog state across restart.
- In tab mode, retain the existing `schedule NAME [in TAB] <form> COMMAND` assembly and command field. In system mode, replace the command field with a picker containing only catalog names and assemble exactly `schedule system NAME <form> script <name>`. Reuse the five existing form controls. Require a nonblank name, the form's existing required time/date/interval value, and a selected catalog script in system mode; the system form has no free command field and never emits `in system`.
- Render an explicitly labelled project/system target and runscript picker. Give the empty message `role="status"` and associate it with the picker using `aria-describedby`; keep Schedule disabled while the catalog or required selection is empty. Retain the dialog's current `role="dialog"`, `aria-modal`, keyboard/focus helper, Escape and Cancel behavior, outside-click behavior, and submit sequence: send the ordinary command RPC, then close the dialog. Command errors continue to surface through the existing command path.

## What already exists (reuse, don't rebuild)

| Piece | Verified seam | Reuse decision |
| --- | --- | --- |
| Launch dialog snapshot | `src/protocol/schedule.ts:11` (`ScheduleLaunchView`); `src/controller.ts:49` (`scheduleLaunchView`); `src/state/event.ts:18` (`scheduleLaunch`) | Add the runscript-name catalog to this shared snapshot; keep the existing `targets` and `active` fields. |
| Eligible tab targets | `src/schedule/manager.ts:52` (`scheduleLaunchView`); `src/schedule/targets.ts:7` (`canRunSchedules`) | Keep the current eligibility predicate and exclude `systemShell` tabs from the normal tab list. The project target is not a tab. |
| Runscript discovery and validation | `src/schedule/system/runscript-files.ts:25` (`readRunscript`), `:41` (`catalogRunscripts`); `src/schedule/system/runscript.ts:1` (`isRunscriptName`) | Reuse the sorted catalog for options; do not enumerate files or duplicate name rules in the client. Submit revalidation remains in the existing server command. |
| Forms and command submission | `web/src/ScheduleLaunchDialog/schedule-command.ts:23` (`buildScheduleCommand`); `useScheduleLaunchActions.ts:5` (`isValid`) and `:21` (`create`) | Extend the pure builder and action validation with the system branch; retain the `command` RPC and close-after-submit sequence. |
| Dialog lifecycle and keyboard | `web/src/ScheduleLaunchDialog/ScheduleDialog.tsx:27` (`remembered`); `web/src/shared/use-launch-dialog.ts:5` (`useLaunchDialog`); `web/src/shared/useDialogKeyboard.ts:27` (`useDialogKeyboard`) | Preserve in-process field memory and use the existing Escape, focus, and outside-click behavior. |

## File scope

- Server snapshot/catalog: `src/protocol/schedule.ts`, `src/controller.ts`, `src/state/listings.ts`, and `src/state/listings.test.ts`; use `src/state/event.ts` only if snapshot composition needs adjustment. Keep filesystem access behind `catalogRunscripts` and the listing cache; do not add a watcher, plugin load, or scan on each state event.
- Web feature: `web/src/ScheduleLaunchDialog/{ScheduleDialog.tsx,schedule-command.ts,useScheduleLaunchActions.ts}`; add `schedule-selection.ts` for pure target/catalog reconciliation if needed. Extract a presentational picker only if `ScheduleDialog.tsx` would otherwise exceed the 200-line source limit. Keep feature logic in this feature directory and consume the shared wire type from `@shared/protocol`.
- Tests: extend `src/state/listings.test.ts` for cached, sorted catalog refresh and unavailable-catalog behavior; add/extend `web/src/ScheduleLaunchDialog/{schedule-command.test.ts,ScheduleDialog.test.tsx}` and add `schedule-selection.test.ts` if selection reconciliation is extracted. Update `web/src/App.test.tsx` launch snapshot fixtures. Use colocated tests and a render-capable `.test.tsx` for component interactions.
- Behavior documentation: update `product/specs/scheduling.md`'s “New schedule dialog” section and `documentation/user-documentation/automation/scheduling.md`'s “Scheduling from a dialog” section. `help.md` already documents the `schedule system` command and needs no dialog-specific change.

## Ordered changes

1. Extend the launch snapshot with the cached existing-runscript catalog, and filter the managed system shell out of tab targets while retaining the active label needed to choose the default target.
2. Add pure system-or-tab selection reconciliation and system command building. Keep tab command construction byte-for-byte equivalent for existing selections.
3. Render the project target and runscripts picker/empty state, preserve inactive-mode drafts, reconcile stale remembered values, and submit through the ordinary action hook.
4. Test the five forms in both modes, catalog refresh and stale-selection behavior, accessible empty state, existing dialog lifecycle, and tab regressions; update the scheduling spec and user guide.

## Tests and verification

Cover tab and system command strings for all five forms; ensure system output is exactly `schedule system NAME <form> script <name>` and never contains `in system` or a free command. Cover that only valid catalog names appear; missing/unsafe catalogs show an accessible empty state and disable submit; refreshed catalogs clear a deleted remembered script without choosing another; an eligible tab target and its command draft survive mode changes; stale tab targets reconcile safely; and opening from the system shell defaults to project ownership. Preserve tests for tab defaults, all required fields, ordinary command errors, command-then-close submission, remembered fields, Schedule-button focus, Escape, Cancel, outside click, and unchanged tab command strings. The server command's fresh missing-script check remains covered by plan 12 and must be exercised as the submit race boundary, not reimplemented here.

Run `./scripts/run.mjs check-diff` and `git diff --check`. Manually open the real web dialog against a scratch project, select system and an existing script, create a near-term system schedule, and confirm the normal command result and the project-owned row in the existing schedules surface. Also select a tab target and verify its command still uses the tab form. This is a focused dialog integration check; plan 16 owns the final cross-feature browser matrix.

## Boundaries

Web creation dialog and its launch snapshot only. No terminal UI dialog, schedule grammar or command-routing changes, system schedule owner changes, script creation/editor in the dialog, aggregate schedules plugin changes from 14, or plan 16 end-to-end matrix. The dialog only references scripts that already exist in the server-provided valid catalog.
