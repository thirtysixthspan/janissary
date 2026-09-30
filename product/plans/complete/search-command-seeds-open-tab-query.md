# Show a Command's Query in an Already-Open Search Tab

**Complexity: 4/10** — one counter added to the search payload and its guard, the session bumping it when a command seeds a query, the client adopting the seeded query when the counter moves, tests, and a spec sentence. No host or capability change.

## Goal

Running `search todo` while the search tab is already open searches for `todo` and fills the tab with `todo` matches, but the search bar keeps showing the previous query. The bar and the results disagree, and the next toggle click or filter edit reruns the stale query from the bar, silently replacing the results the user just asked for.

## Approach

`SearchTab` copies `payload.query` into local state once, at mount, because the bar is the user's own editing surface: re-reading `payload.query` on every update would fight typing, since the server echoes whatever query the client last sent. `SearchSession.open` seeds a command's query through `run`, which only updates the payload of a tab that is already mounted, so only the command that creates the tab reaches the bar.

The client has to tell a query the server *seeded* apart from one it merely echoed. Comparing `payload.query` with the last query the client sent would race: two quick sends and a late echo of the first would look like a seed and overwrite newer typing. So the server says so explicitly. The payload gains `seed`, a counter that `SearchSession.open` increments each time a command carries a query and that no client-started search touches. The client remembers the counter it mounted with; when a payload arrives with a different one, it puts `payload.query` in the bar and records it in the term history, exactly as a search typed in the bar would be.

Adopting the query changes the bar's value, which the bar's debounce would then send as a fresh search, restarting the scan the command already started. The tab remembers the adopted term and skips that one echo; any edit to the bar before the debounce settles clears it, so a term the user types themselves is never swallowed.

The search plugin is new in this pull request and its payload has never been released, so the field is added as required without bumping the payload schema version.

Rejected: reading `payload.query` into the bar on every update. It overwrites a partly typed query whenever a batch of rows lands.

## Implementation steps

1. **Payload.** In `src/plugins/search/shared.ts`, add `seed: number` to `SearchPayload` and check it in `isSearchPayload`. `emptyPayload` in `src/plugins/search/session.ts` starts it at 0.
2. **Seed.** In `SearchSession.open`, when the command carries a query, increment `seed` on the session's payload before opening or focusing the tab, so both a created tab and a focused one carry it.
3. **Adopt.** In `web/src/plugins/search/SearchTab.tsx`, keep the mounted `seed` in a ref. When `payload.seed` changes, set the query from `payload.query`, record it in the history, and remember it as adopted. `onQuerySearched` skips sending the adopted term once; editing the bar clears it.
4. **Fixtures.** Add `seed` to the payload fixtures in the search tests.

## Tests

- `src/plugins/search/shared.test.ts`: a payload without a numeric `seed` is refused.
- `src/plugins/search/activate.test.ts`: `search todo` increments the published `seed`; a client-started search leaves it alone; a bare `search` does not bump it.
- `web/src/plugins/search/SearchTab.test.tsx`: rerendering the mounted tab with a new `seed` and query `todo` puts `todo` in the bar and ArrowUp recalls it, without sending another search once the debounce settles; a rerender that only appends rows with the same `seed` leaves a partly typed query alone; typing a new term after an adoption still searches it.

## Spec

`product/specs/search-tab.md`, "Opening the tab": `search <phrase>` against a tab that is already open puts the phrase in the search bar, records it in the tab's term history, and searches for it, the same as typing it there.

## Out of scope

- Seeding the narrowing fields or the toggles from a command; the command carries only a phrase.
- The other entries in the pull request's backlog.
