# Copy editor selections from the default context menu

**Complexity: 3/10** — one client-side menu rule, focused context-menu coverage, and the existing behavior spec.

## Goal

An editor selection's default context menu presents Copy and Paste followed by a separated Chat about this action; an editor without a selection still presents only Paste.

## Approach

Treat editor-owned selection text like page-owned selection text for Copy, while continuing to exclude terminal selections because their selection is owned by xterm. Keep Chat about this in its existing final group so ContextMenu supplies the divider.

## Implementation steps

1. Permit the default menu's Copy action for editor selections as well as DOM selections.
2. Extend the default context-menu test to cover the selected and unselected editor menu shapes.
3. Update the context-menu and editor-tab functional specs.

## Tests

- `web/src/context-menu/DefaultContextMenu.test.tsx`: selected editor text offers Copy, Paste, and Chat about this in that order, while no editor selection leaves Paste alone.

## Out of scope

- Changing terminal copy behavior or menu ownership.
- Changing primary-click editor selection behavior.
