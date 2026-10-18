# script tab shows a list of current runscripts, has a + metadata button to create a new runscript in an editor, each row has an action column with an execute button person-running icon, delete button trash-can icon, clone button cone icon to duplicate the runscript with a new name name-2.rs. `scripts` command opens the script tab.

**Complexity: 6/10** — a new bundled tab plugin plus a new host topic and a directory watch with its own lifecycle, which is real concurrency reasoning; most of the file operations and the editor hand-off already exist and are reused.

Runscripts live in `.janissary/scripts/<name>.rs`, and today the only way to work with them is to type a command: `execute <name>`, `edit <name>`, or `create script <name>`, with the name already in mind. This feature adds a `scripts` command that opens a tab listing the project's runscripts, so a user can run, delete, duplicate, or create one from a list. The closest precedent is the schedules tab (`product/specs/scheduling.md`, Scheduling tab), which is a bundled list plugin with a + button in its metadata row, a trash icon on each row, and a topic that keeps its list live.

## Design decisions

- **Command.** `scripts` opens the script tab. The tab is a bundled tab plugin that claims `scripts`. No built-in command is called `scripts`, so the claim does not collide with one. The tab is titled `scripts`. It is a singleton: a second `scripts` focuses the open tab rather than opening another, as `schedules` does. Any words after `scripts` are ignored, so `scripts left` opens the tab as normal.
- **Contents.** The list is the runscript catalog: the same valid, regular `.rs` files that `catalogRunscripts` returns, sorted alphabetically. A file whose name is not a valid runscript name does not appear, which is the existing catalog rule. Each row shows the runscript's name, followed by a clock icon (the same icon as the schedule button in the tab metadata bar) when at least one system schedule uses it. The icon's tooltip reads `Used by a system schedule`, and it appears or disappears as the row's schedule count changes. No other detail is shown on a row.
- **Live list.** Opening the tab creates `.janissary/` and `.janissary/scripts/` when they are missing, using the same checks `create script` uses, and then watches the scripts directory. The list updates by itself when a runscript is created or deleted outside Janissary, within about a second.
- **Row refresh.** A row's schedule count and its open-in-editor flag change without any file event. Both are recomputed on the scheduler's one-second tick, and the list is sent again only when a row's value changes. This is a deliberate ceiling: a list of a few dozen runscripts costs next to nothing per second. If the tick ever shows up in profiles, the upgrade path is to recompute on the state broadcast instead, at the cost of running far more often.
- **Row actions.** Each row has an action column with three buttons: execute (person-running icon), delete (trash-can icon), and clone (duplicate icon; the request's "cone icon" is read as this). Pressing a row's button does not change the selection.
- **Selecting and opening.** A single click selects a row without switching tabs. A double-click, or Enter on the selected row, opens that runscript in an editor tab, the same as `edit <name>`. The existing editor path already focuses a tab that holds the same file rather than opening a second one, so the scripts tab inherits that.
- **Keyboard.** The tab mirrors the schedules tab. Up and Down move the selection one row, Home and End jump to the first and last row, and the list scrolls to keep the selected row in view. Delete or Backspace opens the delete dialog for the selected row.
- **Empty state.** With no runscripts, the list area reads `No runscripts yet. Press + to create one.` and the tab stays open.
- **Button wording.** The + button is labeled `New script`. The row buttons' tooltips are `Run`, `Duplicate`, and `Delete`, with no runscript name in them.
- **Execute.** Runs the runscript the way `execute <name>` does today. Its lines go to the project's system shell, after the system shell is ensured. On success nothing appears anywhere, and the system shell is not brought into view. A missing or unreadable runscript is reported to the notifications feed, not on the tab, using the wording `execute` already uses: `No runscript named "<name>".` or `Could not read runscript "<name>".`. If the system shell cannot start, the tab adds nothing of its own, because `execute` already returns silently in that case and the shell reports its own failure.
- **Clone.** Makes a copy under a new name: `<name>-2`, stored as `<name>-2.rs`. If that is taken, the next free number is used, which is the `-2`, `-3` pattern that `nextFreeName` already produces. `name-2` is a valid runscript name because `isRunscriptName` allows digits. The copy keeps the source's text, comments and blank lines included. After the copy is made, it opens in an editor tab, the same as + does for a new file.
- **Delete.** Opens a confirmation dialog titled `Delete runscript "<name>"?` with Delete and Cancel buttons, and only Delete removes the file. Cancel, Escape, or a click outside leaves the file in place. When system schedules use the runscript, the dialog adds one line with the count: `Used by 1 system schedule. It will fire as missing after this.` or `Used by <n> system schedules. They will fire as missing after this.` When an editor tab holds the runscript open, the dialog adds one line, `Open in an editor tab. The tab keeps its text.`, and Delete still removes the file. The open editor tab keeps its text until it is saved or closed. Delete then goes ahead, and scheduled runs of that script fire as `missing`, which is what they already do for a script removed by hand. After a delete, the selection moves to the next row, or to the previous row when the deleted row was last.
- **Create (+ button).** The metadata row carries a + button that creates a new empty runscript and opens it in an editor tab. The name is not asked for. The new file is `untitled.rs`, or the next free `untitled-N.rs` when that name is taken, so pressing + twice gives `untitled.rs` and then `untitled-2.rs`. This differs from `create script <name>`, which needs a name.
- **Failure text.** A failed clone reports `Could not clone runscript "<name>".` and a failed delete reports `Could not delete runscript "<name>".`, both to the notifications feed. A failed + reports `Could not create runscript "<name>".`, the wording `create script` already uses. A row whose file has gone before the button is pressed reports `No runscript named "<name>".` to the feed, and the list then refreshes so the row disappears.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Reuse |
| --- | --- | --- |
| Runscript name validation | `src/schedule/system/runscript.ts` (`isRunscriptName`) | Validate names for create and clone |
| Runscript catalog | `src/schedule/system/runscript-files.ts` (`catalogRunscripts`) | Source of the list rows |
| Tab completion of runscript names | `src/controller/completion.ts` (reads `catalogRunscripts`) | Needs no change; a new or cloned runscript completes as soon as its file exists |
| Safe reads and path checks | `src/schedule/system/runscript-files.ts` (`readRunscript`, `scriptsDirectory`, `assertDirectory`, `makeScriptsDirectory`) | Reads, the directory creation for the watch, and the refusals of symlinks and non-regular files |
| Runscript creation | `src/schedule/system/runscript-files.ts` (`createRunscript`) and `src/commands/create.ts` | The + button creates through `createRunscript`, and opens the file through the same editor path |
| Running a runscript | `src/commands/execute.ts` | Its execution step becomes one exported function that the command and the topic action both call |
| Free-name selection | `src/editor/next-free-name.ts` (`nextFreeName`) | Chooses the clone's `-2`, `-3` name and the `untitled-N` name |
| Editor open for a path | `src/open/file-manager.ts` (`editForCommand`), `src/tab/open-editor-tab.ts` | Opens the copy, the new file, and a double-clicked row; focuses an open tab for the same path |
| Notifications feed | `notifyUser` in `src/plugins/api.ts` and the host notifications | Failure text |
| Topic plus topic action pattern | `src/plugins/api-topics.ts` (`NOTIFICATION_TOPICS`), `src/plugins/topics.ts` (`readTopicData`, `runTopicAction`), `src/plugins/schedule-topic-actions.ts` | The model for the `runscripts` topic and its action module |
| Singleton list tab with a + button and a trash icon per row | `src/plugins/schedules/`, `web/src/plugins/schedules/` (`SchedulesTab`, `SchedulesRows`, `DeleteScheduleDialog`) | Shape of the tab, the metadata-row + button, the per-row trash icon, the confirmation dialog, and the keyboard model |
| Icon buttons in a row's action column | `web/src/plugins/sessions/SessionRowActions.tsx` | Precedent for the action column |
| Handling of a missing runscript | `src/schedule/system/firing.ts` | A system schedule that names a deleted runscript already fires as `missing` |
| Folder watching | `src/file-navigator/watch.ts` (`watchDir`) | Not reused. It is keyed to a files tab's state, and this watch is host-level, so the scripts module gets its own non-recursive `fs.watch` |

## Proposed changes

**Runscript files.** In `src/schedule/system/runscript-files.ts`, which stays well under the 200-line limit:

- Export `ensureScriptsDirectory(projectRoot)`, which is the existing `makeScriptsDirectory` made public. It runs `scriptsDirectory` first, so the Git-exclusion step runs before the directory is created, as it does for `createRunscript`. The tab's watch calls it before watching.
- Add a `text` field to what `readRunscript` returns, holding the raw file contents beside the parsed `lines`. The reader already reads that file, so the field costs one assignment. Clone uses it, because `parseRunscriptText` drops blank and full-line comments and a clone built from parsed lines would lose them. Existing callers ignore the new field.
- Add `deleteRunscript(projectRoot, name)`. It checks the target through `readRunscript`, so a symlink or non-regular file is refused before anything is removed. It removes the file and reports whether it did.
- Add `cloneRunscript(projectRoot, name)`. It takes the raw `text` from `readRunscript`, picks the target with `nextFreeName` on `<name>.rs`, creates that file with the exclusive write flag, writes the raw text, and returns the new name. The exclusive flag is the guard against the race between choosing a name and writing it.
- Add `newUntitledRunscript(projectRoot)`. It picks `untitled.rs` through `nextFreeName`, creates that name through `createRunscript`, and returns the name. If `createRunscript` finds the name taken by a race, it returns the existing file without overwriting it.

**Shared execution.** In `src/commands/execute.ts`, export `runRunscriptNow(managers, name)`. It holds the body after name validation: read the runscript, report a missing or unreadable one, ensure the system shell, and enqueue the lines to `system`. It returns the failure text, or nothing. The `execute` command appends that text to its transcript exactly as it does today, so the command's behavior does not change. The topic action sends the same text to the feed.

**Host watch and topic.** A new host module beside the runscript files owns the watch.

- It starts when the first scripts tab opens. It calls `ensureScriptsDirectory`, starts a non-recursive `fs.watch` on the scripts directory, and re-reads the names on each event. Events that arrive together are coalesced into one re-read.
- It stops when the last scripts tab closes or the plugin is disabled, and it releases its watch in one dispose, as other host resources do.
- It keeps the last rows it published and sends the list again only when a row changes.
- Rejected: watching for the whole session. That would hold a watch in every project, including projects where no scripts tab was ever opened.

The `runscripts` topic is added to `NOTIFICATION_TOPICS` in `src/plugins/api-topics.ts` beside the five v2 topics. `readTopicData` in `src/plugins/topics.ts` gains a `runscripts` branch, and `runTopicAction` in the same file routes `runscripts` actions to the new action module. The change is additive, so `TAB_PLUGIN_API_VERSION` stays 2. The topic list in `documentation/developer-documentation/tab-plugins.md`, which names the v2 topics, gets the new topic. Its payload is `{ rows }`, with each row holding `name`, `schedules` (the number of system schedules that name this runscript), and `open` (whether an editor tab holds its file). Rows are sorted by name. The tick recomputes `schedules` and `open` as described under Design decisions.

**Actions.** Every intent the client sends becomes a topic action: `execute`, `delete`, `clone`, `create` (the + button), and `open` (double-click or Enter). They are handled in a new module, `src/plugins/runscript-topic-actions.ts`, which mirrors `schedule-topic-actions.ts`.

- `execute` calls `runRunscriptNow` and sends any failure text to the feed.
- `delete` calls `deleteRunscript` and sends any failure text to the feed. The row disappears through the next list send.
- `clone` calls `cloneRunscript`, then opens the copy in an editor. A failure goes to the feed.
- `create` calls `newUntitledRunscript`, then opens the file in an editor. A failure goes to the feed.
- `open` opens the named file in an editor, and an open tab for that path is focused.

Every action reports its failure to the feed and returns nothing to the plugin. `topicAction` may return an error string, which the schedules tab turns into a rejection, but this tab reports to the feed as the user chose, so no rejection is needed.

Each action payload carries the issuing tab's label. The editor path needs an origin tab for its transcript, and the scripts tab is that origin. Actions with a name that is not a valid runscript name, or not in the catalog, do nothing.

**Client.** The plugin's client entry lives under `web/src/plugins/scripts/`. `index.tsx` default-exports the component and named-exports `isPayload`. The list, the metadata row with the + button, the row action column, and the delete dialog live beside it. Selection, keyboard movement, and scrolling are view-local state and stay on the client. The key handling is a pure module under `web/src/plugins/scripts/`, modeled on the Up, Down, Home, and End handling in `web/src/plugins/schedules/SchedulesTab.tsx`. It is written separately rather than imported, because one feature does not import another. Rows, counts, open flags, and the dialog's lines come from the server. The client sends intents and renders what the server sends.

**Plugin declaration.** `src/plugins/scripts/manifest.ts` declares the plugin with `scripts` as its command claim and `runscripts` as its notification topic. `src/plugins/scripts/shared.ts` holds the payload and the intent guards, and imports nothing. `src/plugins/scripts/activate.ts` opens or focuses the singleton tab under one fixed instance key, starts and stops the host watch with the tab's lifetime, and routes each intent to `topicAction`. The plugin is registered in `src/plugins/catalog.ts`, `src/plugins/loaders.ts`, and `web/src/plugins/registry.tsx`.

**Specs and docs.** Add `product/specs/scripts-tab.md` as the behavior spec for the tab. In `product/specs/scheduling.md`, the runscripts paragraph gets a pointer to the new spec. The `scripts` row goes into the Commands table in `help.md` at the repository root, which stays alphabetical and is checked by `src/commands.test.ts`, and into `documentation/user-documentation/command-bar/commands.md`. The `runscripts` topic is added to the topic list in `documentation/developer-documentation/tab-plugins.md`.

## Tests

- `src/plugins/scripts/activate.test.ts` and `shared.test.ts`: the `scripts` command opens the singleton and focuses it on a second run; ignored arguments still open the tab; each intent becomes a topic action carrying the tab label; a malformed intent is rejected, not treated as a failure; the watch starts with the first tab and stops with the last; disposal releases what the tab acquired.
- `src/plugins/runscript-topic-actions.test.ts`: each action in the Actions section. Failures reach the feed with the wording above. Clone and create open the new file. Open focuses an existing editor tab for the same path.
- `src/plugins/api-topics` tests: the four existing topics are unchanged, and the `runscripts` payload carries `schedules` and `open` per row, sorted by name.
- The host watch module's tests: an event re-reads the names; a re-read that finds no change publishes nothing; disposal stops the watch.
- `src/schedule/system/runscript-files.test.ts`: added cases for `ensureScriptsDirectory`, `deleteRunscript`, `cloneRunscript`, and `newUntitledRunscript`, and a case showing `readRunscript` returns the raw `text` with its comments intact. Delete removes the file and refuses a symlink. Clone picks `-2` and then `-3`, keeps comments and blank lines, and refuses a symlinked source. The untitled name goes `untitled`, then `untitled-2`.
- `src/commands/execute.test.ts` and the existing `execute` tests keep passing unchanged, and a new case checks that `runRunscriptNow` returns the same failure texts the command prints.
- `web/src/plugins/scripts/*.test.tsx`: lazy loading and the payload guard; the rendered list and empty state; the clock marker shown only for rows whose schedule count is above zero; the keyboard model; a double-click and Enter both send `open`; each button sends its intent; the delete dialog shows the schedule and open lines from the row, and Delete with an empty selection does nothing; selection after a delete.

## Out of scope

- Only the controls named in the feature exist: execute, delete, clone, and the + button, plus the double-click and Enter that open a row in an editor. Renaming a runscript, editing it from its row, and scheduling from the tab are not part of this feature.
- Docking the tab into a sidebar. The tab is centre-only.
- Watching any directory other than `.janissary/scripts`.
- The runscript grammar, the catalog rule, and the behavior of `edit`, `execute`, and `create script` are unchanged. The only change to `execute` is the extraction described under Proposed changes.

## Verification

Run `./scripts/run.mjs check-diff`. Then do a manual check in a project that has two runscripts, and another project with no `.janissary/` at all. In the first project, type `scripts` and confirm the tab lists both in alphabetical order. Clone one and confirm `<name>-2.rs` appears, holds the same lines and comments, and opens in an editor. Execute a runscript and confirm its lines run in the system shell. Delete a runscript after confirming, and confirm its file is gone. Press + twice and confirm `untitled.rs` and `untitled-2.rs` open. Create a file in `.janissary/scripts` from a terminal and confirm it appears in the list within about a second. In the second project, type `scripts` and confirm `.janissary/scripts/` now exists and the tab shows the empty-state line. Because a plugin tab adds a client chunk, also run the production web build and confirm the scripts tab's modules sit in their own chunk.
