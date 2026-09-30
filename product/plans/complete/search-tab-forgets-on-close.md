# Forget the Search Tab's State When It Is Closed

**Complexity: 2/10** — the search session resets its payload inside the tab factory, which the host runs only when it builds a new tab; server tests and a spec sentence. No client change.

## Goal

Closing the search tab and opening it again, with Cmd+Shift+F or a bare `search`, brings back the previous query, its rows, and that query in the arrow-key history. The spec says "The list is the tab's own, and closing the tab forgets it along with the query."

## Approach

`SearchSession` lives as long as the plugin, not the tab. `open` hands its retained payload to the `openOrFocusTab` factory, and `SearchTab` seeds its bar and its history from whatever payload it mounts with, so a new tab inherits the closed one's state.

The factory is the one place that knows a tab is being built rather than focused: the host checks the instance key first and runs the factory only when no tab with it is open. So the reset belongs there. It cancels any scan still in flight and starts the payload afresh: an empty query (or the command's phrase), no rows, empty narrowing fields, and the `done` state. Two things carry over:

- **The toggles**, read from the current payload rather than from the last successful save. They are remembered across restarts by design, so a tab closed and reopened in the same session must not lose them.
- **The seed counter**, which only ever moves forward, so a tab mounted from it never mistakes an old value for a new command.

A tab that is still open is focused without the factory running, so "A bare `search` leaves the tab showing whatever it last searched for" still holds for it.

## Implementation steps

1. In `SearchSession.open` in `src/plugins/search/session.ts`, move the payload construction into the factory: cancel the scan, then set the payload to `emptyPayload()` carrying the current modes, the current seed, and the command's query, and return it.

## Tests

In `src/plugins/search/activate.test.ts`, with an `openOrFocusTab` fake that runs the factory as the host does for a new tab:

- After a search with a narrowing field set, a bare `search` builds a tab with an empty query, no rows, empty narrowing fields, and the modes still in force.
- A scan still in flight when the tab is rebuilt publishes nothing more.
- `search todo` builds a tab carrying `todo` and searches for it.

And with a fake that does not run the factory, as for a tab that is still open: a bare `search` leaves the narrowing field and the query of the next search untouched.

## Spec

`product/specs/search-tab.md`, "Opening the tab" and "Lifetime": a search tab opened after the previous one was closed starts empty (no query, results, narrowing fields, or history) and keeps only the toggles.

## Out of scope

- Keeping a closed tab's query for the next one; the spec says closing forgets it.
