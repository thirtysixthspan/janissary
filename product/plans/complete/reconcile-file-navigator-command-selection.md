# Reconcile file navigator selection with command restores

**Complexity: 4/10** — one client hook must coordinate row reconciliation with partial restore hints while preserving complete profile replacements; focused component and hook tests cover the transition.

## Goal

When a command changes the cursor and collapses a folder on an already-open tree, a hidden current anchor falls back to the command's new cursor. Visible anchors remain intact, hidden selections disappear, and profile restores continue replacing all selection parts.

## Approach

Coordinate row and restore processing in `useFileNavigatorSelection` so a newly received partial command hint is applied before the changed rows reconcile the current selection. The reconciliation then sees the post-command cursor and uses it when the old anchor is no longer visible. Complete hints that specify cursor, anchor, and selection retain the existing reconcile-then-replace order used by profile restores. Root changes continue to clear the old selection before applying a new hint.

## Implementation steps

1. Coordinate row reconciliation and new restore revisions in `web/src/file-navigator/useFileNavigatorSelection.ts`, distinguishing partial hints from complete selection replacements.
2. Add a `FileNavigatorTab.test.tsx` regression that selects rows under an expanded folder, collapses it while applying a cursor-only restore, verifies hidden selections disappear, and uses Shift+Arrow to prove the new cursor is the anchor. Cover preservation of a still-visible anchor in the hook tests.
3. Add a hook regression proving a complete profile restore can keep a null anchor while rows change, so post-restore reconciliation does not turn it into the cursor.
4. Update `product/specs/file-navigator-tab.md` to describe the hidden-anchor fallback when a command changes the cursor in the same revision as a collapse.
5. `help/files.md` and the file-navigator user documentation were checked; neither described behavior made inaccurate by this fix.

## Tests

- The component regression covers a cursor-only command restore concurrent with collapse and verifies hidden selected rows are removed and the next Shift+Arrow range begins at the new cursor.
- Hook tests cover retaining a visible current anchor during a partial cursor restore and retaining a null anchor for a complete profile replacement while rows change.
- The existing once-per-revision restore and selection-transition tests continue to pass.
- Diff-scoped lint, typecheck, and related web tests passed after implementation, tests, spec, and backlog changes.

## Out of scope

- Changing command or profile restore payloads or server-side clause behavior.
- Changing selection behavior outside restore and row reconciliation.
- Changing help or user documentation unless an existing description becomes inaccurate.
