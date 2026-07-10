# Task Picker

Task files are the executable prompts kept under the repository's `ai/tasks/` directory —
`build-a-feature.md`, `fix-a-small-issue.md`, `merge-change-to-master.md`, and the like. Each is a
self-contained instruction set an agent can be told to run. The task picker lists them so one can
be dropped onto the command line without typing its path by hand.

### Listing

The picker lists the `.md` files inside `ai/tasks/`, sorted alphabetically, recursing into
subdirectories. Any subdirectory appears as a row of its own, collapsed by default; its task files
become visible once it is expanded (see "Picker behavior" below). The list is read fresh from disk each time the picker opens, so
adding, renaming, or removing a task file (or subdirectory) is reflected immediately. Each file row
displays its name with the `.md` extension hidden (`fix-a-small-issue`, not
`fix-a-small-issue.md`); the extension is still present in the command inserted when the row is
picked. Directory rows show a chevron indicating their expand state (▸ collapsed, ▾ expanded) and
are indented one level deeper than their parent.

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
| Up / Down | Move the selection |
| Right | On a collapsed directory, expands it (selection stays put, its children appear beneath it); on an already-expanded directory, moves the selection to its first child; no effect on a file |
| Left | On an expanded directory, collapses it; otherwise moves the selection to the parent directory (no effect at the top level) |
| Return, or clicking a file row | Copies `execute ./ai/tasks/<path>` into the command line and closes the popup **without submitting** |
| Return, or clicking a directory row | Toggles that directory's expand state, same as Right/Left |
| Escape | Closes the popup, leaving the command line unchanged |

Selecting a task populates the command line and leaves the cursor at the end, so the command can
be supplemented (for example appending extra instructions) or edited before it is run. Nothing is
sent until Return is pressed on the command line itself. This deliberately differs from the history
picker, where Return runs the selected command immediately; it matches the command-queue picker's
behavior of making the command line the edit surface.

On a harness tab there is no command line to populate, so selecting a task instead sends
`execute ./ai/tasks/<path>` directly into that harness's terminal input, exactly as if it had been
typed there; the picker's Up/Down/Left/Right/Enter/Escape keys work the same as on any other tab.

The path is inserted verbatim, with no quoting or escaping — a task file whose name (or an
ancestor directory's name) contains a space populates the command line with that space intact,
because the populated text is freeform input for the agent, exactly as if it had been typed by
hand.

When `ai/tasks/` has no task files, the picker shows `(no tasks)`.
