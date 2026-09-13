# Consume context-menu clicks inside the application menu

**Complexity: 1/10** — one event handler, one focused component test, and the existing context-menu spec.

## Goal

Right-clicking an open application context menu has no effect and never exposes the browser context menu.

## Approach

Have the context-menu container prevent the native context-menu event. The event remains available to its normal menu interaction handlers, while the browser and shell-level fallback see it as already claimed.

## Implementation steps

1. Consume context-menu events on the shared menu container.
2. Add a component test that verifies the secondary-click event is prevented and the menu remains visible.
3. Add the behavior to the context-menu functional spec.

## Tests

- `web/src/shared/ContextMenu.test.tsx`: a right-click on an open menu is prevented and leaves the menu open.

## Out of scope

- Changing menu item activation or outside-click dismissal.
