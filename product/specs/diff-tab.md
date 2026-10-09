# Diff Tab

The diff tab answers the question a shell cannot: not *what does `git diff` print*, but *what changed in
this workspace, and where*. It shows every change the working tree holds against `HEAD` — staged and
unstaged together, untracked files included — the way GitHub renders the files-changed view of a pull
request: one entry per changed file, its add and delete counts on the entry's header, and beneath it the
changed hunks with added lines green and removed lines red. Clicking a file's name opens that file in an
editor tab; double-clicking any line in the diff, added or removed or context, opens the file at that
line. The tab is read-only: nothing in it stages, discards, or commits, and nothing writes to the
repository's index.

Before it, the only way to inspect changes was to type `git diff` into a shell tab and read the
unified-diff text it printed, where no line was clickable and reaching the line a hunk concerned meant
re-finding it by hand in the editor.

### Opening the tab

`diff` opens the tab, or focuses it when it is already open — there is only ever one. `diff <path>`
opens it scoped to that path's changes, and a bare `diff` scopes it to the project's launch directory.
A path that is not a directory inside the project is refused before the tab opens. A second route opens
the same tab on the same terms: the **Show diff in the workspace** button in the metadata row of a
shell or harness tab that has a workspace, which scopes the tab to that tab's own environment. The
tab is titled **diff**.

The header names the directory being diffed in the application's own abbreviated form — `$root` for the
launch directory, `$workspace/<name>` for a workspace clone, `~` for a path under home.

### What the tab shows

One entry per changed file, in file path order, each entry's header carrying the file's project-relative
path, its add and delete counts, and — for a renamed file — its old path and its new one. Consecutive
entries are set off from each other by a rule and a little space, so a change set of many files reads as
separate sections. A file whose only change is its mode is an entry with no hunks. A deleted file's
header is inert, because there is no file to open, and so are its hunks. A binary file is one entry
naming it as such with no hunks, and its header opens the media tab the file's extension already opens —
the image, video, audio, or PDF tab — rather than an editor tab. A file's header scrolls with its own
content: it sits at the top of its entry and goes by with the hunks beneath it rather than staying
pinned while the list moves.

Every hunk is expanded and introduced by the range it occupies, `@@ -start,length +start,length @@`,
so the reader sees where the change begins and ends on each side and that the lines between two hunks
were skipped rather than removed. Every file entry's header carries a **disclosure chevron**: clicking
it collapses the entry to its header, and clicking it again restores exactly what was there, one entry
at a time. The chevron turns with the state, and an entry that starts collapsed — a whole-file change,
or one over the cap — opens with the same chevron, so the header's reason note and the control agree.
A double-click on the header does the same thing. Each hunk line carries its file's number on both
sides: two narrow right-aligned gutters in the unified layout, the original number blank on an added
line and the new number blank on a removed one, and in the split layout the original number in the left
column with the modified one in the right. There is no cap: a change of any size is shown whole. A line longer
than the body's width wraps at word boundaries onto as many rows as it needs, so the whole line reads
without a scrollbar and a wrapped line's number stays beside its first row.

Every added line carries a **+** beside its number and every removed line a **−**, and the number itself
takes the row's own color — a saturated green on an addition, a darker red on a removal — so a change
reads by its sign with the color as the secondary cue and a surviving line is the row without either.

Where a line was replaced rather than added or removed whole, the characters that changed carry a
stronger tint of the row's own color — the numerals in `timeout = 30` against `timeout = 60` — so the
edit reads at a glance, in the unified layout and in each of the split layout's columns. A pair of lines
too unlike each other for their alignment to mean anything carries no such mark, and neither does a
line long enough that aligning it would take longer than reading it.

An entry whose change left nothing of the old content — a file added, a file deleted, or a file rewritten
line for line — opens **collapsed**, showing only its header with a note that the entry holds the whole
file. A **double-click on the header expands it** to every line, and a further double-click collapses it
again. A click on the file's name still opens the file, expanded or not. The keyboard walk counts such
an entry's hunks wherever they happen to be shown, so **Return** opens the file at the walked hunk's
first changed line either way.

An entry whose change holds **more than 400 changed lines** also opens collapsed, its header noting how
many lines the change holds and what the cap is, and the same double-click expands it. The cap is on the
change, not the file: a large file with one changed line shows that line in full.

The tab recomputes on its own every second, so the change set stays live while files are edited around
it, and the header's **Refresh** button recomputes on demand. Re-running the command recomputes as well.
A recompute leaves the tab showing what it already shows until its result lands, so the refresh never
blanks the body: on an empty change set **No changes** stays put rather than vanishing with each
redraw. Re-scoping the tab to another directory is the one case that clears the body first, because
what it held belongs to the directory it left.

### Reading the diff

Hovering a code line highlights the line with a subtle accent tint and shows a pointer cursor in both unified and split layouts. Addition, removal, and changed-character colors remain visible beneath the highlight. Empty split alignment placeholders do not highlight or show a pointer cursor. Moving the mouse away clears the highlight; double-clicking a code line keeps its existing navigation behavior.

The header carries two view controls:

- **Unified / Split** — the change set opens in the unified layout GitHub opens in, one column per line,
  and **Split** lays the old content on one side and the new content on the other, each side carrying its
  own side's line numbers. The layout is a standing preference: the tab opens in the layout last chosen,
  and the choice carries to the next diff tab the session opens.
- **Hide whitespace changes** — **on by default**, it drops whitespace-only differences, so a
  formatter's reindent does not bury a real change. A file whose changes are all whitespace leaves the
  list, and a repository whose only changes are whitespace shows **No changes**. This choice lasts for
  the life of the tab and is not remembered across restarts.

The body is the tab's one focusable region. Clicking into it focuses it, and while it holds focus the
**down and up arrows walk the changed hunks**, hunk by hunk, across every file entry in file order,
stopping at the first and last change rather than wrapping and scrolling a file into view as the walk
reaches it. **Return** opens the file at the walked hunk's first changed line. A click on a hunk selects
it and focuses the body, so the walk continues from where the mouse left off.

Opening a file reuses the editor tab's existing de-duplication: a file already open in an editor tab is
focused rather than duplicated, exactly as every other path into the editor behaves. A double-click on a
line of a file that exists opens that line, whichever side of the change it is on; a removed line opens
the nearest line that does exist, because it has no position of its own on the new side. A deleted
file's lines answer nothing, because the file they name is gone.

### Empty and failure states

- A directory outside a git repository shows **This directory is not a git repository**.
- A directory with no changes shows **No changes**.
- A git failure shows the failure's reason as one line, and the tab keeps working — the next recompute
  runs normally.

A repository with no commits yet reads as every file added, rather than as an error.

### Lifetime

The diff tab is a live, in-memory view tab like every other plugin tab. It is not persisted and is not
restored on `--relaunch`. Closing the tab forgets what it held — the hunks it showed, the expansions and
the keyboard walk — and forgets the whitespace choice with them. The layout is the one thing kept: it
outlives the tab that chose it.
