# Correct the no-older loadOlder wording and cover a non-empty short window

**Complexity: 2/10** — one sentence in a functional spec and one server test case; no source behavior, protocol, record-model, or UI change.

## Goal

`product/specs/connections-tab.md` says a record with no older blocks "keeps its current empty window", which describes only a zero-block record. A record holding between one and twenty blocks also reports `hasOlder: false`, and its window holds every block; `loadOlder` returns unchanged for it exactly as it does for the empty record. Correct the sentence to state the general no-older rule and add test coverage for a short non-empty record so a regression that clears or truncates its window on `loadOlder` is caught.

## Approach

Replace the spec sentence with wording that a record with no older blocks ignores the request and keeps its current window, including the empty window of a record with no blocks. That keeps the existing zero-block statement and extends it to the general case in one sentence.

In `src/plugins/connections-topic.test.ts`, add a case using a record with five blocks, whose `recordWindow` reports `hasOlder: false`. Push its row and plugin tab into the existing fixture, override the window mock for that id with `recordWindow(short, count)`, then:

- `load` the record and expect the window's blocks, `totalBlocks: 5`, `offset: 0`, and `hasOlder: false`.
- Call `loadOlder` twice and expect `readConnectionsTopic` to return the same blocks, total, offset, and `hasOlder` each time.
- Assert every `window` call for the record uses `ACP_RECORD_WINDOW_SIZE`.

Keep the existing zero-block, multi-block paging, reset, and window-release cases unchanged. Do not change `src/plugins/connections-topic-actions.ts` or the recorder; the implementation already behaves correctly and only the spec wording and coverage change.

## Implementation steps

1. In `product/specs/connections-tab.md`, replace "keeps its current empty window" with wording that a no-older record keeps its current window, including the empty window of a zero-block record.
2. In `src/plugins/connections-topic.test.ts`, add the short non-empty record fixture and the load plus two `loadOlder` case described above.
3. Run `$janissary/scripts/run.mjs check-diff` after each step.

## Tests

Extend `src/plugins/connections-topic.test.ts`:

- A loaded five-block record's window has all five blocks, `totalBlocks: 5`, `offset: 0`, and `hasOlder: false`.
- The first `loadOlder` leaves that window's blocks, total, offset, and `hasOlder` unchanged.
- A second `loadOlder` leaves them unchanged again.
- Every `window` call for that record requests `ACP_RECORD_WINDOW_SIZE`.
- The existing zero-block, paging, reset, and window-release cases continue to pass unchanged.

## Spec

`product/specs/connections-tab.md`: restate the no-older `loadOlder` behavior as keeping the current window generally, including the empty window of a record with no blocks.

## Docs

None: no command, flag, default, or user-visible behavior changes, and no help page or user-documentation page names this paging detail.

## Out of scope

- Changing `src/plugins/connections-topic-actions.ts`, the record model, `recordWindow`, or the recorder.
- Changing the window size, the `hasOlder` guard, or any paging behavior.
- Changing other spec text or other connections topic tests.

## Completion

- Reworded `product/specs/connections-tab.md` so a record with no older blocks keeps its current window, including the empty window of a record with no blocks.
- Added a five-block `short-id` record to `src/plugins/connections-topic.test.ts` and a case that loads it, calls `loadOlder` twice, and asserts the blocks, `totalBlocks: 5`, `offset: 0`, and `hasOlder: false` stay unchanged while every `window` call uses `ACP_RECORD_WINDOW_SIZE`.
- The focused server suite passes 10 of 10 in `src/plugins/connections-topic.test.ts`.
- `$janissary/scripts/run.mjs check-diff` passed lint, typecheck, and the server tests.
- No help or user-documentation change: no command, flag, default, or user-visible behavior changed.
- Removed only the resolved entry from `product/backlog/pull-request.md`.
