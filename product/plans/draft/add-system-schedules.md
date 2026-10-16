# add system schedules

**Complexity: 8/10** — a new project-level owner, a new command-only view kind, a persisted schedule file, a server-side queue drain, two new commands (`execute`, `tab focus`), and protocol changes on the schedules tab and the creation dialog.

Today every scheduled command belongs to a tab. The entry lives in `ScheduleManager` (`src/schedule/manager.ts`), keyed by the tab's label, and it ends when that tab closes. No launch brings it back, `--relaunch` included (`product/specs/scheduling.md`). This feature adds schedules that belong to the project instead. They fire whether or not any tab is open, they survive application restarts, and each one runs a list of commands kept in a file. The goal is to let a user set up future or recurring work, such as "open a harness tab at 9am and tell it to run the morning checks", once and leave it. Each firing leaves a notification that says what happened.

## Design decisions

Every point below comes from the feature text, from behavior the code already has, or from a user answer.

**Ownership and storage**

- A system schedule belongs to the project. No tab holds it, and closing a tab does not touch it.
- Entries are kept in one file, `.janissary/system-schedules.json`. The file carries a schema version, is read at boot before the firing loop starts, and is rewritten atomically on each change. The launch clear skips it, and it is never committed, because a committed schedule would fire commands on a teammate's machine.

**Runscripts**

- A runscript is a plain-text file in `.janissary/scripts/` with the extension `.rs`. It holds one command per line. Blank lines and lines starting with `#` are skipped.
- Names are dasherized (lowercase words joined by hyphens), the same style profile file names use. The `.rs` extension is implied, so `morning-checks` refers to `.janissary/scripts/morning-checks.rs`.
- The runscript is read each time its schedule fires. An edit applies from the next firing. Nothing is copied into the schedule file.
- Every system schedule runs a runscript, including one with a single line. A bare command is not accepted.
- `edit <name>` opens a file that exists under that exact name in the project, as the `edit` command does today. If no such file exists, `edit <name>` opens `.janissary/scripts/<name>.rs`. If no runscript of that name exists, `edit` refuses with a message and creates nothing.
- `execute <name>` runs a runscript now, outside any schedule.

**Creating and managing**

- The typed form is `schedule NAME system <form> script <name>`. The five schedule forms all apply. `system` takes the slot that `in <tab>` takes for tabs, and `in <tab>` keeps its tab meaning.
- Creating a schedule that names a runscript that does not exist is refused, and the message names the file.
- `schedule list system`, `schedule cancel <name> system`, and `schedule clear system` manage system entries. Cancelling by name removes every system entry with that name.
- System schedule names may repeat. Tab schedule names stay unique within their tab.
- The schedules tab's **Clear all schedules** button removes system schedules along with tab schedules. It deletes no runscript files.
- Profile `schedule` lines are per tab, so a line that carries the `system` clause is reported and skipped, the same way a profile line with an `in <tab>` clause is reported and skipped today (`product/specs/profiles.md`, Malformed profiles and Profile-level tabs). System schedules are not captured by `profile save`.
- Tab completion offers `system` after a schedule name, offers `script` after `system <form>`, and completes runscript names after `script`. The existing target completion (`completeScheduleTarget`, `src/completion/target-handlers.ts`) is the pattern.
- System schedules may use recurring forms with a harness launch. Tab schedules keep the existing rule that recurring harness spawns are out of scope, so `product/specs/scheduling.md` is unchanged for tab schedules.

**Firing and running**

- A firing puts the runscript's lines into the command queue of a hidden tab named `system`. Lines run in order. A firing that arrives while the queue still holds lines from an earlier run appends its lines behind them. Nothing is dropped.
- The server drains that queue. It takes the front line, runs it through the command path, waits for its result, and only then takes the next line. The web client does not drain it, so a firing needs no open window.
- System schedules fire only while the app is running. Closing the last window quits the app, as `product/specs/cli.md` describes, so no schedule fires while the app is closed. A firing that came due in that time is reported as missed on the next launch, under the rule below.
- A line fails only when no command claims it, so the dispatcher answers `dispatched: false`. Usage messages, refusals such as `No tab named "<label>".`, and other output text do not count as failures, and the run continues past them. When a line fails, the rest of that run's queued lines are removed, and one notice names the failed line. Lines from other runs stay queued.
- A runscript that has been deleted after its schedule was created fails at firing with a notice that names the file. A one-shot entry is removed. A recurring entry keeps its schedule and tries again at its next time.
- A firing that came due while the app was closed does not run. A notice reports it as missed. A one-shot entry is removed once reported. A recurring entry moves to its next future time and keeps running.
- A command run by a system schedule can act on an existing tab, by `in <tab>` or by label, the same as a command typed in another tab.
- `execute <name>` follows the same rules as a firing.

**The `system` tab**

- The `system` tab is a real tab record that the app creates on first need. It is hidden from the tab strip by default. Its view kind is new, called `system` here, and is command-only: it has no terminal and no command bar, and it does own a command queue.
- The label `system` is reserved. Launching or renaming a user tab to `system` is refused.
- A new command, `tab focus <tabname>`, focuses an open tab by its label or display alias, using the same lookup as other tab references. `tab focus system` reveals the hidden tab. A revealed tab stays in the strip until it is closed, and it is hidden again after a relaunch because it is not persisted.
- The tab's transcript shows each command it executed. Command output does not go into the transcript. It appears as notification lines, along with firings and errors.

**Notifications**

- Every firing, missed firing, and failed line posts an explicit notification. All three share one config toggle, `system-schedule-fire`, which is on by default. Explicit events bypass focus suppression (`product/specs/notifications.md`).
- Firing wording: `System schedule <name> ran: <command>`. Missed wording: `System schedule <name> missed its run at <time>; not run (app was closed).`
- Failed-line wording: `System schedule <name> failed at line <n> (<command>): no command runs it. Remaining lines skipped.` Missing-file wording: `System schedule <name> could not run: script "<file>" is missing.`

**Wording**

- Missing runscript, from `edit <name>` or `execute <name>`: `No runscript named "<name>".`
- Reserved label: `Cannot use "system": that name is reserved for the system tab.`
- Successful creation: `Scheduled <name> system: <spec> (script <name>).`
- A system schedule typed without the `script` keyword: `Usage: schedule NAME system <form> script <name>`. The tab usage message stays as it is.
- `tab focus <name>` with no match: `No tab named "<label>".` (the existing lookup message).
- `schedule cancel <name> system` with no match: `No scheduled command "<name>" in system.`
- `schedule list system` with no entries: `No scheduled commands in system.`
- `schedule clear system`: `Cleared <n> scheduled commands in system.` Zero entries: `No scheduled commands in system.`

**Harness name clash**

- A system-fired harness launch whose name is already in use does not get refused. The launch takes the name with a numeric postfix `-N`, where N is the smallest number from 2 that is free, and continues. Typed launches and profile launches keep their existing refusal, which is the rule in `product/specs/notifications.md` (`launch-refused`) and `product/specs/profiles.md`.

**Visibility and UI**

- The schedules tab lists system entries alongside tab entries.
- The creation dialog's command field becomes a picker of existing runscripts. The dialog does not create runscripts. The per-tab schedule window does not show system entries.

## What already exists (reuse, don't rebuild)

| Piece | Where | Relevance |
| --- | --- | --- |
| Tab-keyed scheduler and 1-second firing tick | `src/schedule/manager.ts` (`ScheduleManager`) | Fires entries and reschedules recurring ones. Its per-tab keying is what a project-level owner works around. |
| Pure grammar parser and usage text | `src/schedule/index.ts` (`parseScheduleCommand`), `src/schedule/usage.ts` | Parses `schedule NAME [in TAB] <form> COMMAND`. Pure, so the `system` target and the `script <name>` form fit here. |
| `schedule` command definition | `src/commands/schedule.ts` | Resolves `in <tab>` through `resolveTargetTab` and `canRunSchedules`. |
| `edit` command | `src/commands/edit.ts` | Opens any file in the editor and creates it on save. Gains runscript lookup for bare names. |
| Command queue on a tab | `product/specs/command-queue.md`, `src/tab/runtime.ts:4` (`tab.runtime.queue`), `src/tab/types.ts:310` (`hasCommandQueue`), `src/tab/queue.ts` (`pushQueue`, `shiftQueue`), `src/commands/queue.ts` | The server keeps the queue as a plain array, with push and shift helpers. The drain is client-side today (`web/src/shared/command-queue/`), so the server drain for the `system` tab is new code in `src/schedule/system/`. The failure stop is also new: the runner removes the rest of the run. |
| Dispatch of a command into a tab | `src/command/manager.ts` (`dispatchTo`, `dispatch`) | Shell entries run through `dispatchTo(label, "<cmd> ## scheduled ##")`. The nearest existing path for a command without a typed origin. |
| Command-only view tab | `product/specs/notifications.md` (the notifications tab), `product/specs/tabs.md` (view tabs) | A view tab with no command bar and no terminal. The `system` view kind follows this pattern. |
| Aggregated schedules tab | `src/plugins/schedules/`, `ScheduleManager.aggregatedView()`, `src/schedule/views.ts` | Lists every entry soonest-first with a Delete action. Gains an owner kind. |
| Schedule creation dialog | `web/src/ScheduleLaunchDialog/`, `ScheduleManager.scheduleLaunchView()` | Offers eligible tabs as targets. Gains the system target and the runscript picker. |
| Per-tab schedule window | `web/src/shared/status-windows/StatusPanels.tsx`, `web/src/shared/status-windows/useStatusWindows.ts` | Shows only the active tab's entries. Unchanged. |
| `schedule-fire` and `schedule-late` events | `product/specs/notifications.md` | `schedule-fire` is ambient and off by default. `schedule-late` is explicit, always on, and bypasses focus suppression. |
| Project file that survives launches | `.janissary/notifications.json` (`product/specs/notifications.md`), `profiles/` (`product/specs/profiles.md`), `remote-sessions.<account-hash>.json` (`product/specs/state-directory.md`) | `.janissary/notifications.json` is written every run and never read back. The state-directory clear skips files the spec does not name. |
| Atomic file write | `src/atomic-write.ts` (`atomicWriteFile`) | Temp file plus rename. Fits the single-file store. |
| Single running instance per directory | `product/specs/state-directory.md` (`.janissary/lock`) | Only one process writes a project's schedule file at a time. |
| Overdue delivery and "ran late" notice | `product/specs/scheduling.md` (Sleep and overdue commands) | Overdue entries after sleep run once and notify. This feature skips overdue entries after a restart instead. |
| Authored command lists | `product/specs/profiles.md` (`run`, `schedule` fields) | Profile entries accept a list of commands typed once. Runscripts are the file-backed form of that idea. |
| App-owned schedule entry | `product/specs/scheduling.md` (An entry the app adds for itself) | Shows the app can own an entry without a user typing it. |
| Harness launch name clash | `product/specs/notifications.md` (`launch-refused`), `product/specs/profiles.md` (name clashes) | Typed and profile launches still refuse a name in use. The system-fired launch uses the postfix rule instead. |
| Plugin command reservation | `ai/guidelines/plugins-tabs.md` | `schedule` and `schedules` cannot be claimed by a plugin command. The `system` keyword and the `tab` command both live in core command definitions. |
| Agent grammar | `src/agent/command-parser.ts` | `execute` appears there only as a clause word inside `agent`, not as a top-level command. A top-level `execute` does not collide with it. |

Facts that cut against the feature as written: tab schedules are memory-only today, and the state directory is cleared on a normal launch (`product/specs/state-directory.md`), so the system schedule file has to sit where that clear does not reach. `product/specs/scheduling.md` names `src/schedule-manager.ts`, but the code is at `src/schedule/manager.ts`. The spec path is stale and this plan does not rely on it. No top-level `tab` command exists today, so `tab focus` is new.

Conflict with the backlog: `product/backlog/features.md` has a deferred item to run a missed tab firing on reopen. This feature chooses the opposite for system schedules, which skip and notify. The two coexist because the backlog item covers tab schedules only.

## Proposed changes

The project-level schedule is a new owner beside `ScheduleManager`, not a change to how tab schedules fire. Principle 2 of `ai/guidelines/architecture-principles.md` says per-agent state belongs on the tab, and a system schedule has no tab, so the new owner keeps its state outside the per-tab map. That tension is why the feature is high complexity under Step 2b.

The new owner lives under `src/schedule/system/` in two modules. The first is a store that loads and saves `.janissary/system-schedules.json` with the schema version and atomic writes, and that also holds the pure parser for runscript text. The second is an owner that holds the entries, fires them, drains the `system` tab's queue, and detects overdue entries at boot. The drain stays in the owner rather than getting its own module, and the owner is split only if a file passes the 200-line limit. `ScheduleManager` gains a hook that hands due system entries to that owner, and the tick in `src/schedule/manager.ts` stays the single 1-second loop.

The command side adds the `system` target and the `script <name>` form to `parseScheduleCommand` in `src/schedule/index.ts`, and the management forms to `src/commands/schedule.ts`. It adds `execute` as a new command file under `src/commands/`, adds runscript lookup to `src/commands/edit.ts`, and adds `tab focus` as a new command file under `src/commands/`. Each command has one definition in `src/commands/<name>.ts` and one entry in the registry, per principle 5.

The `system` tab is a real tab record created on first need and kept out of the strip while hidden. Its view kind is new and command-only. It sets `hasCommandQueue` (`src/tab/types.ts:310`), and `tab focus` reveals it. The new kind joins the `view` union at `src/tab/types.ts:316` and the wire contract in `src/protocol/tab.ts`, which the client imports through `@shared/protocol`. The label `system` is reserved in the unique-label logic (`src/tab/unique-labels.ts`) and in rename (`src/tab/rename.ts`).

The server drain is a small runner in `src/schedule/system/`. It takes the front line from the `system` tab's queue, sends it through `dispatchLineWithOutput` in `src/command/manager.ts` (line 60, the awaited, output-capturing dispatch that already exists), and waits for the result. A line the dispatcher does not claim (`dispatched: false`) stops the run: the runner removes that run's remaining lines and posts the failed-line notice. Output text is not inspected. The queue array stays as the storage, with `pushQueue` and `shiftQueue` from `src/tab/queue.ts`.

The protocol change for the schedules tab adds an owner kind, tab or system, to the aggregated schedule row in `src/schedule/views.ts` and to its wire type. The dialog gets a runscript picker, and the schedules tab shows the owner kind.

The notification side adds the three explicit notices under the `system-schedule-fire` toggle, reusing the notification queue in `src/notifications/`.

The Delete action on a system row in the schedules tab must reach the system owner, not `ScheduleManager.cancel`. That means the `cancel` intent in `src/plugins/schedules/activate.ts` and the host side of the `topicAction` capability (wired in `src/plugins/context.ts`, handled in `src/plugins/topics.ts`) both need a branch for the owner kind. `ScheduleManager.clearAll` (`src/schedule/manager.ts`) and the **Clear all schedules** topic action clear system entries through the same owner.

The system owner is a manager registered in `Managers` (`src/managers.ts`), constructed in `createManagers` (`src/controller/create-managers.ts`), and given a `dispose()` in `MANAGER_DISPOSE_ORDER` (`src/managers.ts`). `dispose()` stops the drain and flushes any pending store write, so the shutdown path has one matching release for each acquire.

Specs changed in the same change: `product/specs/scheduling.md` (system target, `script` form, management, firing, clear-all, dialog picker, and the harness-spawn rule's tab-only scope), `product/specs/notifications.md` (the `system-schedule-fire` toggle, the three notices, and the event list), `product/specs/tabs.md` (the `system` view kind, the hidden tab, and `tab focus`), `product/specs/state-directory.md` (the schedule file and the scripts folder, both kept by the launch clear), and `product/specs/command-queue.md` (the server drain for the `system` tab). A new `product/specs/system-schedules.md` is not needed unless the implementer finds the scheduling spec too crowded.

## Tests

Colocated with each module. The parser tests in `src/schedule/index.test.ts` cover the `system` target, the `script <name>` form, a bare command rejection, and the management forms. The store tests cover a round trip, a missing file, a corrupt file, the schema version, and atomic write. The owner tests cover firing, one-shot removal, recurring reschedule, the missed-firing path at boot, the deleted-script path, the failed-line stop that clears the rest of the run, and an overlapping run appended behind an earlier one. The runscript reader tests cover blank lines, `#` comments, dasherized names, the implied `.rs` extension, and a file edited between firings. The `edit` tests in `src/commands/edit.test.ts` cover the lookup order and the refusal for a missing runscript. The `tab focus` tests cover focusing by label and alias, the missing-tab message, and reveal. The reserved-label tests cover launch and rename refusals. The harness clash test covers the `-#` postfix for system firings and the unchanged refusal for typed launches. The notification tests cover the wording and the shared toggle.

## Out of scope

- Running a missed firing of a system schedule after a restart. The answer is skip and notify.
- Replaying every missed occurrence of a recurring system schedule.
- A terminal UI creation dialog. The dialog is web-only, as the New schedule dialog section of `product/specs/scheduling.md` states.
- Firing while the app is not running. The app quits when its last window closes, and that is unchanged.
- Changing the grammar or firing behavior of tab-owned schedules, including the recurring harness rule.
- Editing an existing schedule entry in place. Changes go through cancel and create.
- Showing system entries in the per-tab schedule window.
- Creating runscripts from the dialog. `edit <name>` creates them.
- Non-dasherized runscript names.
- Changing the typed-launch refusal for a harness name in use.

## Verification

Run `./scripts/run.mjs check-diff`. Manual check: write a runscript named `morning-checks` with a comment and two commands, create `schedule morning system at 9am script morning-checks`, and confirm it appears in the schedules tab with the right next-run time. Quit the app, relaunch, and confirm the entry is still there. Confirm a firing posts the `System schedule morning ran` notice and that both commands ran. Run `tab focus system` and confirm the hidden tab appears with its transcript. Confirm a schedule naming a missing script is refused with the file's name, and that `execute morning-checks` runs the script now.
