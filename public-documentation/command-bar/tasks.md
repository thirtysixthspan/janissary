# Task picker

<img class="agent-float" src="/agents/hakim-south.png" alt="" />

Your repository's `ai/tasks/` directory holds executable task files — self-contained instruction sets like `build-a-feature.md` or `fix-a-small-issue.md` that an agent can be told to run. The task picker lists them so you can drop one onto the command line without typing its path by hand.

## The `Ctrl+A` picker

`Ctrl+A` (or the `tasks` command) opens a window listing the task files, sorted alphabetically. Since they all live under `ai/tasks/`, the window initially shows a single collapsed `tasks` row — expand it (`→` or `Return`) to see the individual task files:

![The task picker overlay listing executable task files above the command bar, with one row selected.](/screenshots/task-picker.png)

`↑`/`↓` move the selection, `Return` on a file row copies `execute ./ai/tasks/<filename>` into the command line, and `Escape` closes without changing anything. A row can also be clicked, which does the same as `Return`. With no task files present, the window shows `(no tasks)`.

Unlike the [history picker](/command-bar/history), `Return` here does **not** run the command immediately. It only populates the command line — leaving the cursor at the end — so you can supplement it (say, appending extra instructions) or edit it before pressing `Return` yourself to actually run it.

## What gets listed

Only `.md` files under `ai/` are shown, recursing into subdirectories — `ai/guidelines/` and `ai/personas/` are left out since they hold binding docs and monitor personas, not runnable tasks. The list is read fresh each time the picker opens, so a task file you add, rename, or remove shows up right away.
