# Task Picker

Task files are the executable prompts kept directly under the repository's top-level `ai/`
directory — `build-a-feature.md`, `fix-a-small-issue.md`, `merge-change-to-master.md`, and the
like. Each is a self-contained instruction set an agent can be told to run. The task picker lists
them so one can be dropped onto the command line without typing its path by hand.

### Listing

The picker lists only the `.md` files directly inside `ai/`, sorted alphabetically. It is
non-recursive: subdirectories such as `ai/guidelines/` (binding project docs) and `ai/personas/`
(monitor persona bodies) are excluded, along with any other nested directory. The list is read
fresh from disk, so adding, renaming, or removing a task file is reflected the next time the
picker opens.

### Openers

`Ctrl+A` (or the `tasks` command) opens the task picker over the command line. The two openers are
equivalent. The picker is only reachable on tabs that show a command line — an agent or transcript
tab; on harness and shell tabs `Ctrl+A` reaches the terminal itself (shell line-start, tmux
prefix) and no popup appears.

### Picker behavior

| Input | Effect |
|---|---|
| Up / Down | Move the selection |
| Return, or clicking a row | Copies `execute ./ai/<filename>` into the command line and closes the popup **without submitting** |
| Escape | Closes the popup, leaving the command line unchanged |

Selecting a task populates the command line and leaves the cursor at the end, so the command can
be supplemented (for example appending extra instructions) or edited before it is run. Nothing is
sent until Return is pressed on the command line itself. This deliberately differs from the history
picker, where Return runs the selected command immediately; it matches the command-queue picker's
behavior of making the command line the edit surface.

The filename is inserted verbatim, with no quoting or escaping — a task file whose name contains a
space populates the command line with that space intact, because the populated text is freeform
input for the agent, exactly as if it had been typed by hand.

When the `ai/` directory has no task files, the picker shows `(no tasks)`.
