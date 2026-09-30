# Make a Click on a Search Result Go Through the Shared Selection Once

**Complexity: 2/10** — one handler collapsed into one, one prop renamed, and two client tests driven through the new path plus one added. No behavior change and no new module.

## Goal

A click on a result row should go through one path, not two.

`useResultSelection` already wraps `useListSelection`'s `rowClicked` with a decision function returning `{ selected: index, opens: true }` — the single-click-opens departure from the shared default that a result list needs. But `SearchTab` ignores that return value. `ResultTable`'s `onClick` calls a handler that invokes `onSelect` (which calls `rowClicked`) and `onOpen` (which sends the open intent) as two independent steps, so the shared selection path and the plugin's own open path both run for one click.

The two paths cannot drift apart as written: `rowClicked` also focuses the list (`listRef.current?.focus()`), which is why clicking a row works at all, and the open is sent by a separate prop that the shared selection knows nothing about. A future change to either has to know the other is already there.

## Approach

Use the shared selection's own answer, as `SessionList` and `ConversationList` already do. The `opens: true` in the decision function becomes what authorizes the open, rather than the caller assuming the open always happens.

## Implementation steps

1. **One click handler on the table.** In `web/src/plugins/search/ResultTable.tsx`, the `SearchRow` component takes `onOpen: () => void` and calls it from `onClick`. Replace that with a single `onClick(index)` on `ResultTable` itself, so the row's handler no longer needs a per-row closure that knows the open policy. The `onSelect` prop goes away — the selection is the click handler's business, not the table's.

2. **The one handler in the tab.** In `web/src/plugins/search/SearchTab.tsx`, replace the `onSelect`/`onOpen` pair passed to `ResultTable` with a single `onRowClick(index)` that calls `rowClicked(index)` and sends the open intent when it answers true. `onOpen` stays for the `Return` key, which legitimately opens without a click and so has no click to go through.

3. **Keep the streaming guarantee.** The clicked row must still end up highlighted, because `useListSelection` clamps the selection into whatever list arrived and streaming rows append rather than replace. That behavior is unchanged by this work and must not be lost.

## Tests

- `web/src/plugins/search/SearchTab.test.tsx`: "opens a match on a single click" drives the new single path and still asserts the open intent fires once with the clicked row's path and line.
- The same file's "does not move the selection as streaming rows arrive beneath it" drives the new path and still asserts the clicked row is the one opened after more rows arrive.
- Add a case asserting a single click both opens the match and leaves that row highlighted, which is what the two-call arrangement provided today.
- Every other case in that file is unaffected: the keyboard cases never involve a click, and the toggle and filter cases assert on the `search` intent.

## Out of scope

- Double-click behavior. A result list opens on one click by design; nothing here changes that.
- What `Return` does. It opens the highlighted row without a click and keeps its own path.
- The shared list-selection rule itself. `useListSelection` and `nextListSelection` in `web/src/shared/list-selection.ts` are unchanged.
