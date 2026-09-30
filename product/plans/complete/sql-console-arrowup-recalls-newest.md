# `ArrowUp` in the SQL console recalls the statement typed last

Issue: Make `ArrowUp` in the SQL console recall the statement typed last, not the first one typed —
`SqlConsole` keeps its recall list newest-first and hands it to `useCommandBarKeys`, whose `history`
parameter is documented as "Walked by ArrowUp/ArrowDown, oldest first" and which
`useCommandHistoryRecall` reads at `history[history.length - 1]`, so the walk starts at the oldest
entry and runs forwards. The same list is the ghost overlay's source, and
`findGhostSuggestion` walks backwards from its end, so the completion offered while typing was drawn
from the wrong end of it too.

Complexity: 2/10

## Goal

One `ArrowUp` recalls the statement typed last, and the ghost completion offers the most recent
statement that extends what is typed. Both fall out of handing the hook the list in the order its
contract names, so the console's own state changes order rather than the shared hook's behaviour.

## Approach

- `web/src/plugins/sql/SqlConsole.tsx`: `send` appends rather than prepends —
  `[...previous.filter((entry) => entry !== text), text].slice(-HISTORY_LIMIT)`. Re-sending a
  statement still moves it to the newest end, and the cap still drops the oldest, because dropping
  from the front of an oldest-first list is dropping the oldest statement.
- Nothing in the shared keymap moves. `useCommandBarKeys.history` is documented as oldest-first and
  two consumers already rely on that — `useCommandHistoryRecall` indexes its end for "the newest" and
  `findGhostSuggestion` walks backwards for "the most recent match" — so this is the console
  conforming to a contract rather than the contract moving to meet it. `ConversationComposer` already
  passes its list in that order.
- `HISTORY_LIMIT`'s cap is unchanged at fifty, which is what the spec promises the walk covers.

## Implementation steps

1. `web/src/plugins/sql/SqlConsole.tsx`: store the recall list oldest-first.
2. `./scripts/run.mjs check-diff`.

## Tests

- `web/src/plugins/sql/SqlTab.test.tsx` (the console is rendered through `SqlTab`, which is where its
  existing run/history tests live):
  - after sending two statements, one `ArrowUp` puts the **second** in the field, and a second
    `ArrowUp` the first — the regression, which is the walk starting at the wrong end.
  - `ArrowDown` after one `ArrowUp` returns to the draft that was in the field, since the walk's
    other half is only correct if the first half is.
  - the ghost overlay offers the most recent statement that extends what is typed: type the shared
    prefix of two statements and the one sent last is the one offered. This is the same list read by
    the other consumer, and it was wrong in the same direction.
  - re-sending a statement recalls it first, so the list is still a history rather than a log.

## Out of scope

- `useCommandBarKeys`, `useCommandHistoryRecall`, and `findGhostSuggestion`, whose oldest-first
  contract is what every other caller already meets.
- The statement history panel beside the bar, which is driven by `payload.log` — already newest first,
  and a different list from the console's own recall.

## Specs / docs

`product/specs/sql-database.md` — no change: "Arrow keys walk back through the last fifty statements
typed in this tab" is what this makes true. No `help.md` or `documentation/user-documentation/` page
describes the console's recall keys, so no documentation change.
