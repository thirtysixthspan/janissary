# Key Connection-History Blocks by Absolute Position

**Complexity: 1/10** — one React key expression and one focused rerender test; no hook, server, schema, spec, or visible-behavior change.

## Goal

Keep each connection-history block's React identity stable when older pages are prepended, so a reader's expanded thought or tool entry, text selection, and DOM state survive paging instead of remounting with the whole history.

## Approach

`ConnectionHistory` currently keys each block by `${block.startedAt}:${index}`, where `index` is relative to the current window. Loading an older page prepends blocks, shifting every existing index and therefore changing every key; React unmounts and remounts each block, closing any expanded `<details>` even though `useConnectionHistoryScroll` restores `scrollTop`.

`ConnectionWindow.offset` is the server-supplied zero-based absolute position of the first block in the window: `recordWindow` computes `offset = Math.max(0, record.blocks.length - count)` and renders `record.blocks.slice(offset)`. The absolute position of a rendered block is therefore `window.offset + index`, which stays the same for an existing block when older blocks are prepended. Use that expression as the block key.

Entry keys stay as they are, relative within their block (`${entry.timestamp}:${entryIndex}`), because entries are not reindexed by prepending history. Do not change the scroll hook, the server window, the shared types, or the spec. The spec already describes the observable history and paging behavior and does not name React keys.

## Implementation steps

1. In `web/src/plugins/connections/ConnectionHistory.tsx`, change the `<article className="connections-block">` key from `${block.startedAt}:${index}` to `window.offset + index`; leave the entry keys and all rendering untouched.
2. Extend `web/src/plugins/connections/ConnectionTab.test.tsx` with a case that renders a record whose window is at `offset: 2` with one existing block, expands that block's thought entry, then rerenders the same component with a window at `offset: 0` whose blocks are two prepended blocks followed by the unchanged existing block. Assert the thought's `<details>` is still open and that the rendered `.connections-prompt` order is oldest to newest.
3. Run the focused client suites for `ConnectionTab` and `useConnectionHistoryScroll`, then `$janissary/scripts/run.mjs check-diff`, and fix any failures.

## Tests

- `web/src/plugins/connections/ConnectionTab.test.tsx` — after rerendering from `offset: 2` to `offset: 0` with two prepended blocks, the previously expanded thought entry remains open and block prompts render in oldest-to-newest order.
- Existing `web/src/plugins/connections/useConnectionHistoryScroll.test.tsx` viewport-preservation cases stay unchanged and passing.
- Existing `ConnectionTab` cases for collapsed-by-default thoughts and tools stay passing.

## Out of scope

- Changing `useConnectionHistoryScroll`, its tests, or the scroll-restoration behavior.
- Changing `recordWindow`, `ConnectionWindow`, the payload schema, or any server code.
- Changing entry keys within a block.
- Spec, help, or user-documentation edits; the Proposal requires leaving the spec untouched and the visible history contract is unchanged.
