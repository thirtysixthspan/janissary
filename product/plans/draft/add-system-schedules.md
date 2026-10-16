# add system schedules

**Complexity: 6/10** — a new project-level owner, a persisted schedule file, a hidden shell tab that the strip and navigation must skip and the client must still drain, a headless mount for that tab's queue consumer, and new commands (`execute`, `tab focus`) with protocol changes on the schedules tab and the creation dialog.

Today every scheduled command belongs to a tab. The entry lives in `ScheduleManager` (`src/schedule/manager.ts`), keyed by the tab's label, and it ends when that tab closes. No launch brings it back, `--relaunch` included (`product/specs/scheduling.md`). This feature adds schedules that belong to the project instead. They fire while the app runs, they survive application restarts, and each one runs a list of lines kept in a file. Those lines go into a hidden shell tab's command queue, and the client drains that queue the same way it drains any shell tab's queue. A runscript can therefore run shell code as well as janissary commands. Each firing leaves a notification that says what happened.

## Design decisions

Settled by the feature text, existing behavior, or the user's answers.

**Ownership and storage**

- A system schedule belongs to the project. No tab holds it, and closing a tab does not touch it.
- Entries are kept in one file, `.janissary/system-schedules.json`. The file carries a schema version, is read at boot before the firing loop starts, and is rewritten atomically on each change. The launch clear skips it, and it is never committed, because a committed schedule would run commands on a teammate's machine.
- System schedules fire only while the app runs. The server shuts down about a second after its last browser client disconnects (`product/specs/cli.md`), so a window is always connected while the app runs. A firing that came due while the app was closed is reported as missed on the next launch.

**Runscripts**

- A runscript is a plain-text file in `.janissary/scripts/` with the extension `.rs`. It holds one command per line. Blank lines and lines starting with `#` are skipped.
- Each line is one complete command. A multi-line shell construct, such as an `if` block or a `for` loop spread over several lines, is not supported. It can be written on one line.
- Names are dasherized (lowercase words joined by hyphens), the same style profile file names use. The `.rs` extension is implied, so `morning-checks` refers to `.janissary/scripts/morning-checks.rs`.
- The runscript is read each time its schedule fires. An edit applies from the next firing. Nothing is copied into the schedule file.
- Every system schedule runs a runscript, including one with a single line. A bare command is not accepted.
- `edit <name>` opens a file that exists under that exact name in the project, as the `edit` command does today. If no such file exists, `edit <name>` opens `.janissary/scripts/<name>.rs`. If no runscript of that name exists, `edit` refuses with a message and creates nothing.
- `execute <name>` runs a runscript now, outside any schedule.
- A runscript runs with the same authority as a command typed in a shell tab. The system shell has no workspace clone and no sandbox beyond what any shell tab has, so the storage rule above is the boundary: only the user's own project can put lines in the file.

**Creating and managing**

- System schedules live in a `schedule system` subspace. Creation is `schedule system NAME <form> script <name>`, with the five schedule forms, and the management forms are `schedule system list`, `schedule system cancel <name>`, and `schedule system clear`. Tab schedules keep the `schedule NAME [in TAB] <form> COMMAND` grammar, and `in <tab>` keeps its tab meaning.
- Creating a schedule that names a runscript that does not exist is refused, and the message names the file.
- `schedule system cancel <name>` removes every system entry with that name.
- System schedule names may repeat. Tab schedule names stay unique within their tab. `system` directly after `schedule` is the subspace word, so a tab timer cannot be named `system`.
- System schedules may use recurring forms with a harness launch. Tab schedules keep the existing rule that recurring harness spawns are out of scope, so `product/specs/scheduling.md` is unchanged for tab schedules.
- The schedules tab's **Clear all schedules** button removes system schedules along with tab schedules. It deletes no runscript files.
- Profile `schedule` lines are per tab, so a line that starts with the `system` subspace word is reported and skipped, the same way a profile line with an `in <tab>` clause is reported and skipped today (`product/specs/profiles.md`). System schedules are not captured by `profile save`.

**The `system` shell tab**

- The `system` tab is an ordinary shell tab: a zsh shell with no workspace clone, started in the project directory. It is created at every application startup, `--relaunch` included, beside the launch shell `janus`, and it starts hidden. It is not part of any profile, and `profile save` leaves it out, as it already leaves out `janus`. It is not persisted, so each startup creates a new one. Apart from starting hidden, it behaves as a shell tab.
- If the system shell cannot start, the app still launches, a notice reports the failure, and the next firing or `execute` tries again. Unlike the launch shell, its failure does not stop the launch.
- It is hidden by default. A hidden tab is kept out of the tab strip, out of `next` and the tab navigator, and out of the tab list that `nav` shows. Its shell still runs, its queue still drains, and its schedules still fire.
- `tab focus <tabname>` is a new command. It focuses an open tab by label or display alias, using the same lookup as other tab references. `tab focus system` reveals the hidden tab.
- Every path that closes a tab hides the system tab instead: `close` and `exit`, `close <name>`, the tab strip's ×, Cmd+W or Ctrl+W, and the tab's process exiting, for example after the user types `exit` in its shell. The tab leaves the strip, and its shell keeps running. Hiding moves focus the way closing does, to the previously focused tab, or to the nearest tab in the strip. A relaunch hides it again, because it is not persisted.
- A revealed system tab therefore goes back to hidden on its next close. There is no separate command for it.
- The system tab does not count toward the rule that closing the last non-docked tab quits the app (`product/specs/tabs.md`). With only the hidden system tab left, closing the last visible tab quits the app, and the hidden shell goes with it. Its queued lines are not saved and do not survive the quit.
- The label `system` is reserved. Launching or renaming a user tab to `system` is refused.
- Commands typed in the system tab work the way they do in any shell tab. Janissary commands such as `harness`, `send`, and `schedule`, and shell commands such as `cd` and `git`, are both accepted.

**Output, errors, and notifications match a shell tab**

- Output from a line appears in the system tab's terminal and transcript, exactly as it does in any shell tab.
- An error from a line appears in the same place, as the shell or the janissary command prints it. A failing shell command prints its error and the prompt returns. A failing janissary command writes its usual message to the tab's transcript. Neither posts a notification, because a shell tab does not notify for a command error.
- A failing line does not stop the lines after it. The queue keeps draining, as a shell tab's queue does. This replaces the stop-on-error rule from the earlier round of answers, because the user asked that error handling match a shell tab.
- The system tab follows the same ambient notification rules as any hidden shell tab. Its busy-to-idle notice (`state-change`) is off by default, and it is controlled by the same config switch as any other shell tab.
- The notices the system tab itself posts are for schedule events only, listed below. Commands never post a notice of their own.

**Queueing and draining on the client**

- A firing or an `execute` appends the runscript's lines to the system tab's command queue, in order, through the same server-owned queue storage that the `queue` command uses (`Tab.runtime.queue`, `src/tab/queue.ts`).
- The client drains the queue. The system tab's consumer is the shell plugin's queue, the same consumer every shell tab uses (`web/src/plugins/shell/useShellCommandQueue.ts`, `product/specs/command-queue.md`). The consumer takes the front line over the `dequeue` intent, runs it, and waits for the shell to report idle before taking the next.
- A hidden tab is not drawn in the strip, so the client mounts its queue consumer headlessly. The consumer has no visible terminal, only the queue and busy signals. This makes firings depend on a connected window, which the app already requires.
- A shell line that takes over the terminal, such as an editor, holds the queue until it exits. No timeout is set in this version.

**Missed and missing runs**

- A firing that came due while the app was closed does not run. A notice reports it as missed. A one-shot entry is removed once reported. A recurring entry moves to its next future time and keeps running.
- A runscript deleted after its schedule was created fails at firing with a notice that names the file. A one-shot entry is removed. A recurring entry keeps its schedule and tries again at its next time.
- A command run by a system schedule can act on an existing tab, by `in <tab>` or by label, as it can when typed in another tab.

**Notifications**

- Every firing, missed firing, and missing runscript posts an explicit notification. All three share one config toggle, `system-schedule-fire`, which is on by default. Explicit events bypass focus suppression (`product/specs/notifications.md`).
- Firing wording: `System schedule <name> ran: <command>`. Missed wording: `System schedule <name> missed its run at <time>; not run (app was closed).` Missing-file wording: `System schedule <name> could not run: script "<file>" is missing.`

**Visibility and UI**

- The schedules tab lists system entries alongside tab entries.
- The creation dialog's command field becomes a picker of existing runscripts. The dialog does not create runscripts. The per-tab schedule window does not show system entries.

**Harness name clash**

- A system-fired harness launch whose name is already in use does not get refused. The launch takes the name with a numeric postfix `-N`, where N is the smallest number from 2 that is free, and continues. Typed launches and profile launches keep their existing refusal (`product/specs/notifications.md`, `launch-refused`, and `product/specs/profiles.md`).

**Wording**

- Missing runscript, from `edit <name>` or `execute <name>`: `No runscript named "<name>".`
- Reserved label: `Cannot use "system": that name is reserved for the system tab.`
- Successful creation: `Scheduled <name> system: <spec> (script <name>).`
- A `schedule system` line that does not parse: `Usage: schedule system NAME <form> script <name> | schedule system list | schedule system cancel <name> | schedule system clear`. The tab usage message stays as it is.
- `tab focus <name>` with no match: `No tab named "<label>".`
- Closing the system tab by any path hides it without a message, as closing any tab does.
- `schedule system cancel <name>` with no match: `No scheduled command "<name>" in system.`
- `schedule system list` with no entries: `No scheduled commands in system.`
- `schedule system clear`: `Cleared <n> scheduled commands in system.` With zero entries: `No scheduled commands in system.`

Changed from the earlier answers, and worth a check: a failing line no longer stops its run, and no failed-line notice is posted. Both match a shell tab. The failure reporting and exit-status machinery from the previous revision is dropped. System schedule commands also moved under a `schedule system` subspace, so `schedule system list` replaces `schedule list system`. The runscript commands `edit <name>` and `execute <name>` stay top level, because they are not schedule forms. If they should move under a `script` subspace too, say so.

## What already exists (reuse, don't rebuild)

| Piece | Where | Relevance |
| --- | --- | --- |
| Tab-keyed scheduler and 1-second firing tick | `src/schedule/manager.ts` (`ScheduleManager`) | Fires entries and reschedules recurring ones. Its per-tab keying is what a project-level owner works around. |
| Pure grammar parser and usage text | `src/schedule/index.ts` (`parseScheduleCommand`), `src/schedule/usage.ts` | Parses `schedule NAME [in TAB] <form> COMMAND`. Pure, so the `schedule system` subspace and the `script <name>` clause fit here. |
| `schedule` command definition | `src/commands/schedule.ts` | Resolves `in <tab>` through `resolveTargetTab` and `canRunSchedules`. |
| `edit` command | `src/commands/edit.ts` | Opens any file in the editor and creates it on save. Gains runscript lookup for bare names. |
| Server queue storage and the `queue` command | `src/commands/queue.ts`, `src/tab/queue.ts` (`pushQueue`), `src/tab/runtime.ts:4` (`tab.runtime.queue`), `src/tab/types.ts:310` (`hasCommandQueue`) | The owner appends a run's lines through this storage, exactly as a typed `queue` does. |
| Client queue service and hook | `web/src/shared/command-queue/command-queue.ts` (`CommandQueue`), `web/src/shared/command-queue/useCommandQueue.ts` | Runs FIFO draining against server-owned storage and handles `wake()` for lines queued from elsewhere. The system tab uses it unchanged. |
| Shell queue adapter | `web/src/plugins/shell/useShellCommandQueue.ts`, `web/src/plugins/shell/ShellTab.tsx`, `src/plugins/shell/activate.ts` (`setBusy`, `queue`, `dequeue` intents) | The consumer every shell tab already uses. The system tab adds only a headless mount. |
| Shell output and error handling | `product/specs/shell.md`, `product/specs/transcript.md` | The behavior the system tab copies: output and errors appear in the tab, and nothing notifies for a command error. |
| Shell tab creation | `src/plugins/launch-tab.ts`, `product/specs/tabs.md` (launch shell) | The launch shell is created here. The system tab is created at startup by the same path, without a workspace, and without the reserved-name check. |
| Tab strip and navigation | `src/tab/view.ts`, `src/tab/navigation-commands.ts` | Where a hidden tab must be skipped by strip order, `next`, and `nav`. |
| Aggregated schedules tab | `src/plugins/schedules/`, `ScheduleManager.aggregatedView()`, `src/schedule/views.ts` | Lists every entry soonest-first with a Delete action. Gains an owner kind. |
| Schedule creation dialog | `web/src/ScheduleLaunchDialog/`, `ScheduleManager.scheduleLaunchView()` | Offers eligible tabs as targets. Gains the system target and the runscript picker. |
| Per-tab schedule window | `web/src/shared/status-windows/StatusPanels.tsx`, `web/src/shared/status-windows/useStatusWindows.ts` | Shows only the active tab's entries. Unchanged. |
| Completion of schedule targets | `src/completion/target-handlers.ts` (`completeScheduleTarget`) | The pattern for completing `system`, `script`, and runscript names. |
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

Facts that cut against the feature as written: tab schedules are memory-only today, and the state directory is cleared on a normal launch (`product/specs/state-directory.md`), so the system schedule file has to sit where that clear does not reach. The server shuts down about a second after its last browser client disconnects (`product/specs/cli.md`), so system schedules cannot fire with no window open. `product/specs/scheduling.md` names `src/schedule-manager.ts`, but the code is at `src/schedule/manager.ts`. The spec path is stale and this plan does not rely on it. No top-level `tab` command exists today, so `tab focus` is new.

Conflict with the backlog: `product/backlog/features.md` had a deferred item to run a missed tab firing on reopen. This feature chooses the opposite for system schedules, which skip and notify. The two coexist because the backlog item covers tab schedules only.

## Proposed changes

The project-level schedule is a new owner beside `ScheduleManager`, not a change to how tab schedules fire. Principle 2 of `ai/guidelines/architecture-principles.md` says per-agent state belongs on the tab, and a system schedule has no tab, so the owner keeps its schedule entries outside the per-tab map. The queue itself stays on the system tab's runtime record.

The owner lives under `src/schedule/system/` in two modules. The first is a store that loads and saves `.janissary/system-schedules.json` with the schema version and atomic writes, and that also holds the pure parser for runscript text. The second is the owner. It holds the entries, fires due entries by appending a run's lines to the system tab's queue, and detects overdue entries at boot. It is split further only if a file passes the 200-line limit. `ScheduleManager` gains a hook that hands due system entries to the owner, and the tick in `src/schedule/manager.ts` stays the single 1-second loop.

The owner is a manager registered in `Managers` (`src/managers.ts`), constructed in `createManagers` (`src/controller/create-managers.ts`), and given a `dispose()` in `MANAGER_DISPOSE_ORDER` (`src/managers.ts`). `dispose()` flushes any pending store write. It does not drain anything, because the client owns the drain.

The system tab is created at startup through the shell launch path in `src/plugins/launch-tab.ts`, the same path that opens the launch shell `janus`, with no workspace and the project directory as its cwd. Its startup failure is reported as a notice rather than stopping the launch, as the design section says. It is marked hidden on its tab record. Strip order in `src/tab/view.ts` and the navigation commands in `src/tab/navigation-commands.ts` skip a hidden tab. `tab focus` clears the hidden mark. A new `tab` command file under `src/commands/` holds `tab focus`. The close paths hide the system tab instead of closing it. Those paths are the `close` command (`src/commands/close.ts`), the close helper in `src/tab/close.ts`, the tab strip's × control, Cmd+W and Ctrl+W, and the process-exit handler. Hiding sets the hidden flag on the tab record, and `tab focus` clears it. The quit check for the last non-docked tab in `src/tab/close.ts` and `quit` ignores tabs with the hidden flag. The label `system` is reserved in `src/tab/unique-labels.ts` and in `src/tab/rename.ts`, with the launch path exempt because it creates the tab.

The client mounts the hidden system tab's queue consumer. The shell plugin's queue consumer (`web/src/plugins/shell/useShellCommandQueue.ts`, used by `web/src/plugins/shell/ShellTab.tsx`) needs a mount point that exists without a strip entry. The app shell mounts one such consumer for each hidden shell tab, with no terminal drawn. Queue changes from the server already reach the client through the state broadcast, and `CommandQueue.wake()` handles lines queued by another tab, so no new transport is needed for firings.

The command side adds a `system` subspace to `parseScheduleCommand` in `src/schedule/index.ts`, covering the creation form with its `script <name>` clause and the `list`, `cancel`, and `clear` forms. The `schedule` command in `src/commands/schedule.ts` routes any `schedule system ...` line to the system owner, and every other line keeps its tab path. `execute` is a new command file under `src/commands/`. The `edit` command gains runscript lookup. Each command has one definition in `src/commands/<name>.ts` and one registry entry, per principle 5.

The protocol change adds an owner kind, tab or system, to the aggregated schedule row in `src/schedule/views.ts` and its wire type in `src/protocol/schedule.ts`. The Delete action on a system row must reach the owner, not `ScheduleManager.cancel`. The `cancel` intent in `src/plugins/schedules/activate.ts` and the host side of the `topicAction` capability (wired in `src/plugins/context.ts`, handled in `src/plugins/topics.ts`) both need a branch for the owner kind. `ScheduleManager.clearAll` and the **Clear all schedules** action clear system entries through the same owner.

The notifications side adds the three explicit notices under the `system-schedule-fire` toggle, reusing the notification queue in `src/notifications/`. No notice is added for command output or errors.

Specs changed in the same change: `product/specs/scheduling.md` (system target, `script` form, management, firing, clear-all, dialog picker, and the harness-spawn rule's tab-only scope), `product/specs/notifications.md` (the toggle, the three schedule notices, and the event list), `product/specs/tabs.md` (the hidden system tab created at startup beside `janus`, `tab focus`, every close path hiding it, the quit check ignoring hidden tabs, and strip and navigation skipping hidden tabs), `product/specs/profiles.md` (`profile save` leaves out the system tab, as it leaves out `janus`), `product/specs/state-directory.md` (the schedule file and the scripts folder, both kept by the launch clear), and `product/specs/command-queue.md` (the system tab as a client-drained shell queue).

## Tests

Colocated with each module. The parser tests in `src/schedule/index.test.ts` cover the `schedule system` subspace for creation with the `script <name>` clause, the `list`, `cancel`, and `clear` forms, the usage message for a malformed `schedule system` line, and the refusal of a tab timer named `system`. The store tests cover a round trip, a missing file, a corrupt file, the schema version, and atomic write. The runscript reader tests cover blank lines, `#` comments, dasherized names, the implied `.rs` extension, and a file edited between firings. The owner tests cover appending a run to the queue, one-shot removal, recurring reschedule, the missed-firing path at boot, and the deleted-script path. The client tests in `web/src/plugins/shell/useShellCommandQueue.test.tsx` and `web/src/shared/command-queue/useCommandQueue.test.tsx` cover that a headless consumer drains a queue with no terminal mounted, and that a failing line does not stop the lines after it. The startup tests cover that every launch, `--relaunch` included, creates one hidden system tab beside `janus`, that a failed system shell is reported without stopping the launch, and that `profile save` and the profile relaunch rule leave the system tab alone. The tab tests cover the hidden flag in strip order and navigation, `tab focus` revealing the tab, and every close path hiding the system tab instead of closing it: `close`, `exit`, `close <name>`, the strip ×, Cmd+W, and a process exit. They also cover focus moving off the hidden tab, the quit check ignoring the hidden tab so that closing the last visible tab quits the app, and the label reservation on launch and rename. The `edit` tests in `src/commands/edit.test.ts` cover the lookup order and the refusal for a missing runscript. The harness clash test covers the `-N` postfix for system firings and the unchanged refusal for typed launches. The notification tests cover the wording and the shared toggle, and check that a command error posts no notice.

## Out of scope

- Running a missed firing of a system schedule after a restart. The answer is skip and notify.
- Replaying every missed occurrence of a recurring system schedule.
- Firing while no window is connected, which the server's shutdown rule already prevents.
- Multi-line shell constructs in one runscript. Each line is one command.
- A timeout for a shell line that never exits, such as an editor left open.
- Stopping a run at a failed line. A failed line does not stop the run, as in a shell tab.
- A terminal UI creation dialog. The dialog is web-only, as the New schedule dialog section of `product/specs/scheduling.md` states.
- Changing the grammar or firing behavior of tab-owned schedules, including the recurring harness rule.
- Editing an existing schedule entry in place. Changes go through cancel and create.
- Showing system entries in the per-tab schedule window.
- Creating runscripts from the dialog. `edit <name>` creates them.
- Non-dasherized runscript names.
- Changing the typed-launch refusal for a harness name in use.
- Destroying the system tab. Every close hides it, and the next startup creates a new one.

## Verification

Run `./scripts/run.mjs check-diff`. Manual check, with a window open: write a runscript named `morning-checks` with a comment, a `pwd` line, a `false` line, and a janissary `notify` line placed after `false`. Create `schedule system morning at 9am script morning-checks`, and confirm it appears in the schedules tab with the right next-run time. Quit the app, relaunch, and confirm the entry is still there. Run `execute morning-checks`, then `tab focus system`, and confirm the `pwd` output and the `false` line's shell behavior appear in the system tab's transcript. Run `close system` and confirm the tab leaves the strip without a prompt, then run `tab focus system` to bring it back. With only the system tab hidden, close the last visible tab and confirm the app quits. Confirm the `notify` line still ran after the `false` line, and that no notice was posted for the `false` line. Confirm a schedule naming a missing script is refused with the file's name.
