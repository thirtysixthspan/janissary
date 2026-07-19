# Quick Open

A keyboard-first "jump to any file in the project" finder, independent of the file navigator.

### Opening

`Cmd+P` opens a modal Quick Open window floating above the command bar, with its own text input
focused immediately. The searchable set is every file under the project's launch directory,
gitignore-aware — `node_modules` and anything else `.gitignore` covers never appear. The window
appears immediately even before that list has finished loading; while it's still loading, the
input stays live and the body shows a **Searching…** state.

### Filtering

Typing narrows the list with a case-insensitive fuzzy subsequence match against each file's
project-relative path: the typed characters must appear in order somewhere in the path, but not
necessarily consecutively (typing `wsprof` can surface `web/src/ProfilePicker.tsx`). A match on the
filename itself outranks a match found only in the directory portion of the path, and matches whose
characters are consecutive or fall right after a `/`, `-`, `_`, `.`, or camelCase boundary rank
higher than scattered ones; a shorter path breaks a tie. The list is capped to the top 10
best-scoring matches and sorted best first. Each row shows the matched filename plainly, with its containing
directory dimmed beside it. An empty query shows a "type to search"
hint with no rows. A query that matches nothing shows **No matching files**, and `Return` does
nothing in that state.

### Selecting a file

`Up`/`Down` move the highlighted selection. `Return` opens the highlighted file in an editor tab
(the same editor-tab open/de-dupe behavior as any other way of opening a file) and closes the
window, regardless of which tab's directory was active when Quick Open was opened. `Escape` closes
the window without opening anything and returns focus to the command bar. A row can also be clicked
to open it directly.

### Data source

Opening the window fetches the project's file list once; typing re-filters that in-memory list
without any further requests. Re-opening the window re-fetches the list, so it reflects the current
on-disk state. A file list that arrives after the window has already been closed is discarded rather
than reopening or repopulating it.
