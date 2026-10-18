# Scripts tab

### Command and tab

The `scripts` command opens the scripts tab. It is a bundled tab plugin (see [[tab-plugins]]) that claims the `scripts` command and no file types. The tab is titled `scripts` and is a singleton: a second `scripts` focuses the open tab instead of opening another. Words after `scripts` are ignored, so `scripts left` opens the tab in the centre like bare `scripts`. The tab does not dock into a sidebar.

Every `scripts` run first sends the `ensureDirectory` action, including a run that only focuses an open tab. That action (in `src/plugins/runscript-topic-actions.ts`) calls `ensureScriptsDirectory` in `src/schedule/system/runscript-files.ts`, which runs the same Git exclusion step `create script` runs and then creates `.janissary/` and `.janissary/scripts/` when they are missing. The command is implemented by `activate` in `src/plugins/scripts/activate.ts`, and the client is `ScriptsTab` in `web/src/plugins/scripts/ScriptsTab.tsx`.

### Rows

The list shows the project's runscripts: the valid regular `.rs` files in `.janissary/scripts`, sorted alphabetically. A file whose name is not a valid runscript name is not listed, and neither is a symlink or other non-regular file. Each row is numbered `1)`, `2)`, and so on, and shows the runscript's name. When at least one system schedule names the runscript, a clock icon follows the name. Its tooltip and accessible name both read `Used by a system schedule`. No other detail appears on a row.

When there are no runscripts, the list area reads `No runscripts yet. Press + to create one.` and the tab stays open. The metadata row holds a + button with the tooltip and accessible name `New script`.

### Live list and refresh

The rows reach the tab through the `runscripts` host topic, declared in `src/plugins/api-topics.ts`. Its payload is `{ rows }`, and each row carries `name`, `schedules` (the number of system schedules that name the runscript), and `open` (whether an editor tab holds its file). Rows are sorted by name. Opening the tab reads the topic at once.

After that, the scheduler's one-second tick (`ScheduleManager` in `src/schedule/manager.ts`) drives `createRunscriptRefresh` in `src/schedule/system/runscript-refresh.ts`. Each tick recomputes every row, and the topic is published only when a name, a schedule count, or an open flag differs from the rows last published. A runscript created or deleted outside Janissary therefore appears or disappears within about one second. The refresh only reads. It never creates a directory and never writes the Git exclusion.

The tick checks a gate before it reads anything. The refresh does work only while an open tab belongs to a plugin that lists `runscripts` in its notifications. When no such tab is open, the tick reads no file and no schedule, and it forgets the rows it last published. The subscription itself exists only when some plugin declaration lists `runscripts` (`src/plugins/host-channels.ts`). The scripts plugin always declares it, so the gate is what keeps a project with no scripts tab open from reading its directory.

The refresh is a gate, not a lifecycle that starts with the first tab and stops with the last. The plugin API has no hook for a tab closing. A plugin's `dispose` runs only when the plugin is disabled or the host shuts down (`src/plugins/host.ts`), so the refresh cannot learn that the last tab has closed. It checks the gate on each tick instead.

Recomputing every row each second is a deliberate ceiling. The cost is one directory listing, two lookups per row, and a scan of the open tabs, which is negligible for a few dozen runscripts. If the tick ever shows up in profiles, the refresh moves to the state broadcast instead. That runs far more often, so it is the upgrade path and not the default.

### Row actions

Each row ends in an action column with three buttons. A button's tooltip is its label, and its accessible name is the label followed by the runscript name, such as `Run deploy`.

- `Run` (person-running icon) runs the runscript. It sends `execute`.
- `Duplicate` (duplicate icon) copies the runscript. It sends `clone`.
- `Delete` (trash-can icon) opens the delete dialog for that row.

Pressing a row button does not change the selection, and a double-click on a row button does not also open the row. The second click of a double-click on `Run` or `Duplicate` is ignored, so one double-click runs or copies once. `Delete` needs no such rule, because the dialog's backdrop takes its second click.

### Selection and keyboard

A single click selects a row and does not change the active tab. A double-click on a row, or Enter on the selected row, opens it in an editor tab, the same as `edit <name>`.

The tab handles keys when focus is on the tab itself or on a row. Keys pressed on the + button or the split control belong to that control, so Enter on a focused + button presses it. The tab's keys are these:

- `ArrowDown` and `ArrowUp` move the selection one row.
- `Home` and `End` select the first and last row.
- `Enter` opens the selected row.
- `Delete` and `Backspace` open the delete dialog for the selected row.

With no row selected, `ArrowDown` selects the second row and `ArrowUp` selects the first, as `nextListSelection` in `web/src/shared/list-selection.ts` does. Enter and Delete do nothing without a selected row. The list scrolls to keep the selected row in view.

### Create

The + button creates an empty runscript and opens it in an editor tab. It asks for no name. The file is `untitled.rs`, or the next free `untitled-N.rs` when that name is taken, so two presses make `untitled.rs` and then `untitled-2.rs`. The free name comes from `nextFreeName` (`src/editor/next-free-name.ts`), and `newUntitledRunscript` in `src/schedule/system/runscript-files.ts` makes the file through `createRunscript`, which never overwrites an existing file.

### Clone

Duplicate copies the runscript under the next free name. The copy is `<name>-2`, stored as `<name>-2.rs`. If that is taken, the copy is `<name>-3`, and so on. The copy holds the source file's exact text, comments and blank lines included, and it opens in an editor tab. The copy is written with an exclusive create, so a file that appears between choosing the name and writing it is never overwritten. A symlinked or non-regular source is refused.

### Delete

Delete opens a dialog titled `Delete runscript "<name>"?` with `Delete` and `Cancel` buttons. Only `Delete` removes the file. The dialog adds these lines when they apply, in this order:

- `Used by 1 system schedule. It will fire as missing after this.` when one system schedule names the runscript.
- `Used by <n> system schedules. They will fire as missing after this.` when more than one does, with the count in place of `<n>`.
- `Open in an editor tab. The tab keeps its text.` when an editor tab holds the file.

In the dialog, `y` confirms, `n` and Escape cancel, Left and Right move the highlight between the two buttons, and Enter chooses the highlighted button. The highlight starts on `Cancel`. While the dialog is open it takes every key, and a click outside it is swallowed, so the dialog stays open. Cancelling leaves the file in place.

On confirm, `deleteRunscript` in `src/schedule/system/runscript-files.ts` removes the file, and the row leaves the list at the next refresh. If the deleted row was the selected row, the selection moves to the next row, or to the previous row when the deleted row was last, and clears when no row is left. Deleting a row that is not selected leaves the selection where it was.

An editor tab that holds the deleted file keeps its text until it is saved or closed. A system schedule that names the file fires as missing afterward, as it does for a script removed by hand (see [[scheduling]]). Saving that tab afterward writes the file back. The editor's save path does not refuse a file that is gone from disk, so the save recreates it, and the row returns at the next refresh.

### Execute

Run sends the row's runscript to `runRunscriptNow` in `src/commands/execute.ts`, the same code the `execute <name>` command calls. The command prints its failure lines in the transcript, and the tab sends the same lines to the notifications feed. The steps are these: read the runscript, report it when it is missing or cannot be read, ensure the managed system shell, and queue the runscript's lines to that shell (see [[scheduling]]).

On success nothing appears. No feed line is written, and the system shell is not brought into view. An empty runscript queues nothing and reports nothing. If the system shell cannot start, the tab adds no line of its own, because the system shell reports its own start failure.

### Open

Double-click or Enter sends `open`. The runscript opens in an editor tab, as `edit <name>` opens it. An editor tab that already holds the same file is focused instead of a second one being opened. A missing runscript, or one that cannot be read, reports its failure line (see Failure text).

### Failure text

Each failure line goes to the notifications feed, not to the tab. In the table, `<name>` is the runscript name.

| Text | When it appears | Produced by |
| --- | --- | --- |
| `No runscript named "<name>".` | The file is absent when the action reads it. | Run, Open, Duplicate, Delete |
| `Could not read runscript "<name>".` | The file exists but is a symlink or non-regular file, or cannot be read. Also when `.janissary` or `.janissary/scripts` is a symlink or not a directory, whether or not the file exists. | Run, Open |
| `Could not run runscript "<name>".` | Running throws, for a reason other than a missing or unreadable file. | Run |
| `Could not delete runscript "<name>".` | The file is a symlink or non-regular file, or it cannot be read or removed. Also when `.janissary` or `.janissary/scripts` is a symlink or not a directory, whether or not the file exists. | Delete |
| `Could not clone runscript "<name>".` | The source is refused, or the copy cannot be created. | Duplicate |
| `Could not create runscript "<name>".` | The runscripts directory cannot be used, or the new file cannot be created. The name is `untitled` when the failure comes before the name is picked, and the picked name after. | + (`New script`) |
| `Could not use the runscripts directory.` | `.janissary` or `.janissary/scripts` is a symlink or not a directory. | `scripts` command |

An action that fails with an exception also writes one cause line to stderr, which the feed does not show. The Run read refusal and a failed listing write none. A failed listing shows the empty state and writes no feed line.

Owner to confirm: the run line and the directory line in the table above are new wordings that the source plan did not have. They are recorded here as the code builds them. If the owner picks other wording, the code and this table change together.

### Edge cases

- An action that names something other than a valid runscript name is dropped with no feed line. The list never shows such a name, so only a crafted request can send one.
- A duplicate whose `<name>-2.rs` is taken uses the next free number, as Clone describes.
- A row whose file is gone before Run, Duplicate, Open, or Delete acts on it reports the missing-runscript line, and the next refresh removes the row.
- A symlinked or non-regular file is never listed. If one replaces a listed file, the action on it reports its own failure line: the read line for Run and Open, the clone line for Duplicate, and the delete line for Delete.
- An empty or missing scripts directory shows the empty-state line. `scripts` creates any missing folders.
- A symlinked `.janissary` or `.janissary/scripts` makes the listing fail. The list shows the empty state, and the refresh writes no feed line for it. `scripts` reports the directory line, and + reports the create line with the name `untitled`.
- A symlinked or non-directory `.janissary` or `.janissary/scripts` makes Run and Open report the read line, and Delete report the delete line, whether or not the runscript file exists. The directory is checked first, so those lines do not mean the file is at fault. Duplicate already reports its clone line in that case.
- Deleting a runscript while an editor tab holds it, and saving that tab afterward, are described under Delete.
- Known divergence. The schedules tab has no keyboard target check, and the scripts tab does (`ownsKey` in `web/src/plugins/scripts/ScriptsTab.tsx`). On the schedules tab, with a row selected, Enter on the focused `New schedule` button runs the focus action for the selected row, so the owner tab opens instead of the New schedule dialog. ArrowUp, ArrowDown, Home, End, Backspace, and Delete pressed on that button also move the schedules selection or open its delete dialog. The scripts tab leaves those keys to its + button. This change does not touch the schedules tab. The owner's choice between sharing the guard and keeping two copies is recorded in `product/plans/complete/scripts-schedules-keyboard-divergence.md`.

### Out of scope

- Renaming a runscript, editing it from its row, and scheduling from the tab. Double-click and Enter are the only ways to open one.
- Docking the tab into a sidebar.
- Reading any directory other than `.janissary/scripts`.
- Changes to the runscript grammar, the catalog rule, or the `edit` and `create script` commands. The `execute` command changes only by sharing its execution step with the tab.
- A file watcher. The list is read on the tick, so no watcher is needed.
- A keyboard guard on the schedules tab, which waits on the owner's decision.
</content>
