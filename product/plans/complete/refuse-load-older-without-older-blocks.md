# Refuse `loadOlder` for a connection record with no older blocks

**Complexity: 2/10** — one guarded branch in an existing topic action, one focused plugin test, and one clarifying sentence in the existing connections-tab spec; no contract, recorder, or client change.

## Goal

Resolve PR #1916's recorded finding: "Functionality: refuse a connections `loadOlder` request for a record with no blocks instead of storing a zero window count."

A core session that handshakes without a prompt, or an agent run that fails before execution, has a durable record with zero blocks. Opening its connection tab requests the initial 20-block window successfully. Requesting older history then calls `managers.acpRecords.window` for that record and stores `Math.min(totalBlocks, requested + 20)`, which is `0`. The next `composeConnectionsTopicData` passes that zero count to the recorder, whose `validateWindowCount` throws `Invalid ACP record window count.` from the coalesced topic timer's unguarded read path.

## Approach and evidence

`actOnRecord` in `src/plugins/connections-topic-actions.ts` currently reads the window and then stores the smaller of `totalBlocks` and the next page size. A zero-block record has `hasOlder: false` and `totalBlocks: 0`, so the branch must refuse before mutating the requested count rather than clamping to zero.

The repaired branch reads the stored count, reads the recorder's current window for it, and returns unchanged when the window is absent or `window.hasOlder` is false. Only a window with older blocks stores a next count: the current count plus one page, clamped to `totalBlocks` and never below the page size. For every record with older blocks the next count stays at or above the initial page size, so the existing 20-block paging behavior is preserved. `load` still resets to the initial page size, `delete` still removes requested state, and every action signature stays the same. `AcpSessionRecords.window` keeps its positive-count validation as the final invariant.

## Implementation steps

1. In `src/plugins/connections-topic-actions.ts`, replace the `loadOlder` branch's unconditional store with a read of the stored count and the current window, an early return when the window is absent or has no older blocks, and a store of `Math.max(PAGE_SIZE, Math.min(window.totalBlocks, count + PAGE_SIZE))` only when older blocks exist.
2. In `src/plugins/connections-topic.test.ts`, add a case with a zero-block record whose window is produced by the recorder's real `recordWindow`, so a stored zero count reproduces the production throw. Load the record, request older blocks, assert the topic still returns the record with an empty window without throwing, then request older blocks again and assert the same empty window and the same requested page size.
3. Add one sentence to the connection-tab section of `product/specs/connections-tab.md` stating that a record with no older blocks keeps its current empty window when older history is requested.
4. Run the focused server suite for `src/plugins/connections-topic.test.ts` and the ACP records window behavior, then `$janissary/scripts/run.mjs check-diff`.
5. Promote this plan to `product/plans/complete/` and remove only the resolved entry from `product/backlog/pull-request.md`, preserving every other entry.

## Tests

- `src/plugins/connections-topic.test.ts`: add a zero-block record to the existing fixture, override its window with `recordWindow`, load it, and assert the loaded window has `blocks: []`, `totalBlocks: 0`, `offset: 0`, and `hasOlder: false`. After `loadOlder`, assert `readConnectionsTopic` does not throw and still returns that empty window, then repeat `loadOlder` and the read to prove the refusal is idempotent and never stores a non-positive count.
- Keep the existing multi-block paging, load-reset, missing-record, and window-release cases unchanged.
- `src/acp-records/manager.test.ts` and `src/acp-records/model.test.ts` continue to cover the recorder's positive-count validation and zero-block windows; do not weaken or duplicate them.

## Out of scope

- `AcpSessionRecords.window`, `recordWindow`, `validateWindowCount`, the protocol window shape, and the ACP records spec.
- The local `PAGE_SIZE` constant and the separate backlog entry that would share `ACP_RECORD_WINDOW_SIZE`.
- Client scroll behavior, the connection-tab window contract, `load`, `delete`, and any other topic action.
- Help or user-documentation changes; neither documents the zero-block refusal edge case, and the existing paging descriptions remain accurate.
- Pull request title or body changes, other backlog entries, and merge or history rewriting.

## Completion

- Changed the `loadOlder` branch to read the stored count and the current recorder window, return without mutating the requested count when the window is absent or `hasOlder` is false, and only then store `Math.max(PAGE_SIZE, Math.min(window.totalBlocks, count + PAGE_SIZE))`.
- Left `load` resetting to the initial page size, `delete`, every action signature, and `AcpSessionRecords.window`'s positive-count validation unchanged.
- Added a zero-block record case to `src/plugins/connections-topic.test.ts`, backed by an open record tab and the recorder's real `recordWindow`. After `load`, it requests older blocks, asserts the topic still returns the same empty window without throwing, repeats the request and read to prove idempotence, and asserts every window read for the record uses the 20-block page size.
- Kept the existing multi-block paging, load-reset, missing-record, and window-release cases unchanged.
- Focused server tests passed: 59 tests across `src/plugins/connections-topic.test.ts`, `src/acp-records/manager.test.ts`, and `src/acp-records/model.test.ts`. `$janissary/scripts/run.mjs check-diff` passed lint, typecheck, and the diff-scoped server suite.
- Added the zero-block paging refusal to `product/specs/connections-tab.md`.
- No help or user-documentation change: neither documents the zero-block refusal, and the existing paging descriptions remain accurate.
- Removed only the resolved backlog entry, leaving four entries in `product/backlog/pull-request.md`.
