# Search Tab

The search tab answers the question Quick Open cannot: not *which file is this*, but *where does this
appear*. It searches the whole project for a phrase, as plain text or as a regular expression, and
lists every match in a table the user can walk with the keyboard or the mouse — each entry showing
the match in place, with the lines around it, under a header naming the file and the line. Selecting
an entry opens that file in an editor tab with the matching line centered.

Before it, the only ways to answer that question were to type `grep` into a shell tab and read a wall
of text with no path-to-line affordance, or to search one already-open buffer at a time.

### Opening the tab

`search` opens the tab, or focuses it when it is already open — there is only ever one.
`search <phrase>` opens it and searches for that phrase straight away. **Cmd+Shift+F**
(Ctrl+Shift+F elsewhere) does the same as a bare `search`. The tab is titled **search**.

A bare `search` leaves the tab showing whatever it last searched for, so the chord lands the user
back where they were rather than discarding a query they had built up.

### What is searched

Every file under the project's launch directory that gitignore does not exclude — the same set
Quick Open searches, so the two never disagree about what the project contains. Two kinds of file
are skipped: anything too large for the editor to open, and anything whose bytes are binary.

Two fields beneath the header narrow the search further. **Files to include** and **Files to
exclude** each take comma-separated glob patterns: a bare `example` matches at any depth, a leading
`./` anchors to the project root, and a pattern naming a directory also covers everything beneath it.
An empty include searches everything; an empty exclude excludes nothing; where both name a file, the
exclude wins. A pattern that matches nothing narrows the search to nothing rather than failing it.

### How a search is run

The tab's own search bar is styled exactly like an agent tab's command bar, and the query is edited
in place there. **The results update as the query is updated** — shortly after typing stops, not on
Return — so refining a search does not mean retyping it. An empty query clears the results rather
than searching for nothing.

Three toggles in the header choose how the query is read:

- **Regular expression** — off by default, and the query is then matched as literal text, so
  punctuation in it searches for itself. On, it is a regular expression. One that will not compile is
  reported on the transcript the search was started from, and the search tab keeps working.
- **Match case** — off by default. On, the query is case-sensitive.
- **Whole word** — off by default. On, a match must sit on a word boundary rather than inside a
  longer word. It composes with the other two, including in regular-expression mode.

### The results

One entry per matching line, in file path then line order. Each entry is a dimmed header carrying
the file's project-relative path and the matching line's number, followed by the two lines above the
match, the match itself, and the two below. Context is cut short at the start and end of a file
rather than padded, and a run of matches in one file repeats the path on every entry so each is
readable on its own.

**Rows stream in while the search is still running**, so a large project starts filling the table
before it has been fully searched, and the rows already found stay on screen. The first results
arrive as soon as any file is known to match rather than only once the whole project has been read
in order.

There is no cap and no tally: the header shows no count of matches or files, and the body shows the
rows and nothing else. Three states cover everything the body can say — **Searching…** while a scan
is running (alongside whatever rows have already arrived), **`No matches found for "<query>".`** when
one settles with nothing, and the reason when a search fails.

### Navigating and opening a result

The search bar and the result table each keep their own keys, because only the focused element
receives them. Click into the table to give it focus: the arrow keys then move the highlighted row,
Home and End jump to the first and last, and `Return` opens the highlighted match. The search bar
keeps the arrow keys for moving the caret while it holds focus.

**A single click on an entry opens it** — no double click, and no separate selecting step. Rows
arriving as a search runs never move the highlight, so an entry picked early is still the entry
under the cursor when the next batch lands.

Opening a match puts that file in an editor tab with the matching line centered. A file already open
is focused rather than duplicated, and the line is re-centered on every request. **The search tab
stays open** with its query and its results, so a second match can be opened without searching
again.

### Lifetime

The search tab is a live, in-memory view tab like every other plugin tab. It is not persisted and is
not restored on `--relaunch`. Only one search runs at a time: starting a new one abandons the
previous, so results from a query the user has moved on from never arrive.
