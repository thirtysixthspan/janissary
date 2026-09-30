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
back where they were rather than discarding a query they had built up. That holds only while the tab
is open. A search tab opened after the previous one was closed starts empty: no query, no results,
empty narrowing fields, and no term history. Only the toggles carry over, since they are remembered
anyway.

`search <phrase>` against a tab that is already open puts the phrase in the search bar, records it in
the tab's term history, and searches for it, exactly as typing it there would, so the bar never shows
one query while the results answer another. It is searched once: the bar settling on the phrase does
not start the same search again. Only the command replaces what is in the bar; results arriving for a
search already under way leave a partly typed query alone.

### What is searched

Every file under the project's launch directory that gitignore does not exclude — the same set
Quick Open searches, so the two never disagree about what the project contains. Two kinds of file
are skipped: anything too large for the editor to open, and anything whose bytes are binary.

Two fields in the header narrow the search further. **Files to include** and **Files to
exclude** each take comma-separated glob patterns. The header is a single line: the two fields
share it with the tab's split control, which sits at its right-hand end.

A pattern that says nothing about *where* to look names a file at any depth, so `*.md` and `*config*`
reach every one of them and not only the ones at the project root. A pattern that says where to look
is anchored to the project root: `src/*.ts` covers `src/` and nothing below it, `*` in it does not
cross a directory boundary, and a leading `./` or a trailing `/` states the same thing without
changing the match. A pattern that is not a wildcard at all also names a directory, and selects
everything beneath it, so `src` behaves as `src/**`.

An empty include searches everything and an empty exclude excludes nothing. Where both name a file,
the exclude wins. A pattern that matches nothing narrows the search to nothing rather than failing
it. The comma is always a separator, so neither field can narrow by a brace list.

### How a search is run

The tab's own command bar sits at the bottom of the tab, where every other command bar in the
application sits, and it is styled exactly like an agent tab's. Its prompt reads `search >`, so the
line is not mistaken for a shell's. The query is edited in place there. **The results update as the
query is updated** — shortly after typing stops, not on Return — so refining a search does not mean
retyping it. An empty query clears the results rather than searching for nothing: emptying the bar
after a search that found matches removes those rows and shows `Type to search`, and a bar holding
only spaces counts as empty. An empty query is never added to the term history.

Three toggles sit at the right-hand end of the command line, beside the query they read, and each
changes how that query is interpreted:

- **Regular expression** — off by default, and the query is then matched as literal text, so
  punctuation in it searches for itself. On, it is a regular expression. One that will not compile
  starts no search and is never shown as a search that found nothing: the tab's body gives the
  reason, in the regular expression engine's own words naming the pattern as typed (for example
  `Invalid regular expression: /[unclosed/i: Unterminated character class`), and the same line is
  written to the transcript the search tab was opened from. The plugin stays active and the next
  query that compiles searches as usual.
- **Match case** — off by default. On, the query is case-sensitive.
- **Whole word** — off by default. On, a match must sit on a word boundary rather than inside a
  longer word. It composes with the other two, including in regular-expression mode.

Changing a toggle reruns the current query at once, and so does editing either narrowing field.

**The toggles are remembered across restarts.** They are saved to `.janissary/config.json`, under the
search tab's own entry in `pluginSettings`, whenever a search runs with a different combination from
the one last saved, and the tab opens with them the next time the application starts. A search that
leaves them alone does not rewrite the file. A value missing from the file, or one that is not
`true` or `false`, reads as off without affecting the other two. If the file cannot be written, the
toggles keep working for the rest of the session and the next change tries the write again. Only the
toggles are remembered: the query, the narrowing fields, and the term history are not.

**The arrow keys walk the terms this tab has searched.** While the search term has focus, `↑` steps
back from the most recent term and `↓` steps forward again, and stepping past the newest one brings
back the term that was being typed. A term searched again becomes the most recent one rather than
appearing twice, and a partly typed term is completed from the same list. Toggling a mode or editing
a narrowing field reruns the term already in the bar and does not add it to the list again. The list
is the tab's own, and closing the tab forgets it along with the query.

### The results

The results sit in their own framed window between the header and the command line. The window
scrolls inside itself, so a long list never grows past the tab or pushes the command line out of
view. The frame looks the same whether or not the window has keyboard focus; the highlighted entry
is what shows where the keyboard is.

One entry per matching line, in file path then line order. Each entry is a dimmed header carrying
the file's project-relative path and the matching line's number, followed by the two lines above the
match, the match itself, and the two below. Context is cut short at the start and end of a file
rather than padded, and a run of matches in one file repeats the path on every entry so each is
readable on its own. A thin horizontal rule separates each entry from the next, so where one match
ends and the next begins is plain at a glance.

**The context is two lines on screen, not two lines of the file.** An entry shows the displayed line
the match sits on and two displayed lines either side of it. When the matching line is long enough
to wrap, it supplies as many of those lines as it can itself: a match deep inside a very long line
shows only the stretch of that line around the match, two displayed lines before it and two after,
and none of the neighbouring lines. Where the matching line runs out first, the neighbouring lines
make up the rest, cut off at the far end, so the lines nearest the match are always the ones that
show.

**The results stack upward, with the first match at the bottom of the window.** A search finds its
first match first, so the first entry is the one at the bottom edge and each later one is above it,
reading upward in the order the search found them. The window opens on the first match and stays
there, so a match does not scroll away while the rest of the search is still running.

**Rows stream in while the search is still running**, so a large project starts filling the window
before it has been fully searched, and the rows already found stay on screen. The first results
arrive as soon as any file is known to match rather than only once the whole project has been read
in order.

**A search stops at 250 matches.** Once it has found that many, in the order the results are
listed, it stops reading the project and settles as finished. There is no tally: the header shows no
count of matches or files, and the window shows the rows and nothing else. Three states cover everything the body can say — **Searching…** while a scan
is running (over whatever rows have already arrived), **`No matches found for "<query>".`** when
one settles with nothing, and the reason when a search fails.

### Navigating and opening a result

**Tab alternates between the search term and the results.** The two are the tab's only focusable
elements, and the whole result window is one stop however many matches it holds, so Tab moves the
focus from the term to the window and Tab again moves it back. **Shift+Tab is not affected** — it
keeps walking backwards out of the tab, which is what it is for.

The search bar and the result window each keep their own keys, because only the focused element
receives them. Click into the window to give it focus: the arrow keys then move the highlighted entry
the way they point on screen, so `↑` climbs the window to a later match and `↓` comes back down to
an earlier one, stopping at the top and the bottom rather than wrapping. The window scrolls only as
far as it must to keep that entry visible, `Home` and `End` jump to the first match and the last, and
`Return` opens the highlighted match. While the search bar has focus the
arrow keys walk the searched terms instead, and a term that has wrapped onto a second line leaves them
to the caret.

**An entry picked with the keyboard stays where it was picked.** Rows arriving as a search runs never
move the highlight and never scroll the window, so scrolling the window can only be something the
user's own arrow key did.

**A single click on an entry opens it** — no double click, and no separate selecting step. Rows
arriving as a search runs never move the highlight, so an entry picked early is still the entry
under the cursor when the next batch lands.

Opening a match puts that file in an editor tab with the matching line centered. A file already open
is focused rather than duplicated, and the line is re-centered on every request. **The search tab
stays open** with its query and its results, so a second match can be opened without searching
again.

### Lifetime

The search tab is a live, in-memory view tab like every other plugin tab. It is not persisted and is
not restored on `--relaunch`; only its toggles outlive the application, in the config file. Closing
the tab abandons any search still running and forgets everything else it held. Only one search runs at a time: starting a new one abandons the
previous, so results from a query the user has moved on from never arrive.
