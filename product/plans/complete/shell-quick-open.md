# Show Quick Open over a shell tab

**Complexity: 5/10.** Quick Open already owns search state and selection; the missing piece is rendering it over the active plugin tab and preserving focus.

## Goal

Cmd+P from a shell tab shows Quick Open, supports its search and selection keys, and returns focus to that shell bar when dismissed.

## Approach

Project only the existing Quick Open component into the active plugin layer. Capture the focused command bar when Quick Open opens, and disable shell input while the modal is visible.

## Implementation

1. Expose a Quick Open overlay node from the existing picker view and render it on the active plugin tab.
2. Preserve the opening element for Escape and prevent shell input while the modal is open; add regressions for visibility, focus return, and input blocking.
3. Remove the resolved backlog entry. The existing shell spec and keyboard docs already describe Cmd+P.

## Tests

Run `$janissary/scripts/run.mjs check-diff` after implementation and test changes.

## Out of scope

Other app pickers, and changing Quick Open search results or file selection behavior.
