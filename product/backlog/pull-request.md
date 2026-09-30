<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Report the click on a search result once, since the row handler selects and opens through two separate calls.

Existing Issue: A click on a result row in `web/src/plugins/search/ResultTable.tsx` fires `onOpen`, and the handler `SearchTab` passes to it calls both `onSelect(index)` and `onOpen(index)`, where `onSelect` runs `rowClicked` from `useResultSelection` and `onOpen` sends the open intent, so the shared list-selection click path and the open path both run for one click. Severity: 3/10

Existing Risk: 3/10 - Two selection side effects for one click means the click-focus behavior of the shared list selection and the plugin's own open behavior can drift apart, and any future change to either has to know the other is already there.

Proposal Risk: 1/10 - One call per click, with the existing interaction tests still covering the observable behavior.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1481: make a click on a search result go through the shared selection once". `useResultSelection` in `web/src/plugins/search/useResultSelection.ts` already wraps `useListSelection`'s `rowClicked` with a decision function that returns `{ selected: index, opens: true }` — the single-click-opens departure from the shared default — but `SearchTab` does not use that return value; instead `ResultTable`'s `onClick` calls a handler that invokes `onSelect` (which calls `rowClicked`) and `onOpen` (which sends the intent) as two independent steps. Make the click go through `rowClicked` once and use its boolean result to decide whether to send the open intent, which is how `SessionList` and `ConversationList` already do it: have `ResultTable` call a single `onRowClick(index)`, and have `SearchTab` implement it as `if (rowClicked(index)) onOpen(index)`. The `opens: true` in the decision function is then what authorizes the open, rather than the caller assuming it. Update the two existing client tests in `web/src/plugins/search/SearchTab.test.tsx` that cover clicking — "opens a match on a single click" and "does not move the selection as streaming rows arrive beneath it" — to drive the single path, and confirm both still assert the open intent fires once. Add a case asserting the clicked row is also the highlighted row, which is the behavior the two-call arrangement provides today and which must not be lost.
