# Place Chat about this last in the context menu

**Complexity: 3/10** — one menu assembly change, its client assertions, and the context-menu behavior spec.

## Goal

**Chat about this** is the final default-menu action and is separated from Copy and Paste by a divider.

## Approach

Keep the contributed action in its own existing menu group, but append that group after the default Copy/Paste group. The shared menu renders a divider between groups already.

## Implementation steps

1. Append the contributed action group after the default actions.
2. Update context-menu tests to assert the order and the separator.
3. Update the context-menu spec to describe the final placement.

## Tests

- `web/src/context-menu/DefaultContextMenu.test.tsx`: a contributed action is last and has one group separator before it.
- `web/src/harness/HarnessTab.test.tsx`: terminal selections place the contributed action after Paste.

## Out of scope

- Changing the available menu actions or their activation behavior.
