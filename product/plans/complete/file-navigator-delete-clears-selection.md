# Clear the file navigator selection after a delete and leave the scroll alone

Complexity: 2/10 (threshold: 7).

## Goal

After a confirmed delete in the file navigator, no row is selected and the row list keeps its scroll position, so the only visible change is the deleted row going missing. Today the deleted row's disappearance hands the cursor to its nearest visible ancestor (or the row at its old index), and the cursor-follows-scroll effect then scrolls that row into view, which jumps the list when the parent directory sits above the visible area.

## Approach

Confirming the delete dialog clears the tree's cursor, anchor, and selection at the moment of confirmation, the same empty state Escape produces. With no cursor, the row-removal broadcast that follows has nothing to reconcile, so the cursor never moves to a parent row and the scroll-into-view effect never runs. Canceling the dialog keeps the selection exactly as it was.

`useFileNavigatorDelete` takes an `onConfirmed` callback that it calls after sending a confirmed delete. `FileNavigatorTab` passes one that replaces the selection with nothing. The general reconciliation rule for rows that disappear for other reasons (an outside change on disk, a collapsed directory) stays as it is.

## Implementation steps

1. In `web/src/file-navigator/useFileNavigatorDelete.ts`, add an `onConfirmed: () => void` parameter and call it from `confirm` when a delete was pending and sent. In `web/src/file-navigator/FileNavigatorTab.tsx`, pass `() => selection.replace(null)`. Run `$janissary/scripts/run.mjs check-diff`.
2. Add the tests below, update the spec, move this plan to complete, remove the issue from `product/backlog/issues.md`, and run `$janissary/scripts/run.mjs check-diff`.

## Tests

In the `delete` block of `web/src/file-navigator/FileNavigatorTab.test.tsx`:

- Confirming a single-row delete leaves no row selected and no cursor row, and after the tree re-renders without the deleted row, still no row is selected and `scrollIntoView` is not called.
- Confirming a multi-row delete clears the whole selection.
- Canceling the dialog leaves the row that was about to be deleted selected.

In the `row context menu` block, confirming **Delete** from the menu clears the selection the same way.

## Spec

Update the "Deleting a file or directory" section of `product/specs/file-navigator-tab.md`: confirming clears the selection and cursor and leaves the scroll position where it was, so the deleted row simply drops out of the list; canceling still leaves the file that was about to be deleted as the active row.

## Docs

`documentation/user-documentation/tab-types/file-navigator.md` says a confirmed delete moves the selection to the nearest surviving row and makes the parent directory active. Replace that with the new behavior.

## Out of scope

Selection reconciliation for rows removed by anything other than a confirmed delete, scroll behavior of moves, renames, or pastes, and preserving the scroll offset when the browser has to clamp it because the list got shorter at the bottom.
