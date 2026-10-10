# Focus launcher rows after state changes

**Complexity: 4/10** — use the host's active state as the focus decision and cover external focus and row reordering.

The launcher remembers a confirmed row by its numeric position. That position can refer to a different tab after a same-length tier reorder, and confirmation does not clear when the host focuses another tab. The row payload already carries the host's current `active` fact.

## Goal

Clicking any inactive tab row sends a focus request, including after external focus changes or a same-length reorder. Clicking the currently active row remains a no-op.

## Approach

1. Change the tab row click decision to use the row's current `active` value instead of the selection hook's confirmed index.
2. Update client tests to acknowledge focus through an active payload before asserting repeat clicks are suppressed; cover external focus and same-length tier reordering.
3. Keep selection, keyboard activation, and unread dwell ownership unchanged.
4. Confirm the existing launcher spec still describes the one-click navigation behavior and run diff-scoped checks.

## Tests

- `web/src/plugins/launcher/LauncherTab.test.tsx`: focus a needs-input row, rerender it as active, then rerender it inactive after external focus and click again at the same index.
- The same test file: reorder same-length tiers so a different inactive row occupies the previously confirmed index, then click it.
- Preserve first-click focus and keyboard Enter activation coverage.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Out of scope

- Changing the shared list selection hook or the command rail's two-click rule.
- Changing the server-owned unread dwell.
