# Remove the Search Plugin's Unreachable Clear Intent

**Complexity: 1/10** — deleting one intent-table entry, one method, one type, one guard, and their two test cases. Nothing is added and nothing is rewritten.

## Goal

Every route a plugin declares should be a route a user can take. The search plugin declares a `clear` intent, `SearchSession` implements it, and the server tests cover it — but no file under `web/src/plugins/search/` sends an intent by that name, so the route and its test describe behavior no user can reach.

The plan's file-by-file section lists the intent table as `search`, `open`, and `clear` without ever describing a control that triggers it, and the spec `product/specs/search-tab.md` describes clearing only as a consequence of emptying the query, which already reaches the same state. So the surface is not a missing feature the plan wanted; it is a leftover.

## Approach

Delete it rather than build a control for it. The empty query already clears the query and the results, because an empty query is not searched, so a clear control would be a second way to do something the query field already does — and the plugin has no header room the plan spent on it.

The alternative was a small clear control in the tab's header. That is a product decision the plan did not make and this entry does not need to: the smallest coherent behavior is the one the plan already describes.

## Implementation steps

1. **The intent table.** In `src/plugins/search/activate.ts`, remove the `clear` entry from the `defineIntents` table, and the now-unused `isClearIntent` and `ClearIntent` imports. The table is left with `search` and `open`, which is what the client actually sends.

2. **The session method.** In `src/plugins/search/session.ts`, remove `SearchSession.clear`. Leave `emptyPayload` in place — `run` and the field initializer both use it, and the empty query still clears the tab through the `search` intent with an empty query.

3. **The shared contract.** In `src/plugins/search/shared.ts`, remove the `ClearIntent` type and the `isClearIntent` guard. Nothing else in either tree references either.

4. **The tests.** Remove the "clears the query and the rows" case from `src/plugins/search/activate.test.ts` and the `isClearIntent` describe block from `src/plugins/search/shared.test.ts`. If the removal leaves either file with no case covering clearing at all, add one that reaches the same state the way a user actually can — by running an empty query through the `search` intent and asserting the payload's query and rows are empty — so the behavior the removed method implemented stays covered by the route that replaced it.

## Tests

The two removals above are the test work. Everything else in `src/plugins/search/` must keep passing: `shared.test.ts` covers the remaining guards, `activate.test.ts` covers the command, the `search` and `open` intents, rejection, cancellation, and disposal, and none of those change.

## Out of scope

- Adding a clear control to the tab. The plan did not ask for one, and the query field already clears the tab when emptied.
- Changing what an empty query does. It clears the results rather than searching for the empty string, which is the plan's stated behavior.
