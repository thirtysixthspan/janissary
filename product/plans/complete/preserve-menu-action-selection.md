# Preserve menu action selection

## Complexity

3/10.

## Goal

Preserve the keyboard-selected action when the contributed menu entry arrives asynchronously.

## Approach

Use the menu item's label, already its rendering identity, to retain selection across rebuilt groups and callbacks. If the selected action disappears, choose the first remaining action; an empty menu has no selected action. Normalize that fallback so a removed action does not regain selection if reintroduced.

## Implementation steps

1. Update `web/src/shared/ContextMenu.tsx` to track the selected label and derive its current index for clamped navigation. Add dynamic-group tests in its colocated test and deferred contribution tests in `web/src/context-menu/DefaultContextMenu.test.tsx`. Run `./scripts/run.mjs check-diff`.
2. Update `product/specs/context-menu.md`, promote this plan, remove the resolved backlog entry, check the diff, and push the existing PR branch.

## Tests

Preserve Copy and Paste after prepending an entry with rebuilt callbacks. Retain clamped arrow navigation and Escape. On removal select the first remaining action and retain it when the removed action returns; safely close an empty menu on Enter. With a controlled contribution reply, select Copy or Paste before resolution and assert Enter invokes only that selected clipboard action afterward. The deferred helper uses the existing ES2024 Promise.withResolvers lint exception comment.

## Out of scope

Contribution ordering, other backlog entries, menu appearance, and merging. Help and public documentation do not describe dynamic menu selection, so no additions are needed.
