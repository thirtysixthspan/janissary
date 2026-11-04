# Release connection record windows when their tabs close

**Complexity: 3/10** — one prune in the connections topic row composition plus lifecycle coverage in two existing test files; the action list, window paging, and tab ownership stay unchanged.

## Goal

Resolve PR #1916's recorded finding: "Technical debt: release a loaded record window when its connection tab closes instead of retaining it in every connections delivery for the manager's lifetime." Today `src/plugins/connections-topic.ts` holds every loaded record id in a `Map<string, number>` for the life of the `Managers` instance, and `src/plugins/connections-topic-rows.ts` removes an id only when the record itself disappears. A record tab closed long ago therefore still contributes its full prompt window to every later `connections:changed` or `state:dirty` delivery, including the list tab's payload.

## Approach and evidence

`composeConnectionsTopicData` receives the manager's requested-window map and composes the record rows (`src/plugins/connections-topic-rows.ts:6`–`:24`). It already prunes ids whose record no longer exists (`:10`–`:14`). The map is private to the connections topic (`src/plugins/connections-topic.ts:8`), so composition is the one place that can both see the map and the host's live tab list.

A connection record tab is a plugin tab whose instance key is the record id: `ConnectionRecordTabs.open` calls `openOrFocusTab(row.id, …)` (`src/plugins/connections/record-tabs.ts:13`). Docked and hidden tabs stay in `managers.tab.tabs` with their plugin record intact, so membership in that list is the right liveness test. The prune therefore builds the set of `tab.plugin.instanceKey` values from `managers.tab.tabs` and keeps a requested id only when it appears in both that set and `managers.acpRecords.rows()`.

The existing load reset and paging cap live in `connections-topic-actions.ts:28`–`:39` and are untouched: a prune only deletes a request whose tab is gone, so a reopened record starts a fresh 20-block window on its next `load` and `loadOlder` still grows by 20 up to the record's total.

Pruning by open tab means a request made before the tab exists is dropped by the very read that builds the opening payload. `ConnectionRecordTabs.open` therefore creates the tab first, requests the window once the tab is in the host's list, and refreshes that tab's payload with the loaded record. The opening payload keeps its full window, an already-open record tab is refreshed the same way, and no topic action or paging rule changes.

## Implementation steps

1. In `src/plugins/connections-topic-rows.ts`, add a helper that collects the `plugin.instanceKey` of every tab in `managers.tab.tabs`, and extend the existing prune loop so a requested id is deleted when its record is absent **or** no open plugin tab carries it as its instance key. Leave `liveTabRows`, `databaseRows`, `durableRows`, and row ordering unchanged.
2. In `src/plugins/connections/record-tabs.ts`, validate the current record, open or focus the record tab with that row, request the window once the tab exists, and, when the read-back carries a window, refresh the tab through `updateTab` with that loaded record. Keep the existing refusal for a record that is no longer current and leave the intent and action lists untouched.
3. In `src/plugins/connections-topic-rows.test.ts`, give the fixture a plugin tab keyed to the loaded record id, extend the requested-window case to keep its window while that tab is docked and hidden, and assert the next read after removing the tab has no window and drops the request. Assert a reopened tab still starts without a window until a new request, and that an unrequested record keeps none.
4. In `src/plugins/connections-topic.test.ts`, add the same keyed plugin tab to the fixture so the existing paging case runs against a live record tab, then add a lifecycle case: load shows a 20-block window, removing the tab makes the next read windowless, reopening and loading shows a fresh 20-block window, `loadOlder` still grows it to 40, and an unrequested record stays windowless.
5. In `product/specs/connections-tab.md`, state that a loaded window is held only while its connection tab is open, and that reopening loads the newest 20 blocks again.
6. Run `$janissary/scripts/run.mjs check-diff`, then promote this plan to `product/plans/complete/` and remove only the resolved entry from `product/backlog/pull-request.md`.

## Tests

- `src/plugins/connections-topic-rows.test.ts`: a requested window is projected while a plugin tab carries its record id, including when that tab is docked or hidden.
- `src/plugins/connections-topic-rows.test.ts`: removing the plugin tab prunes the request, the next composed row has no `window`, and a tab reopened with the same instance key still has none until a new request is recorded.
- `src/plugins/connections-topic-rows.test.ts`: a record with no request and no window stays windowless, and an absent record still drops its request.
- `src/plugins/connections-topic.test.ts`: load shows the newest 20 blocks, removing the plugin tab makes the next read windowless, reopening and loading shows a fresh 20-block window at the same offset, and `loadOlder` still raises it to 40.
- `src/plugins/connections-topic.test.ts`: an unrequested record stays windowless throughout the lifecycle.

## Out of scope

- The connections topic action list, the load resets, and the `loadOlder` cap.
- Record tab focus, dock, hide, close, and disposal behavior, and the connections list, popup, and intents.
- The connections list UI, popup, help pages, and user documentation.
- Pull request title or body changes, other backlog entries, and merge or history rewriting.

## Completion

- `composeConnectionsTopicData` now drops a requested window whose record has no open plugin tab instance key, in addition to dropping absent records, so closing a record tab releases its window from later deliveries while a docked or hidden tab keeps it.
- `ConnectionRecordTabs.open` creates or focuses the record tab before requesting its window, then refreshes the tab with the loaded record when the read-back carries a window, so the opening payload keeps its full window under the prune.
- Added row-composition cases for docked, hidden, closed, and reopened tabs, and a topic lifecycle case covering load, close, reopen, paging, and an unrequested record.
- `$janissary/scripts/run.mjs check-diff` passed lint, typecheck, and the server tests.
- Updated `product/specs/connections-tab.md` for the window's tab-scoped lifetime and fresh 20-block reload.
- No help or user-documentation change: neither describes how long a loaded window is retained.
- Removed only the resolved backlog entry.
