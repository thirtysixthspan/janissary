# Pause and resume recurring system schedules

**Complexity: 8/10** — ~315 added lines across 24 production files, 48 requirements, 44 test scenarios (p=8.43)

## Goal

Let a user suspend one recurring system schedule and later restart it without deleting and re-creating it. The feature text asks to "Add Pause and Resume to recurring system rows so a user can suspend one timer through a maintenance window or restart and pick up at its next future occurrence." Today the Schedules tab can only create and delete system rows (`product/specs/scheduling.md` § Scheduling tab), so the only way to stop a timer is to lose it. After this change a paused schedule keeps its key, name, runscript and recurrence. It doesn't fire, and startup recovery leaves it alone. Resuming it sets the next run to the first occurrence after that moment. Pause and resume are available from a row icon and a key in the Schedules tab, and from two new `schedule system` verbs.

## Requirements

Pausing and resuming:

1. A recurring system schedule can be paused ("Add Pause and Resume to recurring system rows").
2. A paused system schedule can be resumed ("Add Pause and Resume to recurring system rows").
3. A paused schedule keeps its key, name, runscript, spec, and recurrence fields unchanged ("keep its recurrence settings for later resumption").
4. A paused schedule does not fire while it is paused ("suspend one timer through a maintenance window").
5. The paused state survives an application restart ("suspend one timer through a maintenance window or restart").
6. Startup recovery does not report a paused schedule as missed ("pause state must also apply during startup recovery").
7. Startup recovery does not advance or remove a paused schedule ("pause state must also apply during startup recovery").
8. A resumed schedule next runs at its first occurrence strictly after the moment of resuming ("pick up at its next future occurrence").
9. Resuming never runs the occurrences that fell inside the paused period ("pick up at its next future occurrence").
10. Pausing a schedule leaves runscript lines already queued in the system shell from an earlier firing in place, and they run as normal (user answer: "Let them run").
11. A pause committed while a tick is waiting on the system shell for that schedule stops that firing: nothing is enqueued and the paused entry is left as stored (user answer: "Re-check and skip").
12. Pausing an already-paused schedule, or resuming an active one, writes nothing to the store (user answer: "Core set": "The store must not be rewritten unless a schedule is actually paused or resumed").
13. Pausing or resuming posts nothing to the notifications feed, from either the Schedules tab or the command (user answer: "No notice").

Store format:

14. Every save of the system schedule store writes `version: 2` (user answer: "Always v2").
15. A version-1 store still loads, and its entries are all active (user answer: "Always v2").
16. A version-1 entry carrying `paused` is invalid and fails the load like any other invalid entry (user answer: "Always v2").
17. A version-2 entry whose `paused` field is present but not `true` is invalid (user answer: "Always v2").
17a. A version-2 one-shot entry carrying `paused` is invalid, since only recurring schedules can be paused (user answer: "Recurring system only").
18. A store version above 2 is still unsupported and blocks saving (user answer: "Always v2"; `product/specs/scheduling.md` § Durable system schedules: "A newer unsupported store version blocks saving").

Commands:

19. `schedule system pause <name>` pauses every active recurring system schedule with that exact name (user answer: "Tab + command", mirroring `schedule system cancel <name>`).
20. `schedule system resume <name>` resumes every paused system schedule with that exact name (user answer: "Tab + command").
21. A successful `schedule system pause <name>` prints `Paused <name> in system.` (user answer: "Mirror cancel").
22. A successful `schedule system resume <name>` prints `Resumed <name> in system.` (user answer: "Mirror cancel").
23. Pausing a name whose recurring rows are all already paused prints `Paused <name> in system.` (user answer: "Already-paused rows count as success (idempotent)").
24. `schedule system pause <name>` prints `No recurring scheduled command "<name>" in system.` when no recurring system schedule has that name, including when only one-shots do, and changes nothing (user answer: "Mirror cancel").
25. `schedule system resume <name>` prints `No paused scheduled command "<name>" in system.` when no paused system schedule has that name, and changes nothing (user answer: "Mirror cancel").
26. A failed save during a pause or resume command prints `Could not save system schedules.`, prints no success message, and leaves every entry as it was (user answer: "Mirror cancel").
27. `schedule system list` prints a paused entry as `<name>  <spec>  (paused)  script <name>`, with `(paused)` in place of `(next: <when>)` (user answer: "(paused) replaces next").
28. `pause` immediately after `schedule system` is a reserved verb: followed by exactly one name it pauses, and any other shape returns the system usage line without creating a schedule (user answer: "Reserve them").
29. `resume` immediately after `schedule system` is a reserved verb: followed by exactly one name it resumes, and any other shape returns the system usage line without creating a schedule (user answer: "Reserve them").
30. A stored system schedule already named `pause` or `resume` still loads, fires, and can be cancelled (user answer: "Reserve them").
31. A malformed system invocation returns exactly `Usage: schedule system NAME <form> script <name> | schedule system list | schedule system cancel <name> | schedule system pause <name> | schedule system resume <name> | schedule system clear` (user answer: "Insert after cancel").
32. `schedule system cancel <name>` removes paused rows with that name as well as active ones (user answer: "Core set": "`schedule system cancel`/`clear` still remove paused rows too").
33. `schedule system clear` removes paused rows as well as active ones (user answer: "Core set").
34. `execute <name>` runs a runscript immediately even when a schedule naming it is paused (user answer: "Core set").

Completion:

35. Tab completion after `schedule system` offers `pause` and `resume` alongside `list`, `cancel`, and `clear` (user answer: "State-aware names").
36. Tab completion after `schedule system pause` offers only the names of active recurring system schedules (user answer: "State-aware names").
37. Tab completion after `schedule system resume` offers only the names of paused system schedules (user answer: "State-aware names").

Schedules tab:

38. Each active recurring system row offers a Pause control, which pauses only that row by key (user answer: "Tab + command").
39. Each paused system row offers a Resume control, which resumes only that row by key (user answer: "Tab + command").
40. One-shot system rows and tab rows offer no Pause or Resume control (user answer: "Recurring system only").
41. A pause or resume from the tab that fails to save leaves the row as it was (user answer: "Silent, like Delete").
42. Deleting a paused row from the Schedules tab removes only that row by key (user answer: "Core set": "Delete-by-key still removes only that row").
43. A `pause` or `resume` intent naming a key that is not a recurring system row in the current view is refused and changes nothing (precedent: the `cancel` topic action is authorized against the current aggregated view, Existing functionality 6).
43a. The Space/p shortcut acts only when the list container itself owns the keydown (`e.target === e.currentTarget`): Space on the focused New schedule button still opens the New schedule dialog without toggling the selected row, and Space on a different row's pause button activates that button's row rather than the selected one.

Elsewhere:

44. Tab-owned timers and the per-tab schedule window show no pause state and behave as today (user answer: "Core set").
45. The Scripts tab counts paused schedules exactly like active ones, for its clock icon and its delete warning (user answer: "Count paused too").
46. `product/specs/scheduling.md` describes pause and resume, the version-2 store, the new verbs and messages, and the row control (`ai/guidelines/architecture-principles.md` §10).
47. `help/keys.md` gains a Schedules tab controls table (user answer: "Space or p toggles"; see UI design 12).
47a. `product/specs/tab-plugins.md` describes all five schedules topic actions — cancel one entry, clear one owner's entries, switch to the owning tab, and pause or resume a recurring system row by its immutable key — each authorized against the plugin's current aggregated view with a failed save returned as a domain error the schedules intent rejects. It states that a system row may carry `paused: true` whose next run reads `paused`, and that the plugin pauses or resumes such a row through those topic actions rather than only cancel, clear, and focus.
47b. `help/schedule.md` lists `schedule system pause <name>` and `schedule system resume <name>` beside the other system management forms, names pausing and resuming recurring schedules in the project-schedule use case, notes that `pause` and `resume` are reserved immediately after `schedule system`, and shows one example per verb with the exact replies `Paused nightly in system.` and `Resumed nightly in system.`.

## Design decisions

- Pausing sets one optional flag on the stored entry, `paused: true`, which is absent while the schedule is active. The entry keeps every other field, and firing and startup recovery both skip an entry carrying the flag (research: Prefect's `active: false` keeps the configuration, https://www.prefect.io/docs/v3/concepts/schedules; Kubernetes `.spec.suspend`, https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/; Temporal `state.paused`, https://docs.temporal.io/schedule). Pausing edits the existing entry and never deletes and re-creates it, so its key stays stable (https://phabricator.wikimedia.org/T394423). A paused entry's stored `nextRun` stays a finite number and goes stale. Nothing reads it until resume replaces it.
- Resume computes the first occurrence strictly after the current time and fires nothing for the paused period, following Quartz's "do nothing" misfire rule and APScheduler's `resume_job` (https://www.quartz-scheduler.org/api/2.2.3/org/quartz/CronTrigger.html, https://github.com/agronholm/apscheduler/blob/3.x/src/apscheduler/schedulers/base.py). The advance loop in `recoverSystemSchedules` (Assumption 3) moves into a pure `nextFutureRun(entry, now)` in `src/schedule/time.ts`, beside `computeNextRun`, and recovery and resume both call it. So they can't disagree, and a stale `nextRun` can't trigger an immediate catch-up run on the next tick, which is the Kubernetes unsuspend pitfall (https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/).
- The store format moves to version 2, and every save writes `version: 2` whether or not an entry is paused (user answer: "Always v2"). The decoder accepts versions 1 and 2, and `paused` is valid only in a version-2 entry. An older Janissary therefore refuses a store this version has saved instead of firing paused entries and dropping their flag. The cost is that an older process loads no system schedules at all from such a store. Loading never writes on its own, so a version-1 file stays version 1 until the first save, which may be a recovery save (Assumption 2, Assumption 6).
- The pure pause and resume list edits go in `src/schedule/system/mutations.ts`, beside `cancelSystemScheduleByKey` and `cancelSystemScheduleByName` (user answer: "Extend mutations.ts"). `SystemScheduleManager` gains four thin methods: `pauseByKey`, `resumeByKey`, `pauseByName`, and `resumeByName`. Each calls the pure edit, returns success without saving when nothing changed, and otherwise calls the existing `commit` (Existing functionality 1).
- A pause committed while a tick is waiting on the system shell wins (user answer: "Re-check and skip"). `fireDue` skips a paused entry before claiming it. `applyFireOutcome` already looks up the current entry by key, and when that entry is now paused it commits nothing and enqueues nothing (Assumption 4). This is a deliberate limit. A pause and then a resume that both land inside one wait on the shell leave the entry active, so that one due batch still runs. If that ever matters, the upgrade is to compare the current entry's `nextRun` with the claimed one and skip on any change.
- The wire carries the paused state as an optional `paused: true` on system rows of `AggregatedScheduleView` and on the plugin's import-free `ScheduleRow` copy (user answer: "Two intents + paused flag"). The server sets the row's `next` text to `paused`, so the client shows server-computed text (`ai/guidelines/architecture-principles.md` §1). Rows keep sorting by the raw stored `nextRun` (user answer: "`paused`, stale order"; Assumption 5).
- The Schedules plugin gains two intents, `pause` and `resume`, each carrying `{ tab: 'system', owner: 'system', key, id }`. They map to new `schedules` topic actions `pause` and `resume`, which are authorized against the current aggregated view as `cancel` is, and then call `pauseByKey` or `resumeByKey` (user answer: "Two intents + paused flag"; Existing functionality 5 to 7). A refused save comes back as `rejectRequest`, exactly as `cancel` does today.
- `SCHEDULES_PAYLOAD_SCHEMA_VERSION` rises from 2 to 3, together with the literal `clientPlugin(2, …)` for `schedules` in `web/src/plugins/registry.tsx` (user answer: "Two intents + paused flag"; Assumption 7).
- `pause` and `resume` are reserved after `schedule system` by the same branch that reserves `list`, `cancel`, and `clear` today (user answer: "Reserve them"; Existing functionality 10).
- State-aware completion widens `SystemScheduleCompletions` from `{ names, scripts }` with two more name lists, the active recurring names and the paused names. They're built in `src/controller/completion.ts` from `systemSchedule.list()` (user answer: "State-aware names"; Existing functionality 11).
- The Pause/Resume row control switches its icon, visible tooltip, and accessible name between the two actions, and carries no `aria-pressed`. This follows the WAI-ARIA and MDN guidance for play/pause controls (https://www.w3.org/WAI/ARIA/apg/patterns/button/, https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-pressed, https://inclusive-components.design/toggle-button/).
- The Space/p shortcut is gated on `e.target === e.currentTarget`, the container half of the Scripts tab's `ownsKey` pattern. Keys aimed at a focused button stay with that button: Space on New schedule still opens the dialog, and Space on a second row's pause button toggles that row. Selection, delete, and Enter branches keep their existing target handling.
- The pause icon button and the trash button share one `.schedules-row-icon-button` CSS rule carrying the eight identical icon-button declarations, instead of a duplicate block on each. Each button keeps its own class (`schedules-row-pause`, `schedules-row-delete`) alongside the shared class, so a later hover, focus, or color change cannot drift between them.

## Preserved behavior

1. Cancelling by name removes every same-named system row and cancelling by key removes only that row (user answer: "Core set"). Pause and resume must not remove any row or change any key. Pinned by `src/schedule/system/manager.test.ts` › `persists distinct keys for repeated names and cancels all name matches or one key`.
2. Startup recovery reports overdue active entries as missed, removes missed one-shots, and advances missed recurring entries past the cutoff (user answer: "Core set"). Skipping paused entries must not stop an active entry from being reported, removed, or advanced. Pinned by `src/schedule/system/boot-recovery.test.ts` › `treats the exact cutoff as missed, removes one-shots, and advances recurrence beyond it`.
3. Recovery skips repeated missed interval occurrences in one pass (user answer: "Core set"). Moving the advance loop into `nextFutureRun` must not change the recovered `nextRun`. Pinned by `src/schedule/system/boot-recovery.test.ts` › `skips repeated missed interval occurrences in one recovery`.
4. A due active entry is saved before its runscript batch is appended (user answer: "Core set"). The pause check must not reorder the save and the append for an active entry. Pinned by `src/schedule/system/manager.test.ts` › `saves a due firing before appending its contiguous script batch`.
5. Same-named due entries fire independently by key (user answer: "Core set"). Pausing one same-named row must not stop another active row with that name from firing. Pinned by `src/schedule/system/manager.test.ts` › `fires same-named due entries independently by key and persists each outcome`.
6. A failed boot-recovery save keeps due entries in memory and the persisted snapshot unchanged (user answer: "Core set"). The version change must not let boot recovery fire or overwrite the store after that failure. Pinned by `src/schedule/system/manager.test.ts` › `keeps due entries and the persisted snapshot when boot recovery cannot save`.
7. A newer unsupported store version is reported distinctly, is never rewritten, and blocks saving (user answer: "Core set"). Accepting version 2 must not make the decoder accept any higher version, and must not let a version-3 file be overwritten. Pinned by `src/schedule/system/store-decode.test.ts` › `distinguishes unsupported schema versions`. That test, the `unsupported version` case of `src/schedule/system/manager.test.ts` › `ignores %s without rewriting it or accepting new schedules`, and the unsupported-version block of `src/schedule/system/storage.integration.test.ts` all use version 2 as their "newer" sample today. Each one moves to version 3 in step 1, and nothing else in those assertions changes.
8. `schedule system list`, `cancel`, and `clear` keep their exact messages for active entries (user answer: "Core set"). The new verbs must not change those lines. Pinned by `src/commands/schedule.test.ts` › `lists, cancels every same-named system entry, and clears with exact messages`.
9. Tab-owned `schedule` grammar and its messages stay as they are (user answer: "Core set"). The new system verbs must not change tab `list`, `cancel`, or `clear`. Pinned by `src/commands/schedule.test.ts` › `lists, cancels and clears in the target tab`.
10. `system` stays reserved as the leading tab timer name while `in system` remains a tab target (user answer: "Core set"). The new reserved verbs must not change that. Pinned by `src/schedule/index.test.ts` › ``reserves the leading system timer name while keeping `in system` as a tab target``.
11. Schedules tab intents keep mapping to their topic actions (user answer: "Core set"). Adding `pause` and `resume` must not change what `cancel`, `clear`, or `focus-owner` send. Pinned by `src/plugins/schedules/activate.test.ts` › `turns each intent into the topic action it names`.
12. Deleting a system row from the tab confirms first and then cancels by key (user answer: "Core set"). The new icon must not open the delete dialog or send `cancel`. Pinned by `web/src/plugins/schedules/SchedulesTab.test.tsx` › `confirms a system row by its key`.
13. Pressing a row icon does not move the selection (user answer: "Act immediately"). The new icon must not change the selection either. Pinned by `web/src/plugins/schedules/SchedulesTab.test.tsx` › `does not move the selection when the icon is pressed`.
14. Enter and a row double-click focus the owning tab (user answer: "Core set"). The new `Space` and `p` keys must not focus an owner, and Enter must not pause. Pinned by `web/src/plugins/schedules/SchedulesTab.test.tsx` › `focuses the owning tab on a double click and on Enter`.

## Assumptions

1. System schedule entries are the shared entry shape plus a key and a runscript name: `src/schedule/system/types.ts:3` `export type SystemScheduleEntry = ScheduleEntry & { key: string; script: string };`.
2. The store decoder checks required fields and ignores extra ones, so a `paused` field would pass a version-1 decode unless the decoder is changed: `src/schedule/system/store-decode.ts:6` `function validEntry(value: unknown): value is SystemScheduleEntry {`.
3. Startup recovery advances a missed recurring entry until it is past the cutoff: `src/schedule/system/boot-recovery.ts:14` `while (nextRun <= cutoff) nextRun = computeNextRun(entry, new Date(nextRun));`.
4. A tick claims a due entry, awaits the shell, and then commits from the claimed copy: `src/schedule/system/manager.ts:105` `private applyFireOutcome(`.
5. The aggregated view orders all rows by raw `nextRun`: `src/schedule/views.ts:33` `.toSorted((a, b) => a.entry.nextRun - b.entry.nextRun)`.
6. Any version other than 1 is unsupported today: `src/schedule/system/store-decode.ts:18` `if (value.version !== 1) return { ok: false, kind: 'unsupported-version', version: value.version as number };`.
7. The client registry pins the schedules plugin's schema version as a literal: `web/src/plugins/registry.tsx:104` `schedules: clientPlugin(2, clientPluginLoaders.schedules),`.
8. The manager writes the snapshot version as a literal in one place: `src/schedule/system/manager.ts:137` `const result = this.store.save({ version: 1, entries } satisfies SystemScheduleSnapshot);`.
9. A missing store file loads as an empty snapshot with a literal version: `src/schedule/system/store.ts:48` `if (!pathExists(this.file)) return { ok: true, snapshot: { version: 1, entries: [] } };`.
10. The snapshot type allows only version 1 today: `src/schedule/system/types.ts:5` `export type SystemScheduleSnapshot = { version: 1; entries: SystemScheduleEntry[] };`.

## Existing functionality

1. Every system schedule mutation saves the full snapshot before swapping memory and publishing: `src/schedule/system/manager.ts:129` `private commit(entries: SystemScheduleEntry[]): boolean {`.
2. A per-key mutation already exists to model pause and resume on: `src/schedule/system/manager.ts:67` `cancelByKey(key: string): SystemScheduleResult {`.
3. Next-occurrence math for interval, daily, and weekday recurrences: `src/schedule/time.ts:26` `export function computeNextRun(entry: ScheduleEntry, now: Date): number {`.
4. The firing loop skips entries that are not yet due: `src/schedule/system/manager.ts:91` `if (claimed.nextRun > now) continue;`.
5. The Schedules plugin declares its row intents in one table: `src/plugins/schedules/activate.ts:67` `cancel: {`.
6. A system-row cancel is authorized against the current aggregated view and applied by key: `src/plugins/schedule-topic-actions.ts:35` `function cancelSystemSchedule(managers: Managers, key: string, id: string): string | undefined {`.
7. The topic action union carries a system-row action addressed by key: `src/plugins/api-topics.ts:106` `| { topic: 'schedules'; action: 'cancel'; tab: 'system'; id: string; owner: 'system'; key: string }`.
8. Each row already ends in an icon button that acts on that row without changing the selection: `web/src/plugins/schedules/SchedulesRows.tsx:47` `className="schedules-row-delete"`.
9. Startup captures one cutoff and loads system schedules against it: `src/index.ts:72` `controller.managers.systemSchedule.load(bootCutoff);`.
10. The system grammar reserves its management verbs in one branch: `src/schedule/index.ts:64` `if (action === 'list' && second === undefined) return { scope: 'system', action: 'list' };`.
11. System schedule completion takes its name lists from one options object: `src/completion/system-schedule.ts:4` `export type SystemScheduleCompletions = { names: string[]; scripts: string[] };`.
12. The system list line is formatted in one place: `src/commands/schedule.ts:73` `` `${entry.id}  ${entry.spec}  (next: ${fmtNextRun(entry.nextRun)})  script ${entry.script}` ``.
13. A row button that acts on the first click of a double-click only: `web/src/plugins/scripts/ScriptRowActions.tsx:30` `if (action !== 'delete' && event.detail > 1) return;`.
14. System-row topic action authorization is already tested with a live key and a stale one: `src/plugins/topics.test.ts:415` `topic: 'schedules', action: 'cancel', tab: 'system', id: 'build', owner: 'system', key: 'stale',`.

## Implementation steps

Each step ends green under `$janissary/scripts/run.mjs check-diff`.

1. **Pause state in the owner and the store.** Add the optional `paused` field to `SystemScheduleEntry` in `src/schedule/system/types.ts` and widen `SystemScheduleSnapshot` to version 1 or 2 (Assumption 10). In `store-decode.ts`, accept versions 1 and 2, refuse `paused` in a version-1 entry, require it to be `true` and the entry to be recurring when present in a version-2 entry, and keep reporting anything higher as unsupported. The decoded snapshot keeps the version it was read with. The manager's private `save` passes version 2 (Assumption 8). A missing store file keeps loading as the empty version-1 snapshot it returns today (Assumption 9). Existing test assertions that expect `version: 1` from a load after the manager has saved, in `src/schedule/system/manager.test.ts`, `src/schedule/system/storage.integration.test.ts`, and `src/commands/schedule.test.ts`, change that literal to 2 and nothing else. The "newer version" samples move from 2 to 3 (Preserved behavior 7). Add `nextFutureRun` to `src/schedule/time.ts`, and have `recoverSystemSchedules` call it and pass paused entries through untouched, never listing them as missed. Add the four pure edits to `mutations.ts`: pause and resume by key, and pause and resume by name. Pause touches only recurring active entries, and resume clears the flag and sets `nextRun` from `nextFutureRun`. Add `pauseByKey`, `resumeByKey`, `pauseByName`, and `resumeByName` to `SystemScheduleManager`. Each returns the existing `SystemScheduleResult`, skips the save when nothing changed, and reports `could not save system schedules` on a failed save. Make `fireDue` skip paused entries, and make `applyFireOutcome` return without committing or enqueuing when the current entry is paused. If `manager.ts` would pass 200 lines, extract the fire-outcome logic into a new module beside it rather than compacting. Build command: `$janissary/scripts/run.mjs check-diff`.

2. **Command grammar, output, and completion.** Add `pause` and `resume` system variants to `ScheduleParseResult` in `src/schedule/types.ts`. Parse them in `parseSystemSchedule` in the same branch as `cancel`, so they are reserved. Update `SYSTEM_SCHEDULE_USAGE` in `src/schedule/usage.ts` to the exact line in Requirement 31. In `runSystemSchedule` in `src/commands/schedule.ts`, run the new verbs with the messages in Requirements 21 to 26, and print `(paused)` in the list line. As the `cancel` branch does, each verb first counts matches from `owner.list()`: recurring entries with that name for `pause`, and paused entries with that name for `resume`. A zero count prints the not-found line without calling the owner. Widen `SystemScheduleCompletions` with the active recurring and paused name lists, offer `pause` and `resume` at the verb slot, and fill the two lists in `src/controller/completion.ts`. If `src/commands/schedule.ts` would pass 200 lines, move the system branch into its own module under `src/commands/`. Build command: `$janissary/scripts/run.mjs check-diff`.

3. **Wire, plugin server, and topic actions.** Add the optional `paused: true` to the system branch of `AggregatedScheduleView` in `src/protocol/schedule.ts`, and to the system branch of `ScheduleRow` in `src/plugins/schedules/shared.ts`, keeping `shared.test.ts`'s shape pin passing. `aggregatedScheduleView` in `src/schedule/views.ts` copies the flag and sets `next` to `paused` for a paused entry. Add one guard, `isSystemRowIntent`, to `shared.ts`. It accepts only the system identity `{ tab: 'system', owner: 'system', key, id }`, and both the `pause` and `resume` intents use it, since they carry the same payload. Also update `isScheduleRow` to accept `paused` only on system rows. Raise `SCHEDULES_PAYLOAD_SCHEMA_VERSION` to 3, along with the literal in `web/src/plugins/registry.tsx`. Add `pause` and `resume` actions to the `schedules` topic union in `src/plugins/api-topics.ts`. In `src/plugins/schedule-topic-actions.ts`, authorize each against a recurring system row with that key and id in the current aggregated view, then call `pauseByKey` or `resumeByKey`, returning the save error when it fails. Add `pause` and `resume` entries to the intent table in `src/plugins/schedules/activate.ts`, carrying the error to `rejectRequest` as `cancel` does, and copy `paused` in `toPayload`. Build command: `$janissary/scripts/run.mjs check-diff`.

4. **Schedules tab control and keys.** In `SchedulesRows.tsx`, give recurring system rows a Pause/Resume icon button immediately before the trash button, and other rows an empty cell in that position. The button sends the intent through a new `onTogglePause(entry)` prop and follows UI design 3 to 17. It ignores a click whose `event.detail` is above 1, as `ScriptRowActions` does (Existing functionality 13), and stops both its click and its double-click from reaching the row's handlers. In `SchedulesTab.tsx`, handle `Space` and `p` on the selected row, send `pause` or `resume` with the system identity, and return focus to the list container after an icon press. Gate that branch on `e.target === e.currentTarget` so keys aimed at a focused button are left to the button. Add the `paused` row class and the extra grid column to `schedules.css`, for both renderings, and replace the two identical icon-button declaration blocks with one shared `.schedules-row-icon-button` rule that the pause and trash buttons both use. Build command: `$janissary/scripts/run.mjs check-diff`.

5. **Spec and in-app help.** Update `product/specs/scheduling.md` in the Durable system schedules and runscripts, System schedule firing, Scheduling tab, and `schedule` command sections to describe Requirements 1 to 45. That includes changing "a versioned snapshot" to say this build writes version 2 and reads versions 1 and 2. Extend the two "Scheduled-command actions" and "Bundled schedules plugin" passages of `product/specs/tab-plugins.md` to name all five schedules actions, the current-view authorization and failed-save domain-error rule, the per-owner clear, and the optional `paused: true` wire field whose next run reads `paused`. Add the Schedules tab controls table to `help/keys.md`, and add the two verbs, the reserved-word note, and one example per verb to `help/schedule.md`. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. The feature extends the Schedules tab plugin (`web/src/plugins/schedules/SchedulesTab.tsx`, `SchedulesRows.tsx`), whose System Schedules section lists system rows above Tab Schedules in both the full and docked renderings.
2. The closest existing control is the per-row trash button (`schedules-row-delete`), which opens `DeleteScheduleDialog` and does not change the selection.
3. A recurring system row carries a Pause/Resume icon button immediately before its trash button, in both the full and docked renderings. It shows `faPause` while the row is active and `faPlay` while it is paused, and it is styled like the trash button (user answer: "Icon before trash").
4. One-shot system rows and tab rows render an empty cell in that position, so the grid columns stay aligned (user answer: "Icon before trash").
5. A paused row's Next Run cell reads `paused` in both renderings. The docked rendering shows the word whole rather than its time-of-day split (user answer: "`paused`, stale order").
6. A paused row keeps sorting by its stored next-run time inside the System Schedules section, so it can sit among active rows (user answer: "`paused`, stale order").
7. A paused row carries a `paused` class that draws its text in `var(--muted)` instead of the recurring accent color. Its selection and hover backgrounds are unchanged (user answer: "Muted text").
8. Pressing the Pause or Resume icon sends the `pause` or `resume` intent at once, with no dialog (user answer: "Act immediately").
9. Pressing the icon does not change the selection, like the trash icon (user answer: "Act immediately").
10. After the icon is pressed, focus returns to the list container so arrow keys keep working (user answer: "Act immediately").
11. The row updates in place on the next `schedules` topic delivery, and the client keeps no local pause state (user answer: "Act immediately"; `ai/guidelines/architecture-principles.md` §1).
12. While the list has focus, `Space` or `p` on a selected recurring system row pauses it when active and resumes it when paused, matching the asciicast tab's play/pause keys in `help/keys.md` (user answer: "Space or p toggles"). The keys count only without Cmd, Ctrl, or Alt held. The handler prevents `Space`'s default page scroll, as the existing arrow handling does. The keys are handled only by the focused list, so they don't collide with any global binding.
13. `Space` and `p` do nothing on a selected one-shot system row or a tab row, or when no row is selected (user answer: "Space or p toggles"; "Recurring system only").
14. `help/keys.md` gains a Schedules tab controls table listing the list's keys: arrows, Home/End, Enter, Backspace/Delete, and `Space` or `p` (user answer: "Space or p toggles").
15. The icon's `aria-label` and `title` both read `Pause schedule <id>` while the row is active and `Resume schedule <id>` while it is paused. The label switches with the icon, and the button carries no `aria-pressed` (user answer: "Label + tooltip").
16. A Pause or Resume that fails to save leaves the row as it was, with its icon and Next Run unchanged, and shows nothing else, matching a failed Delete today (user answer: "Silent, like Delete").
17. A double-click on the Pause/Resume icon counts as one press. The second click is ignored, and the row's double-click (switch to owner) does not fire, matching the Scripts tab's Run and + buttons (user answer: "One press only").
18. Both renderings' grids gain one column for the icon. Long ids, owners, and commands keep truncating with an ellipsis as today (existing `schedules.css` rules).
19. The empty state (`No scheduled commands.`) and the section titles are unchanged.
20. Client code stays inside `web/src/plugins/schedules/`. The one rule both the icon and the keys need, whether a row can be paused (a recurring system row), is a pure predicate added to `schedules-keys.ts`. Both `SchedulesRows.tsx` and the key handler in `SchedulesTab.tsx` call it, so the rule stays out of JSX (`ai/guidelines/react-code-organization.md` §5).
21. The Space/p branch acts only when the event target is the list container itself, so a key that belongs to a focused button is not consumed by the list: Space on New schedule opens the dialog, and Space on another row's pause button toggles that button's own row.
22. The pause button and the trash button share a single `.schedules-row-icon-button` rule for their icon-button declarations. Each keeps its own class alongside the shared one, and no second copy of the declaration block remains.

## Tests

- `src/schedule/system/store-decode.test.ts`: version-2 snapshots with and without `paused` decode; `paused` in a version-1 entry is invalid; `paused: false` in a version-2 entry is invalid; a paused one-shot in a version-2 entry is invalid; version 3 is unsupported (Requirements 14 to 18).
- `src/schedule/system/boot-recovery.test.ts`: an overdue paused entry is neither missed, advanced, nor removed, while an overdue active entry beside it still is (Requirements 6, 7).
- `src/schedule/index.test.ts`, beside the existing `computeNextRun` tests (there is no `time.test.ts`): `nextFutureRun` returns the first occurrence strictly after `now` for interval, daily, and weekday entries whose stored `nextRun` is far in the past (Requirements 8, 9).
- `src/schedule/system/manager.test.ts`: `pauseByKey` keeps every other field and saves version 2; a paused due entry doesn't fire on tick; a pause committed during deferred shell preparation stops the enqueue and leaves the entry paused; `resumeByKey` sets a future `nextRun` and fires nothing for the gap; pausing an already-paused entry doesn't call save; a failed save leaves memory unchanged; a one-shot isn't paused; paused state survives a reload of the same store (Requirements 1 to 5, 8, 9, 11, 12, 26).
- `src/schedule/index.test.ts`: `schedule system pause <name>` and `resume <name>` parse; any other shape after `pause` or `resume` returns the system usage line (Requirements 28, 29, 31).
- `src/commands/schedule.test.ts`: exact pause and resume messages, including the idempotent and not-found lines; `(paused)` in `schedule system list`; cancel-by-name and clear remove paused rows; a pre-existing entry named `pause` can still be cancelled; a failed save prints only `Could not save system schedules.` (Requirements 19 to 27, 30, 32, 33).
- `src/commands/execute.test.ts`: a runscript whose only schedule is paused still runs immediately (Requirement 34).
- `src/completion/index.test.ts`: `pause` and `resume` appear at the verb slot; names after each are state-aware (Requirements 35 to 37).
- `src/schedule/views.test.ts`: a paused system row carries `paused: true` and `next: 'paused'` and keeps its stored-time position (Requirement 38; UI design 5, 6).
- `src/plugins/schedules/shared.test.ts`: the row shape pin still matches; `paused` is accepted only on system rows; `isSystemRowIntent` accepts only the system identity.
- `src/plugins/schedules/activate.test.ts`: `pause` and `resume` intents turn into their topic actions; a save error becomes a rejection (Requirements 38, 39, 41).
- `src/plugins/topics.test.ts`, beside the system `cancel` authorization cases that use `key: 'key-a'` and `key: 'stale'`: pause and resume by a known key change the row; a stale key, or the key of a one-shot row, changes nothing; a save error comes back through `topicAction` (Requirements 38 to 41, 43).
- `src/schedule/system/runscript-rows.test.ts`: a paused schedule still counts toward its runscript (Requirement 45).
- `web/src/plugins/schedules/SchedulesTab.test.tsx`: the icon appears only on recurring system rows in both renderings, with the right icon, label, and title; pressing it sends the matching intent without moving the selection or opening the delete dialog; a double-click sends one intent and doesn't focus the owner; `Space` and `p` toggle a selected recurring system row and do nothing elsewhere; a paused row shows `paused` and the `paused` class (Requirements 38 to 40; UI design 3 to 17).
- `web/src/plugins/schedules/schedules-keys.test.ts`: the pausable-row predicate is true only for recurring system rows (Requirement 40; UI design 13, 20).
- `src/schedule/system/manager.test.ts`: by-name positive paths commit real changes — `pauseByName pauses every same-id recurring entry and leaves other ids untouched` keeps every other field and the one-shot intact and persists version 2, and `resumeByName clears the paused flag, sets a future nextRun, and saves the resumed entry` bounds the future time to one interval and persists a matching snapshot; the existing no-op and no-save tests stay byte-for-byte (Requirements 1 to 5, 8, 9, 12).
- `src/completion/index.test.ts`: the remaining `systemSchedule` option fixtures in the runscript-completion and disabled-command-guard suites carry all four contract fields (`names`, `scripts`, `activeRecurringNames`, `pausedNames`), with the two new lists empty where pause/resume names are not under test, while the system grammar suite pins the state-aware lists (Requirements 35 to 37).
- `web/src/plugins/schedules/SchedulesTab.test.tsx`: Space on the focused New schedule button opens the dialog with no pause or resume intent, and Space on a second recurring row's pause button sends that row's intent and never the selected row's (Requirement 43a; UI design 21).
- `web/src/plugins/schedules/schedules-style.test.ts`: the single `.schedules-row-icon-button` rule pins all eight icon-button declarations, neither `.schedules-row-delete` nor `.schedules-row-pause` still has its own declaration block, and the grid-column and muted paused-row assertions keep passing (UI design 22).

## Out of scope

- One-shot system schedules cannot be paused. They show no Pause control, and `schedule system pause <name>` skips them (user answer: "Recurring system only").
- Tab-owned timers, recurring or not, cannot be paused (user answer: "Recurring system only").
- Pausing doesn't remove or cancel runscript lines already queued in the system shell (user answer: "Let them run").
- No notifications-feed notice for pause or resume (user answer: "No notice").
- No `pause until <time>` auto-resume, no pause reason or note, no pause-all or resume-all control, and no pause option in the New schedule dialog (user answer: "All out").
- The Scripts tab is unchanged. Paused schedules count there like active ones (user answer: "Count paused too").
- No confirmation dialog for pause or resume (user answer: "Act immediately").
- Paused rows are not re-sorted to the end of their section (user answer: "`paused`, stale order").
- No migration tool for an older Janissary: once this version saves a version-2 store, an older process reports it as unsupported and loads no system schedules from it (user answer: "Always v2").

## Verification

1. `$janissary/scripts/run.mjs check-diff`.
2. End to end in the running app, from a project with a runscript `.janissary/scripts/ping.rs` containing `echo ping`:
   1. Type `schedule system ping every 1m script ping`, then `schedules`. The System Schedules section shows `ping` with a pause icon before its trash icon, and the icon's tooltip reads `Pause schedule ping`.
   2. Press the pause icon. The row turns muted, Next Run reads `paused`, the icon becomes a play icon with tooltip `Resume schedule ping`, and the selection doesn't move. `.janissary/system-schedules.json` shows `"version": 2` and `"paused": true` on that entry.
   3. Wait two minutes. No `System schedule ping ran: script ping` notice appears and the system shell gets no `echo ping` line. A notice or a line means pausing failed.
   4. Quit and relaunch the app after the stored next-run time has passed. No `missed its run` notice appears for `ping`, and the row still reads `paused`.
   5. Select the row and press `Space`. The row returns to the accent color and Next Run shows a time about one minute ahead, not a time in the past. No firing happens straight away. An immediate firing means resume ran the backlog.
   6. Type `schedule system pause ping`, then `schedule system list`. They print `Paused ping in system.` and then `ping  every 1m  (paused)  script ping`. Type `schedule system resume nosuch`, which prints `No paused scheduled command "nosuch" in system.`.
    7. With a recurring row selected, Tab to the New schedule button and press Space: the dialog opens and the selected row's pause state is unchanged. Tab to a different recurring row's pause button and press Space: that row toggles and the selected row does not.
    8. Open the in-app `schedule` help and confirm it lists both new verbs beside cancel and clear, notes they are reserved after `schedule system`, and shows the exact `Paused nightly in system.` and `Resumed nightly in system.` replies; open `keys` help and confirm the Schedules tab table includes `Space` or `p`.
