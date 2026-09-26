# Task picker

<img class="agent-float" src="/agents/malik-south.png" alt="" />

Your repository's `ai/tasks/` directory holds executable task files — self-contained instruction sets like `build-a-feature.md` or `work-an-issue.md` that an agent can be told to run. The task picker lists them so you can drop one onto the command line without typing its path by hand.

## The `Ctrl+A` picker

`Ctrl+A` (or the `tasks` command) opens a window listing the task files, with the task files in a directory listed first and its subdirectories last, each group sorted alphabetically. So the runnable tasks sit at the top and any subdirectory collects beneath them — expand one (`→` or `Return`) to see the task files inside it:

![The task picker overlay listing executable task files above the command bar, with a Project section and a Janissary section, one row selected.](/screenshots/task-picker.png)

`↑`/`↓` move the selection, `Return` on a file row inserts the task's command into the command line at the cursor, and `Escape` closes without changing anything. A row can also be clicked, which does the same as `Return`. With no task files present, the window shows `(no tasks)`.

| Key | What it does |
|---|---|
| `↑` / `↓` | Move the selection one row, skipping the section headers: they label where a source starts rather than being something you can land on |
| `→` | Collapsed directory: expand it and stay put. Already-expanded directory: move to its first task file. A file: nothing |
| `←` | Expanded directory: collapse it. Anything else: move to the directory that one sits in. At the top level: nothing |
| `Return` | Directory: expand or collapse it. File: insert the task's command into the command line at the cursor |
| `Escape` | Close, leaving the command line untouched |

Unlike the [history picker](/user-documentation/command-bar/history), `Return` here does **not** run the command immediately. It inserts the command at the cursor — leaving any text you'd already typed intact, with the cursor just after the inserted command — so you can supplement it (say, appending extra instructions) or edit it before pressing `Return` yourself to actually run it.

On a shell tab, `Ctrl+A` reaches the terminal itself instead of opening the picker, since shell tabs run interactive programs that depend on receiving that keystroke. On a harness tab there is no command line to insert into, so picking a task sends the same command straight into that harness's terminal input, exactly as if it had been typed there. Wherever the window appears, it appears over the tab you opened it from, never over some other tab.

A picker needs a screen, so a `tasks` that arrives without one does nothing at all. Another agent running `tasks`, or a [schedule](/user-documentation/automation/scheduling) firing it, gets silence rather than a window and no error either, which is worth knowing before you schedule one.

## What gets listed

<img class="agent-float left" src="/agents/idris-south-east.png" alt="" />

The picker draws from two sources, each shown as its own labeled section: a **Project** section for the current project's `ai/tasks/`, followed by a **Janissary** section for the task files that ship with the app itself. A section is omitted entirely when its source has no tasks: a project with no `ai/tasks/` shows only the Janissary section, and running inside the Janissary repository itself shows only a Project section, because there the two sources are the same directory.

Within each section, only `.md` files under `ai/tasks/` are shown, recursing into subdirectories. A subdirectory is a row of its own, carrying a chevron that points right while it is collapsed and down while it is expanded, and sitting one level in from the rows around it so the nesting reads at a glance. The list is re-read from disk about once a second, so a task file you add, rename, or remove shows up within a second or so. Each row hides the `.md` extension (`work-an-issue`, not `work-an-issue.md`), though the extension stays in the command the picker inserts.

An agent deleting a task file, or a `git checkout` moving one, can change the list while the picker is open. When it does, the highlight is put back onto a real task rather than left on a section header or past the end: a selection past the end of a shorter list drops to the last row, and one left on a header drops to the first task beneath it, or the nearest one above. The highlight keeps its position rather than its task, so it can end up on a different task than the one you were on. A key you press before that correction has been applied only puts the highlight back rather than acting on it, so `Return` never inserts a task that was not showing as selected. `Escape` closes the picker at any point.

When a project has a task file at the same path as one of the built-in Janissary tasks, the project's copy wins and the built-in one is hidden — so a project can override a shipped task by giving its own file the same name.

Picking a **Project** task inserts `execute ./ai/tasks/<path>`. Picking a **Janissary** task inserts `execute $janissary/ai/tasks/<path>` instead, since a built-in task isn't at a fixed location relative to the project. The path goes in exactly as the picker read it, with nothing quoted or escaped: a task inside a directory whose name contains a space arrives at the command line with that space intact, which is what you'd get typing it by hand.

## `$janissary`

`$janissary` is an environment variable set on every process the app spawns — a tab's shell, a harness terminal, an agent connection, and anything those start in turn. It holds the install root of the Janissary that spawned the process, so a command built around it resolves correctly no matter where that process ends up running: inside a sandboxed workspace that can't see an arbitrary absolute path, or on a remote machine where the installation that matters is the one running there, not the one your browser is connected to. Inside a [sandboxed workspace](/user-documentation/advanced-agents/workspacing), the installation's `ai/` and `scripts/` directories stay readable specifically so a Janissary task and the `run.mjs` commands it runs still work. The rest of the installation stays off limits.

A Janissary task reaches the app's own maintenance scripts the same way it was reached itself: `$janissary/scripts/run.mjs <script>`. Those scripts ship with the installation and act on the working directory of the tab running the task, so a Janissary task works against whatever project that tab has open rather than only against a checkout of Janissary. Inside a workspace, `JANISSARY_NODE` is also set, pointing at the Node binary the app itself runs on, so a hook in a project's `.claude/settings.json` can invoke a known-good `node` without having to find one on the sandboxed `PATH`.

## Building a multi-stage workflow

<img class="agent-float" src="/agents/tahir-south-east.png" alt="" />

Task files can chain together into a larger loop — one that plans work, hardens the plan, then executes it — by having each stage read and write the same set of project files. See [Product development workflow](/user-documentation/workflows/product-development) for a worked example.

## What a shipped task does when you pick it

Picking a task only inserts the command; the agent then reads that file and follows it, so what happens next depends on the task. `plan-a-new-feature`, the task that drafts a new plan, works in phases and asks you a lot along the way:

- It questions you about product decisions first: user flow, edge cases, scope, wording.
- Then it decides whether the feature needs implementation questions at all, and if so asks about those: where code lives, what it extends or replaces.
- It runs two improvement passes over the answered draft.
- A final phase settles whatever is still open, including anything the two passes raised.

Each phase is a round of numbered questions, every one with a recommended answer, and the draft is rewritten as you answer. A phase is finished when no question is left hanging, so the questioning is the longest part of the task rather than something you can skip past.
