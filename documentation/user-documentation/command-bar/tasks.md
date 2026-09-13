# Task picker

<img class="agent-float" src="/agents/malik-south.png" alt="" />

Your repository's `ai/tasks/` directory holds executable task files — self-contained instruction sets like `build-a-feature.md` or `work-an-issue.md` that an agent can be told to run. The task picker lists them so you can drop one onto the command line without typing its path by hand.

## The `Ctrl+A` picker

`Ctrl+A` (or the `tasks` command) opens a window listing the task files, with the task files in a directory listed first and its subdirectories last, each group sorted alphabetically. So the runnable tasks sit at the top and any subdirectory collects beneath them — expand one (`→` or `Return`) to see the task files inside it:

![The task picker overlay listing executable task files above the command bar, with a Project section and a Janissary section, one row selected.](/screenshots/task-picker.png)

`↑`/`↓` move the selection, `Return` on a file row inserts the task's command into the command line at the cursor, and `Escape` closes without changing anything. A row can also be clicked, which does the same as `Return`. With no task files present, the window shows `(no tasks)`.

Unlike the [history picker](/user-documentation/command-bar/history), `Return` here does **not** run the command immediately. It inserts the command at the cursor — leaving any text you'd already typed intact, with the cursor just after the inserted command — so you can supplement it (say, appending extra instructions) or edit it before pressing `Return` yourself to actually run it.

On a shell tab, `Ctrl+A` reaches the terminal itself instead of opening the picker, since shell tabs run interactive programs that depend on receiving that keystroke. On a harness tab there is no command line to insert into, so picking a task sends the same command straight into that harness's terminal input, exactly as if it had been typed there.

## What gets listed

<img class="agent-float left" src="/agents/idris-south-east.png" alt="" />

The picker draws from two sources, each shown as its own labeled section: a **Project** section for the current project's `ai/tasks/`, followed by a **Janissary** section for the task files that ship with the app itself. A section is omitted entirely when its source has no tasks — a project with no `ai/tasks/` shows only the Janissary section.

Within each section, only `.md` files under `ai/tasks/` are shown, recursing into subdirectories. The list is read fresh each time the picker opens, so a task file you add, rename, or remove shows up right away. Each row hides the `.md` extension (`work-an-issue`, not `work-an-issue.md`), though the extension stays in the command the picker inserts.

When a project has a task file at the same path as one of the built-in Janissary tasks, the project's copy wins and the built-in one is hidden — so a project can override a shipped task by giving its own file the same name.

Picking a **Project** task inserts `execute ./ai/tasks/<path>`. Picking a **Janissary** task inserts `execute $janissary/ai/tasks/<path>` instead, since a built-in task isn't at a fixed location relative to the project.

## `$janissary`

`$janissary` is an environment variable set on every process the app spawns — a tab's shell, a harness terminal, an agent connection, and anything those start in turn. It holds the install root of the Janissary that spawned the process, so a command built around it resolves correctly no matter where that process ends up running: inside a sandboxed workspace that can't see an arbitrary absolute path, or on a remote machine where the installation that matters is the one running there, not the one your browser is connected to. Inside a [sandboxed workspace](/user-documentation/advanced-agents/workspacing), the installation's `ai/` and `scripts/` directories stay readable specifically so a Janissary task and the `run.mjs` commands it runs still work. The rest of the installation stays off limits.

## Building a multi-stage workflow

Task files can chain together into a larger loop — one that plans work, hardens the plan, then executes it — by having each stage read and write the same set of project files. See [Product development workflow](/user-documentation/workflows/product-development) for a worked example.
