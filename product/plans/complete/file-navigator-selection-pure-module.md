# File Navigator Selection Pure Module

Complexity: 6/10

## Goal

Keep file navigator selection transitions and path normalization in a pure module so action-building code can depend on the selection model without importing a React hook.

## Approach

Move selection state types, constants, and pure transition functions from `web/src/file-navigator/useFileNavigatorSelection.ts` into `web/src/file-navigator/file/navigator-selection.ts`. Keep `useFileNavigatorSelection` responsible for React state, effects, callbacks, and profile-state publication. Import each pure symbol directly from its defining module without re-exporting it from the hook.

## Implementation steps

1. Create the selection module with `FileNavigatorSelection`, `TreeRestoreHint`, `EMPTY_SELECTION`, `replaceSelection`, `rangeSelection`, `toggleSelection`, `selectFromPointer`, `normalizeOperationPaths`, `replaceRenamedPath`, `reconcileSelection`, and `selectionFromRestore`, including the private nearest-visible-ancestor helper.
2. Update the hook to import the extracted pure functions and types, leaving its reactive lifecycle and returned API unchanged.
3. Retarget production imports in `web/src/file-navigator/file/navigator-menu-actions.ts`, `web/src/file-navigator/use-file-navigator-row-events.ts`, and `web/src/file-navigator/file/navigator-siblings.ts` to the pure module. Retarget pure-function/type imports in `web/src/file-navigator/useFileNavigatorSelection.test.ts`, `web/src/file-navigator/FileNavigatorOverlays.test.tsx`, and `web/src/file-navigator/file/navigator-siblings.test.ts`.
4. Run `./scripts/run.mjs check-diff` after the source change and again after the test import updates.
5. Update `product/specs/file-navigator-tab.md` only if selection behavior changed; this extraction must preserve behavior, so record that no spec update is needed if the behavior remains unchanged.

## Tests

Run the existing file navigator selection hook, sibling-selection, and overlay tests through `check-diff`. Preserve coverage for row and range selection, descendant suppression, rename and refreshed-tree reconciliation, restore revisions, root changes, registry publication and cleanup, and selection-scoped commit/delete actions. No test logic changes are planned; only imports should move.

## Out of scope

Do not change selection behavior, profile serialization, registry ownership, file operations, hook consumers other than the named import retargets, functional documentation, or unrelated backlog entries. Do not add a re-export from the hook module.
