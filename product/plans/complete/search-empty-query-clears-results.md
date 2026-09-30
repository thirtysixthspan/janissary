# Clear the Search Results When the Query Is Emptied

**Complexity: 2/10** — one condition in the search bar's debounce effect, client tests, and a spec sentence. No server change: the server already settles an empty query with no rows.

## Goal

Deleting the whole query after a search that found matches leaves every row of the old search on screen. The spec says "An empty query clears the results rather than searching for nothing", and the body's `Type to search` state is only reachable today from a search that found nothing, because then there were no rows to remove.

## Approach

The debounce effect in `SearchBar` calls `onSearch` only when the settled query is not blank, so an emptied query never reaches the server, the payload keeps the previous rows, and `ResultTable` renders rows whenever there are any. The server side is already right: `activate.test.ts` pins that a `search` intent with an empty query settles as done without listing the project, and `SearchSession.run` publishes it with no rows.

So the bar forwards a settled blank query too, sent as the empty string, since a query of only spaces is not something the user means to search for and would otherwise match every run of spaces in the project. The guard that skips the value the tab opened with stays, so mounting a tab never sends a search. `recordSearch` already refuses a blank term, so the history is unaffected.

## Implementation steps

1. In `web/src/plugins/search/SearchBar.tsx`, change the debounce effect to call `onSearch` for every settled change, passing `''` when the settled query is blank.

## Tests

In `web/src/plugins/search/SearchTab.test.tsx`:

- After a search, emptying the bar and letting it settle sends a `search` intent with `query: ''`, and the history walk has no blank entry.
- A bar of only spaces is sent as `''`.
- Mounting a tab with an empty query sends nothing.

## Spec

`product/specs/search-tab.md`, "How a search is run": emptying the query, or leaving only spaces, clears the rows of the previous search and shows `Type to search`.

## Out of scope

- The remaining entry in the pull request's backlog.
