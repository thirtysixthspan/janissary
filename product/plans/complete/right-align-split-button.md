# Right-align the split button

**Complexity: 2/10** — every eligible metadata header already renders the same shared button, so one shared alignment rule fixes all tab types.

## Goal

Keep the Split control at the right edge of every metadata header that offers it, regardless of how much metadata precedes the button.

## Approach

- Apply `margin-left: auto` to the shared `SplitTabButton`, making it consume the remaining flex-row space before itself.
- Preserve each header's existing action order and click behavior.
- Add a focused component test for the shared alignment contract.

## Implementation steps

1. Update `SplitTabButton` with the shared right-edge alignment and extend its component tests.
2. Update the tabs functional spec and existing public tabs guide to state that Split is right-aligned.
3. Promote this plan to complete and remove only the fixed backlog line.

## Tests

- `web/src/SplitTabButton.test.tsx`: the button carries the right-edge flex alignment and still invokes its callback.

## Out of scope

- Reordering the other metadata actions.
- Changing which tab types offer Split.
- Changing split-pane behavior, focus, or command bars.
