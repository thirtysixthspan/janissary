# Preserve the connection-history viewport when new blocks arrive during paging

**Complexity: 3/10** — one directional comparison in the history-scroll hook, one focused rerender test, and a clarifying sentence in the existing connections-tab spec; no server, schema, payload, or component-props change.

## Goal

Resolve PR #1916's recorded finding: "Plan fidelity: preserve the connection-history viewport when new prompt blocks arrive while an older page is loading."

Today `web/src/plugins/connections/useConnectionHistoryScroll.ts` treats any offset change after an older-page request as the arrival of that older page. When a new prompt block increases `window.offset` before the older window arrives, the hook applies the stored height delta and clears the pending restoration, so the reader at the top is pushed down by the new block and the eventual older page no longer restores their place.

## Approach and evidence

`ConnectionWindow.offset` is the server-supplied zero-based absolute position of the first block in the window: `recordWindow` in `src/acp-records/model.ts` computes `offset = Math.max(0, record.blocks.length - count)` and returns that suffix. New prompt blocks raise `totalBlocks` without raising the requested count, so the offset rises; an older page raises the requested count, so the offset falls. The first rendered absolute position is therefore exactly `window.offset`.

`requestOlder` stores `{ height: element.scrollHeight, offset }` when it asks for an older page. The effect currently restores whenever `restore.offset !== offset`. Make the test directional: restore only when `offset < restore.offset`, which is the only update that prepends older history. When `offset >= restore.offset`, refresh `restore.height` to the current `scrollHeight` so the new block's height becomes part of the baseline instead of the delta, and leave the restoration pending for the later older window. An unchanged offset keeps the existing streamed-growth baseline refresh. `undefined` offsets do not restore.

No extra parameter is needed from `ConnectionTab`: the hook already receives the first rendered absolute position and has the baseline offset recorded at request time. `window.totalBlocks` and the first block's `startedAt` add nothing to this comparison. The guard ref (`requestedOffset`), the follow threshold, programmatic-scroll detection, and the rejection handler's clearing of both refs stay as they are.

## Implementation steps

1. In `web/src/plugins/connections/useConnectionHistoryScroll.ts`, change the restoration branch to require a defined offset lower than `restore.offset`; keep the existing baseline refresh for non-restoring updates, then the active/follow handling and the request-guard reset.
2. Add the new case described under Tests to `web/src/plugins/connections/useConnectionHistoryScroll.test.tsx`, keeping every existing case.
3. In `product/specs/connections-tab.md`, extend the existing viewport-preservation sentence so it names new prompt blocks, not only streamed activity.
4. Run the focused client suite for `useConnectionHistoryScroll.test.tsx`, then `$janissary/scripts/run.mjs check-diff`, and fix any failures.
5. Promote this plan to `product/plans/complete/` and remove only the resolved entry from `product/backlog/pull-request.md`, restoring the comment-and-heading skeleton because it is the only entry.

## Tests

- `web/src/plugins/connections/useConnectionHistoryScroll.test.tsx`: request an older page at one offset, rerender with a larger offset and taller content for a new prompt block, assert `scrollTop` stays at the top, then rerender with the older window at a lower offset and assert the viewport moves by only the prepended height, not the new block's height.
- Existing streamed-text growth, inactive-view, page-deduplication, rejection-retry, and older-page restoration cases stay unchanged and passing.

## Out of scope

- `ConnectionTab`, `ConnectionWindow`, the server window calculation, the payload schema, and any new hook parameter.
- The active/follow threshold, programmatic-scroll detection, and rejection handling.
- Help or user-documentation changes; neither describes the internal paging mechanics.
- Pull request title or body changes, other backlog entries, and merge or history rewriting.

## Completion

- Made the scroll hook restore only when the first rendered absolute position moved toward older history (`offset < restore.offset`), and made an increased offset refresh the stored baseline height while keeping the restoration pending.
- Added a history-scroll case proving a new block's larger offset and taller content leave `scrollTop` at the top, and that the later older window restores only the prepended height. The same case fails against the previous condition with `scrollTop` moved by the new block's height.
- Focused client suite passed for `useConnectionHistoryScroll.test.tsx` (9 tests); `$janissary/scripts/run.mjs check-diff` passed lint, typecheck, and web tests.
- Updated the existing connections-tab spec sentence to name new prompt blocks alongside streamed activity.
- No help or user-documentation change: neither describes the paging mechanics.
- Removed only the resolved backlog entry and restored the file's comment-and-heading skeleton.
