# Put the Search Command Bar at the Bottom, Label It, and Stack Results Upward

**Complexity: 3/10** — the tab's three children reorder, one prop is set, and one declaration makes
the result window stack upward. No server, no payload, no new module.

## Goal

Three things about the search tab's shape are wrong, and they are one mistake: the tab was laid out
top-down when it should be laid out the way a command line is.

**The command bar is at the bottom**, where every other command bar in the application is. The agent
tab renders its metadata row, then its body, then `CommandArea` last, so the prompt is always at the
bottom edge under whatever the tab is showing. The search tab has the bar wedged between the header
and the results, so the prompt floats in the middle of the page and the results run off the bottom.

**The bar says what it is.** It shows a bare `>` with nothing to say the line is a search, so it is
indistinguishable from a shell prompt at a glance. The shell's own `label` slot already exists for
exactly this — the agent bar puts `queue` there — and `search >` is what it takes.

**Results stack upward, first match at the bottom.** A search produces its first match first, and a
list that grows downward puts the result the scan found first at the top of a window that is about
to be pushed off the bottom. Growing upward puts the first match at the bottom edge, where it stays
visible while the rest of the results arrive above it.

## Approach

All three are the arrangement, and the arrangement is one reordering plus one declaration.

**The bar moves last in the DOM.** `SearchTab` already lays out as a column with the result window
carrying `flex: 1`, so moving `SearchBar` after it puts the bar at the bottom edge without touching
the flex rules. This is the same order the agent tab's body uses.

**The label is the existing slot.** `CommandBarShell`'s `label` renders text before the prompt glyph,
so passing `search` produces `search >` with no markup of its own and no change to the shell. The
shell stays a shell: it does not learn that a line can be a search.

**The result window is a reversed column.** `column-reverse` puts the first row in the array at the
bottom and each later row above it, which is the order the scan produced them in, so the rendering
order is the arrival order and nothing is re-sorted or duplicated. The reverse direction also puts
the scroll origin at the bottom, so the window opens on the first match and, as rows stream in
above, stays there — the first match does not scroll out from under the reader as the scan runs.
Which rows exist, which one is selected, and which one `Return` opens are all still array indices, and
none of them move.

The status line — **Searching…**, **No matches found**, and the failure reason — keeps its place as
the last child of the table. In a reversed window that puts it at the top of the list, reading as a
header over the results, and with no results at all it is the only line in the window, sitting just
above the command bar.

## Implementation steps

1. **The bar goes last.** In `web/src/plugins/search/SearchTab.tsx`, render `SearchBar` after the
   `.search-results` div rather than before it. Nothing else about either changes: the bar keeps its
   props, its auto-focus, and its debounced search, and the results keep the list ref, the tab index,
   and the key handler.

2. **The label.** Pass `label="search"` through `SearchBar` to the shell, so the line reads
   `search >`. `SearchBar` takes it as a property rather than hard-coding it, because the bar owns no
   opinion about what its line is called.

3. **The reversed window.** In `web/src/plugins/search/search.css`, make `.search-results` a
   `column-reverse` flex column. `overflow-y: auto` and `min-height: 0` stay exactly as they are —
   the window was already scrollable and already shrinkable, and this only says which end it grows
   from.

## Tests

- `web/src/plugins/search/search-style.test.ts`: pin the reversed column on `.search-results` and that
  it keeps `overflow-y: auto` and `min-height: 0` — a window that stopped being scrollable, or that
  refused to shrink inside the column, would look like a search that stopped updating.
- `web/src/plugins/search/SearchTab.test.tsx`:
  - a case asserting the command bar is the tab's last child, so it sits at the bottom edge the way
    every other command bar does, and the results window is the child before it;
  - a case asserting the line reads `search >`, by way of the shell's own `label` slot, so the two
    cannot drift from each other;
  - a case asserting the rows are emitted in the order the scan produced them — first row first in
    the DOM — which is what makes the reversed window read bottom-up rather than shuffling them.
    The existing row-content and row-order assertions already depend on this and stay as they are.
- Every other case in the file is unaffected: they query rows by class, drive keys at
  `.search-results`, and find the bar by its accessible name, none of which moved.

## Out of scope

- The order the server produces rows in, and every `scan.ts` and `search-files.ts` test. The scan
  still reports file path then line, which is what makes the reversed window read the way a search
  is expected to read.
- The selection, its keys, and the scroll-into-view the shared list selection already performs —
  entry six of this backlog covers verifying the latter.
- Whether the bar is focused when the tab opens, and the debounce on the query. Neither moves.
- The tab's padding around the bar. It is inset today and stays inset; only its position changes.
