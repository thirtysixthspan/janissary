# System schedules 12: system target and runscript picker in the dialog

**Complexity: 4/10**

This extends one server-provided dialog snapshot and its pure builder/selection logic. File discovery, persistence and schedule command behavior already exist in earlier subplans.

## Goal

Let the existing web creation dialog select project schedules and existing runscripts while preserving its five forms and tab-target behavior. Source: `product/plans/ready/add-system-schedules.md`.

## Decisions and dependencies

- Dependencies: 04 (catalog), 08/09 (owner and grammar), 10 (completion/command services), 11 (aggregate visibility).
- The server supplies one explicit system target plus eligible visible tab targets. Exclude the managed system shell from tab choices even when revealed; it is represented only by the project target. Other hidden tabs are excluded too. Typed `in system` remains available outside this dialog.
- Extend `ScheduleLaunchView` additively with system availability and a sorted runscript-name catalog; keep existing tab `targets` and active label. The client uses a discriminated local target selection rather than confusing a tab label with project ownership. The server re-reads the catalog while the dialog is open so newly added/deleted files are reflected; rate-limit filesystem scans with existing state-refresh patterns rather than loading plugins or reading on every PTY byte.
- Selecting system replaces the free command field with a picker of existing script names and builds `schedule system NAME <form> script <name>`. It never builds `in system`. The dialog creates no files. With no scripts, system creation is disabled with an explanatory empty state.
- Keep all five forms, remembered values across reopens within the same app process, cancel/Escape/outside-click behavior, normal submission/error attribution, and tab-command assembly. Dialog selections are not restored after an application restart, matching current master. Reconcile remembered/deleted targets and scripts against the current server catalog so stale values cannot enable submission. If opened from system, default to the system target rather than a hidden tab choice. Eligible remote tabs restored by the ordinary startup path remain ordinary tab targets, never the project system target.

## Existing code to reuse

`ScheduleManager.scheduleLaunchView`, shared `src/protocol/schedule.ts`, 04 catalog, `web/src/ScheduleLaunchDialog/{ScheduleDialog,schedule-command,useScheduleLaunchActions}.ts(x)`, and shared launch-dialog keyboard/focus helpers. Components render server catalogs; business rules belong in the pure command builder/hook.

## File scope

- `src/schedule/manager.ts`, new `src/schedule/launch-view.ts` and optional `src/schedule/system/script-catalog.ts` caching service if necessary; `src/protocol/schedule.ts`; `src/state/{event,listings}.ts` only for catalog refresh integration using the current cached-listings pattern. A catalog service that acquires a watcher/subscription must dispose it with its owner; no eager concrete plugin import.
- `web/src/ScheduleLaunchDialog/{ScheduleDialog.tsx,schedule-command.ts,useScheduleLaunchActions.ts}`; new `web/src/ScheduleLaunchDialog/schedule-selection.ts` for validity/reconciliation, optional `web/src/ScheduleLaunchDialog/ScheduleCommandField.tsx` extract. `web/src/theme.css` owns the existing modal/schedule styles and is in scope only if the script-empty state needs a new style.
- Tests: existing `src/schedule/manager.test.ts`, `src/state/listings.test.ts` if changed, `web/src/ScheduleLaunchDialog/{schedule-command.test.ts,ScheduleDialog.test.tsx}`, and `web/src/App.test.tsx` dialog fixtures; new launch-view/catalog tests, `web/src/ScheduleLaunchDialog/{schedule-selection.test.ts,useScheduleLaunchActions.test.tsx}`, and a dialog/server command integration test colocated with the dialog. The action-hook test is new and uses a render-capable `.test.tsx` file when needed.
- Specs/docs: `product/specs/scheduling.md`, `documentation/user-documentation/automation/scheduling.md`, `help.md` scheduling dialog description.

## Ordered changes

1. Extend the shared launch snapshot with the explicit system target/catalog and extract server view shaping if needed for the 200-line rule. Exclude hidden/managed system tabs from ordinary target choices.
2. Add pure target/catalog reconciliation and command construction for system mode; retain existing tab branch unchanged.
3. Render the script picker/empty state, reconcile remembered values, validate all fields and submit through the ordinary command action.
4. Test all forms and stale catalog behavior; document how users create a script explicitly before selecting it.

## Tests and verification

Test system versus tab command strings for all five forms, no `in system` output, no bare command acceptance in system mode, empty catalog, added/deleted scripts, remembered selections, invalid/hidden default targets, reveal-state-independent system exclusion, name/script-required submit state, server missing-file race after dialog opens, cancel/Escape/outside click, and ordinary active/other-tab target regressions.

Run `./scripts/run.mjs check-diff`. Scope E2E opens the actual web dialog over a real scratch server, selects system and an existing script, submits a near-term form, sees the project entry in schedules and its later hidden-shell result, then selects a tab target to prove that path still creates a tab timer. Delete the selected script on disk while the dialog is open and confirm refresh/submit refusal creates nothing. Full browser evidence is collected in 13.

## Boundaries

Web creation only, with no terminal UI dialog, script creation/editor embedded in the dialog, schedule editing, or per-tab system window. Wire definitions stay in the shared server protocol, with no client copy.
