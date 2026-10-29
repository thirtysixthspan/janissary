# Scripts

Browse your project's runscripts, then run, duplicate, edit, or delete one from its row.

```
scripts
```

## Open the list

<img class="agent-float" src="/agents/malik-south-east.png" alt="" />

`scripts` opens the list in the center. There is only ever one: a second `scripts` focuses the open tab. Words after the command are ignored, so `scripts left` opens the center tab like a bare `scripts`, and the list can't dock into a sidebar. Every `scripts` run also creates `.janissary/` and `.janissary/scripts/` if they're missing, and in a Git project adds `.janissary/scripts/` to your clone's `.git/info/exclude`. See [Runscripts](/user-documentation/command-bar/commands#edit-and-execute-runscripts) for what a runscript is and how to write one.

## What a row shows

A row appears for every regular `.rs` file in `.janissary/scripts/` whose name is a valid runscript name: lowercase letters and digits, with single hyphens between words. Rows sort alphabetically and are numbered `1)`, `2)`, and so on. A symlink, a folder, or a file with any other name never shows up.

When a [system schedule](/user-documentation/automation/scheduling#project-system-schedules) runs a script, a clock icon follows its name. Its tooltip reads `Used by a system schedule`. Nothing else appears on a row.

With no runscripts, the list reads `No runscripts yet. Press + to create one.` The tab stays open.

## Keep the list current

<img class="agent-float left" src="/agents/orhan-south.png" alt="" />

The list refreshes itself about once a second while the tab is open. A runscript you create or delete in a terminal or another program appears or disappears without any action from you, and so does a clock icon when a system schedule starts or stops using a script. There's no refresh button.

## Create a runscript

Press **+** (tooltip `New script`). It asks for no name. Janissary creates an empty `untitled.rs`, or `untitled-2.rs`, `untitled-3.rs`, and so on when the earlier names are taken, and opens it in an editor tab. It never overwrites a file. A double-click on **+** creates one script, not two. To pick the name yourself, use `create script <name>` instead.

## Run, duplicate, or delete

Each row ends in three buttons. Hover one for its label, such as `Run`. Screen readers hear the label followed by the script name, such as `Run deploy`.

- **Run** queues the script's lines in the project's hidden system shell, exactly as `execute <name>` does. Success prints nothing, and the system shell doesn't come into view. An empty script queues nothing and says nothing.
- **Duplicate** copies the script under the next free name: `<name>-2`, then `<name>-3`, and so on. The copy holds the exact text of the original, comments and blank lines included, and opens in an editor tab.
- **Delete** asks first.

Pressing a button doesn't select its row, and a double-click on **Run** or **Duplicate** acts once.

### Confirm a delete

The dialog is titled `Delete runscript "<name>"?` and has **Delete** and **Cancel** buttons. It adds a line for each of these that applies:

- `Used by 1 system schedule. It will fire as missing after this.` for one schedule, or `Used by <n> system schedules. They will fire as missing after this.` for more.
- `Open in an editor tab. The tab keeps its text.` when an editor tab holds the file.

Press `y` to delete. Press `n` or `Escape` to cancel. `←` and `→` move between the buttons, and `Enter` takes the highlighted one, which starts on **Cancel**. The dialog takes every key while it's open, and a click outside it does nothing. Cancelling leaves the file alone.

A deleted script's schedules aren't removed. They report the script as missing when they next fire. An editor tab that held the file keeps its text, and saving that tab writes the file back, which brings the row back within a second. If you delete the selected row, the selection moves to the next row, or to the previous one when it was last.

## Select and open a row

<img class="agent-float" src="/agents/selim-south-west.png" alt="" />

Click a row to select it. Double-click it, or press `Enter` on the selected row, to open the script in an editor tab, the same as `edit <name>`. If an editor tab already holds that file, Janissary focuses it instead.

When focus is on the list or a row, these keys work:

| Key | Action |
| --- | --- |
| `↓` / `↑` | Move the selection one row |
| `Home` / `End` | Select the first or last row |
| `Enter` | Open the selected row |
| `Delete` / `Backspace` | Open the delete dialog for the selected row |

With no row selected, `↓` selects the second row and `↑` selects the first, and `Enter` and `Delete` do nothing. Keys pressed on the **+** button belong to the button, so `Enter` there creates a script.

## When something goes wrong

Every message below goes to the [Notifications](/user-documentation/tab-types/notifications) tab, not the scripts tab. `<name>` is the script's name.

| Message | What happened |
| --- | --- |
| `No runscript named "<name>".` | The file was gone when you pressed Run, Duplicate, Delete, or opened it. The row leaves the list at the next refresh. |
| `Could not read runscript "<name>".` | Run or open found something that isn't a readable regular file, or `.janissary` or `.janissary/scripts` is a symlink or not a folder. |
| `Could not run runscript "<name>".` | Running failed for another reason. |
| `Could not delete runscript "<name>".` | The file or its folder couldn't be removed or read safely. |
| `Could not clone runscript "<name>".` | The source was refused or the copy couldn't be created. |
| `Could not create runscript "<name>".` | The new file couldn't be created. The name reads `untitled` when the failure comes before a name is picked. |
| `Could not use the runscripts directory.` | `scripts` found `.janissary` or `.janissary/scripts` to be a symlink or not a folder. |
| `edit: <name>.rs is <size> — too large to edit in-app (limit 2.0 MB).` | The file is over the editor's two-megabyte limit, so nothing opened. A duplicate of an oversized script is still created on disk. |

If `.janissary` or `.janissary/scripts` is a symlink or not a folder, the list shows the empty message and no feed line, because it can't read the folder at all. Fix or remove the symlink, then run `scripts` again.

If the system shell can't start, **Run** adds no line of its own. The system shell reports its own start failure.
