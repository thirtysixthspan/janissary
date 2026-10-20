# Keep Ctrl+left-click in the file navigator from opening the context menu

Complexity: 2/10 (threshold: 7).

## Goal

A Ctrl+left-click on a file navigator row adds or removes that row from the selection, the same as Cmd-click, and opens no menu. Today macOS turns a Ctrl+left-click into a `contextmenu` event, so the press toggles the selection and then the row's context menu opens on top of it.

## Approach

The row's mouse-down handler already treats Ctrl as a toggle modifier. The fix lives in the row's context-menu handler in `use-file-navigator-row-events.ts`: a `contextmenu` event whose `button` is the primary button and whose `ctrlKey` is held is a Ctrl+left-click, not a right-click. For that event the handler calls `preventDefault()` so neither the browser's menu nor the app's default menu answers it, and returns without opening the row menu. A genuine right-click (secondary button) keeps opening the menu whether or not Ctrl is held, and a keyboard-raised menu (primary button, no Ctrl) is unaffected.

The handler reports whether it opened a menu, and `FileNavigatorRows.tsx` only issues the plugin selection-action query when it did, so a Ctrl+left-click inside a multi-row selection sends no `fileNavigatorSelectionAction` request.

## Implementation steps

1. In `web/src/file-navigator/use-file-navigator-row-events.ts`, make `onRowContextMenu` return a boolean. When `event.ctrlKey` is held and `event.button === 0`, prevent the default and return `false`; otherwise prevent the default, set the pending menu, and return `true`. Extend the existing comment above the handler with one sentence explaining the macOS Ctrl+left-click case. Run `$janissary/scripts/run.mjs check-diff`.
2. In `web/src/file-navigator/FileNavigatorRows.tsx`, call `rowEvents.onRowContextMenu(row, event)` first and run `selectionAction.query(...)` only when it returns `true`. Run `$janissary/scripts/run.mjs check-diff`.
3. Add the tests below, update the spec, move this plan to complete, remove the issue from `product/backlog/issues.md`, and run `$janissary/scripts/run.mjs check-diff`.

## Tests

In the `row context menu` block of `web/src/file-navigator/FileNavigatorTab.test.tsx`:

- A Ctrl+left-click (mouse down then `contextmenu`, both with `ctrlKey` and `button: 0`) on a row opens no menu, prevents the event's default, and leaves the row added to the existing selection.
- A Ctrl+left-click on a row inside a multi-row selection sends no `fileNavigatorSelectionAction` request.
- A right-click with the secondary button while Ctrl is held still opens the row's menu.

## Spec

Update `product/specs/file-navigator-tab.md`: the mouse-interaction table's Cmd-click / Ctrl-click row and the "Row context menu" section say a Ctrl+left-click only changes the selection and never opens a menu, including on macOS where the system would otherwise treat it as a right-click.

## Out of scope

Ctrl+left-click handling anywhere outside the file navigator rows, the app's default context menu, and the second open issue about selection and scroll after a delete.
