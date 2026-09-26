# Task Picker

Task files are the executable prompts kept under the repository's `ai/tasks/` directory —
`build-a-feature.md`, `work-an-issue.md`, `merge-change-to-master.md`, and the like. Each is a
self-contained instruction set an agent can be told to run. The task picker lists them so one can
be dropped onto the command line without typing its path by hand.

### Planning a new feature

`plan-a-new-feature.md` first writes an initial draft from the feature record and related code. It then questions the user in phases, each phase worked as a decision tree where every settled decision unblocks the decisions hanging off it — rounds of numbered questions, each with a recommended answer, continuing without any cap on question count until that phase's frontier is empty. The first phase resolves product decisions only (user flow, edge cases, scope, wording). The second phase resolves implementation decisions only — where code lives, which existing mechanism it extends or replaces — and runs only when the feature warrants implementation questions. After the plan exists, a further phase resolves any questions still open; after the two improvement passes, a final phase resolves any new questions they surfaced. It updates the draft after each round and completes only when every identified decision is resolved; the plan has no section for retaining unresolved questions.

### Finding bugs from specs

`find-bugs.md` is an unattended research task available under `research`. It runs against the current project, builds and starts a scratch instance, and checks its behavior against named functional specs. Without names it selects up to five recently changed specs, favoring frequently used features on ties. An unknown name stops the run before building and lists the available names. The project must have functional specs and a bugs backlog, and the harness must have been launched with an attached E2E browser even for a project without a web UI. Its dependency install is gated on a supply-chain audit of the project's own lockfile, and a blocked, quarantined, or unreadable audit stops the run before anything is installed.

The task sets the workspace up by executing the project's own workspace preparation task, and gets the app running by executing the project's own launch task — the project's copy of each when it has one, the app's own otherwise. It tests whatever branch the preparation left checked out, without inspecting or rearranging the repository itself, and reaches the app only at the loopback address the launch task reports. Uncommitted work already in the tree is left where it is: the run never stashes it, and when it finds a change it cannot account for at commit time it stops rather than shipping or discarding it. Only one run works a project at a time: a second run stops before changing anything and names the run holding the lock, and a lock that outlives its run — a killed run — is cleared by hand. Web apps are exercised through the attached browser, and tools directly, with interactive behavior using an available pseudo-terminal. A project that cannot be served on loopback is reported as an environment limitation and never started. Real user state and live app sessions are never used.

Only reproduced runtime divergences are recorded. New bugs go under `development`, with a spec quote, reproduction, expected and observed results, and researched cause or an account of what was ruled out. Duplicate findings receive missing evidence in place, except declined entries, which are never changed. New entries and evidence additions share a limit of ten per run. Environment-dependent behavior is skipped, and ambiguous specs and unreproduced code defects are reported separately. A build or start failure gets one retry; a repeated product failure can be filed, but a plausible environment failure cannot. Browser loss stops testing while preserving verified findings.

The task fixes no code. It stops its scratch processes, removes scratch state, and pushes one backlog commit directly to the primary branch. A missing scratch-directory ignore rule is the only other permitted change and is committed even with no findings. It restores stashed work on early stops too. Its report names the app command and tested commit, spec scope, untested behavior, new and appended findings, unfiled observations, commit outcome, stash outcome, and completion or stop reason.

### Listing

The picker draws tasks from **two** sources: the project working directory's `ai/tasks/` and the
Janissary installation's own built-in `ai/tasks/` (the task prompts that ship with the app). The
two are shown as two labeled sections — a **Project** section first, then a **Janissary** section —
each introduced by a non-selectable section header, so the origin of every task is always clear.

Within each section the `.md` files inside `ai/tasks/` are listed, recursing into subdirectories.
Any subdirectory appears as a row of its own, collapsed by default; its task files become visible
once it is expanded (see "Picker behavior" below). Every directory lists its own task files first
and its subdirectories last, each of the two groups sorted alphabetically — so a section opens on
its directly runnable tasks, with the expandable subdirectories collected beneath them, and the
same ordering repeats inside each subdirectory once it is expanded. The list travels with the
app's state updates, and the server re-reads it from disk at most once per second rather than on
every update, because updates fire on every chunk of shell and agent output and each re-read
walks both task trees. So
adding, renaming, or removing a task file (or subdirectory) reaches the picker within about a
second, not instantly. Each file row displays its name with the `.md` extension hidden
(`work-an-issue`, not `work-an-issue.md`); the extension is still present in the command
inserted when the row is picked. Directory rows show a caret-icon chevron indicating their expand state (pointing
right when collapsed, down when expanded) and are indented one level deeper than their parent.

When the same task path exists in both sources, the **project copy wins** and the built-in copy is
hidden — a project can override a shipped task by giving a file the same name. A section whose
source contributes no tasks is omitted entirely (no empty header): a project with no `ai/tasks/`
shows only the Janissary section, and running inside the Janissary repository itself (where the two
sources are the same directory) shows only the Project section.

### Openers

`Ctrl+A` (or the `tasks` command) opens the task picker over the command line. The two openers are
equivalent. On an agent or transcript tab, or a harness tab, `Ctrl+A` opens the picker. On a shell
tab `Ctrl+A` reaches the terminal itself (shell line-start, tmux prefix) instead, since shell tabs
run interactive programs that depend on receiving that keystroke; no popup appears there.

The picker always overlays whichever tab was focused when it opened, including a harness tab —
never a different, unrelated tab.

### Picker behavior

| Input | Effect |
|---|---|
| Up / Down | Move the selection, skipping the non-selectable section headers |
| Right | On a collapsed directory, expands it (selection stays put, its children appear beneath it); on an already-expanded directory, moves the selection to its first child; no effect on a file |
| Left | On an expanded directory, collapses it; otherwise moves the selection to the parent directory (no effect at the top level) |
| Return, or clicking a file row | Inserts the task's `execute …` command into the command line at the current cursor position and closes the popup **without submitting** — a Project task inserts the relative `execute ./ai/tasks/<path>`, a Janissary task inserts `execute $janissary/ai/tasks/<path>` |
| Return, or clicking a directory row | Toggles that directory's expand state, same as Right/Left |
| Escape | Closes the popup, leaving the command line unchanged |

Selecting a task inserts the command at the command line's current cursor position rather than
overwriting the line — any text already typed is preserved, and the cursor is left immediately after
the inserted command, so it can be supplemented (for example appending extra instructions) or edited
before it is run. Nothing is sent until Return is pressed on the command line itself. This
deliberately differs from the history picker, where Return runs the selected command immediately; it
matches the command-queue picker's behavior of making the command line the edit surface.

On a harness tab there is no command line to populate, so selecting a task instead sends the same
`execute …` command (relative for a Project task, `$janissary`-anchored for a Janissary task) directly
into that harness's terminal input, exactly as if it had been typed there; the picker's
Up/Down/Left/Right/Enter/Escape keys work the same as on any other tab.

The path is inserted verbatim, with no quoting or escaping — a task file whose name (or an
ancestor directory's name) contains a space populates the command line with that space intact,
because the populated text is freeform input for the agent, exactly as if it had been typed by
hand.

When neither source has any task files, the picker shows `(no tasks)`.

The list can change while the picker is open — a task file added, renamed, or deleted on disk (by an agent, or a git checkout) reaches the open picker with the next state update. The selection is then kept on a real task row: an index left past the end of the shorter list moves to the last row, and one left on a section header moves to the first task beneath that header (or the nearest one above it when nothing follows). The selection is kept by position, not by task, so it can land on a neighbouring task. A key pressed before that correction has rendered only re-seats the selection onto the row it now shows; it does not move further, expand, or insert a task the user never saw highlighted. Escape always closes the picker, whatever the selection and even when the list has emptied.

Hovering the mouse over the row the keyboard cursor is already on keeps that row's selected
appearance — the keyboard and mouse highlighting never conflict or combine into a mismatched look.

### `$janissary`

A Janissary task's command names `$janissary`, not a path. Every process Janissary spawns — a tab's
shell, a harness terminal, an agent connection, and anything those start in turn — is given a
`janissary` environment variable holding the install root of the Janissary that spawned it, so the
command an agent receives resolves wherever that agent happens to be running. That matters in two
cases a fixed path gets wrong: an installation the sandbox would otherwise deny (see [[sandbox]]),
and a tab whose processes run on a remote machine, where the installation that counts is the one on
that machine rather than the one the browser is connected to. Project tasks stay relative to the
working directory, which is already the right anchor for a file inside the project.

The variable is spelled in lower case because it is spelled in a command line: what the picker
inserts is what a shell expands.

It also outlives the insertion. A Janissary task prompt reaches Janissary's own script runner the
same way it was reached itself — `$janissary/scripts/run.mjs <script>` — for the lint, test, commit,
and pull-request steps it directs the agent through. Those scripts ship with the installation and
act on the agent's own working directory, so a Janissary task runs against whatever project the tab
is open on rather than only against a checkout of Janissary.
