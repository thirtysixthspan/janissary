# Task picker

<img class="agent-float" src="/agents/malik-south.png" alt="" />

Use the task picker to find a workflow and add it to the command line without locating its file. Tasks are executable prompts stored under your repository's `ai/tasks/`, such as `feature/build-a-feature.md` or `work-an-issue.md`.

## The `Ctrl+A` picker

`Ctrl+A` (or the `tasks` command) opens a window listing the task files, with the task files in a directory listed first and its subdirectories last, each group sorted alphabetically. So the runnable tasks sit at the top and any subdirectory collects beneath them — expand one (`→` or `Return`) to see the task files inside it:

`↑`/`↓` move the selection, `Return` on a file row inserts the task's command into the command line at the cursor, and `Escape` closes without changing anything. A row can also be clicked, which does the same as `Return`. If neither source has any rows, the window shows `(no tasks)`. A folder under the project's `ai/tasks/` can still appear as a row when it contains no task files.

| Key | What it does |
|---|---|
| `↑` / `↓` | Move the selection one row, skipping the section headers: they label where a source starts rather than being something you can land on |
| `→` | Collapsed directory: expand it and stay put. Already-expanded directory: move to its first entry, which may be a task file or another directory. A file: nothing |
| `←` | Expanded directory: collapse it. Anything else: move to the directory that one sits in. At the top level: nothing |
| `Return` | Directory: expand or collapse it. File: insert the task's command into the command line at the cursor |
| `Escape` | Close, leaving the command line untouched |

Unlike the [history picker](/user-documentation/command-bar/history), `Return` here does **not** run the command immediately. It inserts the command at the cursor — leaving any text you'd already typed intact, with the cursor just after the inserted command — so you can supplement it (say, appending extra instructions) or edit it before pressing `Return` yourself to actually run it.

On a shell tab, `Ctrl+A` opens the picker while the command line has focus. If the shell terminal has keyboard focus, `Ctrl+A` goes to the terminal instead, since interactive programs may use that keystroke. On a harness tab there is no command line to insert into, so picking a task sends the same command straight into that harness's terminal input, exactly as if it had been typed there. Wherever the window appears, it appears over the tab you opened it from, never over some other tab.

A picker needs a screen, so a `tasks` that arrives without one does nothing at all. Another agent running `tasks`, or a [schedule](/user-documentation/automation/scheduling) firing it, gets silence rather than a window and no error either, which is worth knowing before you schedule one.

## What gets listed

<img class="agent-float left" src="/agents/idris-south-east.png" alt="" />

The picker draws from two sources, each shown as its own labeled section: a **Project** section for the current project's `ai/tasks/`, followed by a **Janissary** section for the task files that ship with the app itself. A source with no rows has no section header. If the Project source is empty and Janissary has task rows, only Janissary appears; running inside the Janissary repository shows only Project because both sources are the same directory. The Project list includes each subdirectory, even one with no `.md` task files, so an empty folder can be the only Project row. The `(no tasks)` message appears only when neither source has any rows.

Within each section, `.md` files under `ai/tasks/` are shown, recursing into subdirectories. A subdirectory is a row of its own, even when it has no task files. It carries a chevron that points right while collapsed and down while expanded, sits one level in from the rows around it, and has a small space before its name. Which directories you have expanded is remembered for the rest of your time with the app: a subdirectory starts collapsed, but once you have opened one, it is still open the next time you bring the picker up. The list is re-read from disk about once a second, so a task file you add, rename, or remove shows up within a second or so. Each task row hides the `.md` extension (`work-an-issue`, not `work-an-issue.md`), though the extension stays in the command the picker inserts.

An agent deleting a task file, or a `git checkout` moving one, can change the list while the picker is open. When it does, the highlight is moved onto a selectable row rather than left on a section header or past the end: a selection past the end moves to the last selectable row, and one left on a header moves to the first selectable row beneath it or the nearest one above. A directory row can be selected too. The highlight keeps its position rather than its task, so it can land on a different row than the one you were on. A key you press before that correction has been applied only puts the highlight back rather than acting on it, so `Return` never inserts a task that was not showing as selected. `Escape` closes the picker at any point, including after the list has emptied.

When a project has a task file at the same path as one of the built-in Janissary tasks, the project's copy wins and that built-in file is hidden. Shadowing applies to files, not folder rows: a folder with the same path can appear in both sections when both sources still have rows beneath it, and the two folders expand independently.

Picking a **Project** task inserts `execute ./ai/tasks/<path>`. Picking a **Janissary** task inserts `execute $janissary/ai/tasks/<path>` instead, since a built-in task isn't at a fixed location relative to the project. The path goes in exactly as the picker read it, with nothing quoted or escaped: a task whose own name contains a space, or that sits inside a directory whose name does, arrives at the command line with that space intact, which is what you'd get typing it by hand.

## `$janissary`

`$janissary` is an environment variable set on every process the app spawns — a tab's shell, a harness terminal, an agent connection, and anything those start in turn. It holds the install root of the Janissary that spawned the process, so a command built around it resolves correctly no matter where that process ends up running: inside a sandboxed workspace that can't see an arbitrary absolute path, or on a remote machine where the installation that matters is the one running there, not the one your browser is connected to. Inside a [sandboxed workspace](/user-documentation/advanced-agents/workspacing), the installation's `ai/`, `scripts/`, and `security/` directories stay readable specifically so a Janissary task and the `run.mjs` commands it runs still work. The rest of the installation stays off limits.

A Janissary task reaches the app's own maintenance scripts the same way it was reached itself: `$janissary/scripts/run.mjs <script>`. Those scripts ship with the installation and act on the working directory of the tab running the task, so a Janissary task works against whatever project that tab has open rather than only against a checkout of Janissary. Inside a workspace, `JANISSARY_NODE` is also set, pointing at the Node binary the app itself runs on, so a hook in a project's `.claude/settings.json` can invoke a known-good `node` without having to find one on the sandboxed `PATH`.

## Building a multi-stage workflow

<img class="agent-float" src="/agents/tahir-south-east.png" alt="" />

Task files can chain together into a larger loop — one that plans work, hardens the plan, then executes it — by having each stage read and write the same set of project files. See [Product development workflow](/user-documentation/workflows/product-development) for a worked example.

## Choosing a feature or issue task

Expand **feature** to find `plan-a-new-feature`, `build-a-feature`, `remove-an-existing-feature`, and the pull request review, testing, updating, and issue-repair tasks. Use `plan-a-new-feature` to work through decisions and draft a plan. Use `build-a-feature` when you have a ready plan to implement; it implements the plan, opens a pull request, resolves review findings, and updates the pull request to match the final code. Choose `remove-an-existing-feature` to settle the scope of removing a feature and prepare a pull request for review.

Choose `work-an-issue` for an ordinary issue on `master`. Every argument to it is issue text, including a number or PR URL. To repair a recorded pull request finding, choose `feature/work-pull-request-issue`, then append the PR number, `#number`, or GitHub PR URL and, optionally, the finding's summary. It repairs one recorded entry on that PR's branch and leaves the PR open. It needs an explicit target and does not accept a branch name or guess a PR from context.

For an open pull request, choose `review-pull-request` to record review findings, `test-pull-request` to run its testing steps in a browser and record failures, or `update-pull-request` to bring its description, plan, specs, and help in line with the settled code. Read [Review a pull request](/user-documentation/workflows/pull-request-review), [Test a pull request](/user-documentation/workflows/testing-a-pull-request), and [Update a pull request](/user-documentation/workflows/updating-a-pull-request) for those workflows.

Expand **workspace** and choose `fix-build` to diagnose and repair a failing pull request build. It accepts a PR number, URL, or head branch; without one, it uses the current branch's open pull request, or the only open pull request if there is one. Expand **research** and choose `find-bugs` to check an app against its functional specs and record bugs it reproduces. This task does not fix the bugs and needs a harness tab with an attached browser.

## What a shipped task does when you pick it

Picking a task only inserts the command; the agent then reads that file and follows it, so what happens next depends on the task. `plan-a-new-feature`, the task that drafts a new plan, works in phases and asks you a lot along the way:

- It questions you about product decisions first: user flow, edge cases, scope, wording.
- Then it decides whether the feature needs implementation questions at all, and if so asks about those: where code lives, what it extends or replaces.
- It runs two improvement passes over the answered draft.
- A final phase settles whatever is still open, including anything the two passes raised.

Each phase is a round of numbered questions, every one with a recommended answer, and the draft is rewritten as you answer. A phase is finished when no question is left hanging, so the questioning is the longest part of the task rather than something you can skip past.
