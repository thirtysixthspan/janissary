# Diff Tab

The diff tab answers the question a shell cannot: not *what does `git diff` print*, but *what changed in
this workspace, and where*. It shows every change the working tree holds against `HEAD` — staged and
unstaged together, untracked files included — the way GitHub renders the files-changed view of a pull
request: one entry per changed file, its add and delete counts on the entry's header, and beneath it the
changed hunks with added lines green and removed lines red. Clicking a file's name opens that file in an
editor tab; double-clicking an added or context line opens the file at that line. Removed lines are
inert because their positions no longer exist in the file. The tab is read-only: nothing in it stages,
discards, or commits, and nothing writes to the repository's index.

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
path, its add and delete counts, and — for a renamed file — its old path and its new one. The header
names what happened to the file — **added**, **modified**, **deleted**, **renamed**, **binary**, or a
mode-only change — as a word beside the counts, with the color behind the word as the second cue. A
file is **added** when it did not exist before and **modified** when the change only added or removed
lines, because an append reads as additions with no deletions and the two are not to be told apart by
counting. Consecutive
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
it, and the header's **Refresh** button recomputes on demand. Its light glyph remains visible against
the dark metadata row. Re-running the command recomputes as well.
A whitespace-only edit appears as a change, including when it is the repository's only change.
A recompute leaves the tab showing what it already shows until its result lands, so the refresh never
blanks the body: on an empty change set **No changes** stays put rather than vanishing with each
redraw. Re-scoping the tab to another directory is the one case that clears the body first, because
what it held belongs to the directory it left.

### Syntax highlighting

Unified and split diff code use the same font size and syntax colors as the editor tab. Markdown, JavaScript, TypeScript, and JSON are highlighted by file extension; unsupported extensions render as plain text. A renamed file uses its original extension on the old side and its current extension on the new side.

The old and new text are highlighted independently within each visible hunk, preserving multiline syntax across the lines available in that hunk. Omitted context is not available for determining syntax state. A side containing more than 10,000 lines or 1 MB of visible text renders as plain text to keep the tab responsive.

The active syntax theme applies to every open editor and diff tab, and switching it updates both diff layouts immediately. Syntax colors preserve change backgrounds and character marks, indentation, text selection and copying, and the existing line-opening behavior.

### Reading the diff

Hovering an added or context line highlights it with a subtle accent tint and shows a pointer cursor in both unified and split layouts. Removed lines remain inert: they have no pointer cursor or hover highlight, and double-clicking them does not open a file. Addition, removal, and changed-character colors remain visible beneath the highlight. Empty split alignment placeholders do not highlight or show a pointer cursor. Moving the mouse away clears the highlight; double-clicking an added or context line opens the file at that line.

The header carries a layout control:

- **Plus-minus icon** — switches between the unified layout, with one column per line, and the split
  layout, with old and new content in separate columns and each side carrying its own line numbers.
  The button's pressed state shows whether split layout is active, and its tooltip names the layout it
  will switch to. The layout is a standing preference: the tab opens in the layout last chosen, and
  the choice carries to the next diff tab the session opens.

The body is the tab's one focusable region. Clicking into it focuses it, and while it holds focus the
**down and up arrows walk the changed hunks**, hunk by hunk, across every file entry in file order,
stopping at the first and last change rather than wrapping and scrolling a file into view as the walk
reaches it. **j and k move between files** instead, one file at a time — the next file's first hunk and
the previous one's — stopping at the first and last file rather than wrapping. **Return** opens the file
at the walked hunk's first changed line. A click on a hunk selects it and focuses the body, so the walk
continues from where the mouse left off.

Opening a file reuses the editor tab's existing de-duplication: a file already open in an editor tab is
focused rather than duplicated, exactly as every other path into the editor behaves. A double-click on
an added or context line of a file that exists opens that line. A removed line opens nothing because
its position no longer exists in the file. A deleted file's lines answer nothing, because the file they
name is gone.

### Empty and failure states

- A directory outside a git repository shows **This directory is not a git repository**.
- A directory with no changes shows **No changes**.
- A git failure shows the failure's reason as one line, and the tab keeps working — the next recompute
  runs normally.

A repository with no commits yet reads as every file added, rather than as an error.

### Lifetime

The diff tab is a live, in-memory view tab like every other plugin tab. It is not persisted and is not
restored on `--relaunch`. Closing the tab forgets what it held — the hunks it showed, the expansions
and the keyboard walk. The layout is the one thing kept: it outlives the tab that chose it.
