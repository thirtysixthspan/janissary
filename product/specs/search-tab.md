# Search Tab

The search tab answers the question Quick Open cannot: not *which file is this*, but *where does this
appear*. It searches the whole project for a phrase, as plain text or as a regular expression, and
lists every match in a table the user can walk with the keyboard or the mouse — each entry showing
the match in place, with the lines around it, under a header naming the file and the line. Double-clicking an entry or pressing Return on the selected entry opens that file in an editor tab with the matching line centered.

Before it, the only ways to answer that question were to type `grep` into a shell tab and read a wall
of text with no path-to-line affordance, or to search one already-open buffer at a time.

### Opening the tab

`search` opens the tab, or focuses it when it is already open — there is only ever one.
`search <phrase>` opens it and searches for that phrase straight away. **Cmd+Shift+F**
(Ctrl+Shift+F elsewhere) does the same as a bare `search`. The tab is titled **search**.

Right-clicking a text selection anywhere the default menu answers offers **Search for this**, just
above **Chat about this** (see [[context-menu]]). Choosing it does what `search <selection>` does:
it opens the tab or focuses the open one, puts the selected text in the search bar, and searches
for it, leaving the search tab focused.

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

### Which workspace it searches

Each search runs in one scope: the launch directory, or the workspace of the tab the search was started from. Three routes carry that tab: **Search for this** on a selection in it, a typed `search` or `search <phrase>` in its command bar, and Cmd+Shift+F / Ctrl+Shift+F while focus is in it. The tab a route came from decides the scope, whether its workspace is local or remote:

- a shell or harness tab that owns a workspace clone searches that clone;
- an agent monitor searches its run's workspace, and keeps that workspace after the run ends;
- an editor tab on a file inside a clone searches that clone;
- a file navigator rooted in a clone searches that clone;
- the search tab itself keeps whatever scope it already has.

Every other tab searches the launch directory.

There is still only one search tab, and it stays titled **search** whatever it searches. The header, left of the file fields, shows the scope's root in the diff tab's abbreviated form: `$root` for the launch directory, `$workspace/<name>` for a local clone, and the remote host followed by the path for a remote workspace. A route from a different scope re-scopes it, and the new scope's results replace whatever it showed. Opening a result never opens a file from a scope other than the one that produced it, even when the re-scope landed while the old scope's search was still gathering its file list. A local result still opens after a re-scope; a remote result opens only while its remote workspace is still the tab's scope, and clicking one left over from before a re-scope opens nothing. A bare `search` or the chord from a different scope searches the current query, toggles, and narrowing fields again in the new scope; from the same scope it only focuses the tab. When the query is empty, a re-scope searches nothing, clears the old scope's results, and the tab shows `Type to search`. The term history and the narrowing fields carry across a re-scope; only closing the tab forgets them, and a tab opened after one was closed starts at the launch directory.

A route from a tab whose workspace has not finished being created, or whose workspace no longer exists, opens nothing and searches nothing. The notifications feed shows `Search: the workspace of "<name>" is not ready yet.` or `Search: the workspace of "<name>" is no longer available.`, where `<name>` is the workspace label.

A route from a tab on a remote workspace whose connection the search tab cannot join — the tab rides no connection, is reconnecting, or the connection refuses — also shows `Search: the workspace of "<name>" is no longer available.` and searches nothing, not even a phrase the route carried. The search tab keeps the scope it had. If that scope was itself remote and its workspace can no longer be reached either, the tab moves to the launch directory instead, clearing the results it showed from the unreachable workspace without searching the launch directory. A search that was still running when the failed route arrived is started again in the scope the tab ends up with, so the tab settles on that search's results rather than staying in its searching state.

### What is searched

Every file under the search's scope — the launch directory or the workspace clone it was started from (see Which workspace it searches) — that gitignore does not exclude — the same set
Quick Open searches, so the two never disagree about what the project contains. Two kinds of file
are skipped: anything too large for the editor to open, and anything whose bytes are binary.

A remote workspace is listed on the remote machine, with the same gitignore rules, and each file is fetched over the workspace's connection and matched locally. The results are the same as for a local clone, but a search over a very large remote repository is slower.

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
application sits, and it is styled exactly like a shell tab's. Its prompt reads `search >`, so the
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
view. The frame looks the same whether or not the window has keyboard focus. The selected entry's left border uses the accent color only while focus is inside the result window. Moving focus elsewhere hides that color and preserves the selection; returning focus shows it again.

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

Each matching job has a one-second deadline. If one exceeds it, the search ends with an error reason;
any rows already found remain visible, and a later query can run normally.

When matching itself fails, the search ends with the reason it failed, even when the failure comes
before any file has been matched. A search is never reported as cancelled unless it actually was:
a search the user replaces or closes settles silently.

Searching works the same whichever directory the application was started from, including when it
runs from a source checkout and the project has its own, different TypeScript tooling installed. A
source checkout searches the same way on every Node.js release the application runs on, not only the
newest ones.

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

**A single click selects an entry and focuses the results.** The arrow keys and Return then act from that entry. A double click opens the clicked match; separate single clicks only select it, even if it was already selected. Rows arriving as a search runs never move the highlight, so an entry picked early is still the entry under the cursor when the next batch lands.

Opening a match puts that file in an editor tab with the matching line centered. A file already open
is focused rather than duplicated, and the line is re-centered on every request. **The search tab
stays open** with its query and its results, so a second match can be opened without searching
again.

A match from a remote workspace opens a local copy of the remote file in the editor, and saving it writes the change back to the remote workspace for as long as the search tab holds that workspace's connection. A copy that cannot be fetched opens nothing.

### Lifetime

The search tab is a live, in-memory view tab like every other plugin tab. It is not persisted and is
not restored; only its toggles outlive the application, in the config file. Closing
the tab abandons any search still running and forgets everything else it held. Only one search runs at a time: starting a new one abandons the
previous, so results from a query the user has moved on from never arrive.

While it searches a remote workspace, the search tab holds that workspace's remote session open, the way a remote diff tab or navigator does, so the session outlives the tab the search started from. It lets the session go when it re-scopes to another workspace or is closed; the session ends once nothing else holds it.

The search tab closes itself when the workspace it searches goes away: a local workspace clone is removed, or a remote workspace's session ends. It closes silently, with no notification line, abandoning any search still running, and it closes even while no browser is connected. Closing the tab the search started from closes the search tab only for a local clone, which goes away with its last tab; a remote session is held by the search tab itself and outlives that tab. A workspace that is only offline does not close the tab. When closing it would quit the application, the tab stays open.
