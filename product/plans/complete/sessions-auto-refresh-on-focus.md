# Auto-refresh the sessions tab on focus

## Complexity

1/10 — one effect raising the existing `refresh` intent when the tab gains focus.

## Goal

The sessions tab already refreshes through its header button. A focused tab should refresh too, so a user returning to the tab sees current rows without pressing anything.

## Approach

In `SessionList.tsx`, extend the existing `capabilities.active` effect (which focuses the list) to also raise `refresh` each time the tab becomes the active one. The host already answers the refresh intent with a redrawn payload; the list re-renders when it arrives, so nothing else is needed. The refresh stays silent on mount transitions that do not change `capabilities.active`, keeping it a focus event rather than a render loop.

## Tests

- New in `SessionList.test.tsx`: rendering while inactive raises nothing; once active, exactly one `refresh` intent has been raised; an active tab re-rendered again does not raise again.

## Spec

- `product/specs/sessions-tab.md`: the Refresh section gains the auto-refresh-on-focus sentence.

## Out of scope

- The 7/10 server entry on channel teardown (reported, not implemented this run).
- The duplicate-row server entry.
