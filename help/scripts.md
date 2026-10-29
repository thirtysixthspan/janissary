### scripts

Open the project's runscript list. From a row, run, duplicate, or delete a script; use **+** to create one.

**Usage**

`scripts`

**Use cases**

- Browse project runscripts and launch one from its row.
- Create, duplicate, or remove a runscript.
- Create a named runscript from the command bar with `create script <name>`, which opens the empty file in an editor.
- Select a row with a click or `ArrowUp`/`ArrowDown`, then press `Enter` (or double-click) to open it in an editor. `Delete` or `Backspace` asks before removing the selected script.
- **Run** queues the script in the system shell like `execute <name>`; **Duplicate** copies it as `<name>-2`; **+** makes `untitled.rs`. Failures appear in the Notifications tab.
- Runscripts live in `.janissary/scripts/`. In a Git project, Janissary adds that folder to `.git/info/exclude` so new runscripts stay out of your commits.

**Examples**

- `scripts` opens the project's runscript list.
- `scripts` followed by **+** opens a new runscript editor.
- `create script deploy` makes `.janissary/scripts/deploy.rs` and opens it, or opens it unchanged if it already exists.
