# Cover the connection record open ordering and loaded-window refresh

**Complexity: 2/10** — two existing test cases get a stateful `topicData` fixture and stronger assertions about call order and the refreshed tab payload; production code, actions, and window rules stay unchanged.

## Goal

Resolve PR #1916's recorded finding: "Cover the record-tab open ordering and loaded-window refresh so the repaired flow cannot regress untested." `ConnectionRecordTabs.open` now opens or focuses the record tab before requesting its window, then refreshes that tab through `updateTab` with the record's loaded window. The record-open cases in `src/plugins/connections/activate.test.ts` and `src/plugins/connections/command.test.ts` still assert only that both calls happened, against fixtures that never return a loaded window. A later change back to request-before-open would drop the request under the window prune and open the record tab without its window while those tests still pass.

## Approach and evidence

`ConnectionRecordTabs.open` (`src/plugins/connections/record-tabs.ts:8`–`:20`) validates the current record, calls `openOrFocusTab(row.id, …)` with the windowless current record, sends the `load` topic action, reads the record back, and, when that read carries a window, calls `updateTab(row.id, …)` with the loaded record. `ConnectionRecordTabs.update` refreshes an already-open record tab the same way after a load.

The two record-open tests run the real `ConnectionTabs` against mock capabilities, so the fixture alone decides what `topicData` returns. A mutable `loaded` flag set when the mock sees the `load` action, plus a valid `ConnectionWindow` with 20 blocks, makes the read-back carry the refreshed record exactly as the host would after a load. `mock.invocationCallOrder` then pins the open before the load, and invoking the captured `updateTab` factory pins the refreshed record and window. The current fixture's `topicAction` mock takes no argument, so both fixtures need a typed action parameter and, in `command.test.ts`, `updateTab` must be returned for inspection.

This is coverage only: no production behavior changes. The visible behavior is already stated in `product/specs/connections-tab.md` ("The tab opens on the newest 20 prompt blocks..."), and the call order is an internal mechanism, so no spec, help, or user-documentation change applies.

## Implementation steps

1. In `src/plugins/connections/activate.test.ts`, give the shared fixture's `topicAction` an action parameter and its `updateTab` a typed factory signature. Replace `opens a durable record after requesting its newest window` with a case whose `topicData` returns `recordRow` alone until the mock records the `load` action, then returns it with a valid 20-block `ConnectionWindow`; assert `openOrFocusTab` precedes the `load` topic action, the load request is unchanged, and the captured `updateTab` factory yields the record carrying that window.
2. In `src/plugins/connections/command.test.ts`, apply the same fixture and assertions to the UUID record-open case, updating its title to describe open-before-request, returning `updateTab` from the fixture, and leaving the rejection, lookup, and live-row cases intact.
3. Temporarily restore the old request-before-open order in `src/plugins/connections/record-tabs.ts`, run the two named test files, confirm the new assertions fail, then restore the current order without leaving a production diff.
4. Run `npm run test:server -- src/plugins/connections/activate.test.ts src/plugins/connections/command.test.ts` and `$janissary/scripts/run.mjs check-diff`.
5. Promote this plan to `product/plans/complete/` and remove only the resolved entry from `product/backlog/pull-request.md`.

## Tests

- `src/plugins/connections/activate.test.ts`: opening a durable record calls `openOrFocusTab` before the `load` topic action, and `updateTab` receives the refreshed record with its 20-block window after the load.
- `src/plugins/connections/command.test.ts`: the UUID record-open path calls `openOrFocusTab` before its `load` topic action and refreshes the tab with the loaded record and window, while the existing rejection, lookup, and live-row cases keep their assertions.
- The same two cases fail when `record-tabs.ts` is temporarily reverted to request-before-open, proving they pin the repaired order.

## Out of scope

- Production behavior, the window prune and paging rules, and the action list.
- Other cases in either test file, including rejection, lookup, live-row, and list/notification coverage.
- Specs, help pages, and user documentation: the existing spec already states the record tab opens on its newest 20 blocks, and call order is not user-visible.
- Pull request title or body changes, other backlog entries, and merge or history rewriting.

## Completion

- Replaced the `activate.test.ts` record-open case with a stateful fixture that returns the record alone until the mock sees the `load` action, then returns it with a 20-block window; the case now pins `openOrFocusTab` before the load and the `updateTab` factory carrying the refreshed record.
- Applied the same fixture and assertions to the UUID record-open case in `command.test.ts`, kept its rejection, lookup, and live-row cases unchanged, and returned `updateTab` from the fixture for inspection.
- Temporarily swapped `record-tabs.ts` back to request-before-open: both new cases failed on the call-order assertion, then passed again after restoring the current order with no production diff.
- `npm run test:server -- src/plugins/connections/activate.test.ts src/plugins/connections/command.test.ts` passed all 26 tests, and `$janissary/scripts/run.mjs check-diff` passed lint, typecheck, and the server tests.
- No spec change: `product/specs/connections-tab.md` already states the record tab opens on its newest 20 prompt blocks, and the call order is not user-visible. No help or user-documentation change applies.
- Removed only the resolved backlog entry, restoring the file to its comment-and-heading skeleton.
