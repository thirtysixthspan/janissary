# Resolve patch links under a symlinked root

**Complexity: 3/10** — ~8 added production lines, 1 edited production file, 3 requirements, 4 scenarios, 1 new unit (p=3.94)

## Goal

A patch applied through a root that is itself a symbolic link behaves as it does through the real directory: an Update through an in-root link changes its target, a Delete removes the link and leaves its target, and a Move moves the link without replacing it with a regular file. Containment, protected-path, secret, and file-type refusals still apply, and a link whose target lies outside the real root is still refused.

## Approach

`createPatchView` receives the tab's root as typed. `resolveLink` builds a link's target from `place.location`, whose parent `placeKeys` already canonicalizes, then converts that target back to a root-relative path with `path.relative(root, target)`. When the root is a symbolic link, the target is canonical while the root is lexical, so the relative path escapes the root and `resolveMutationTarget` refuses the section as `Outside the workspace` even though the target is inside the workspace.

Resolve the root once in `createPatchView` with `realpathSync.native`, falling back to the given root when resolution throws, and compute `resolveLink`'s relative path against that canonical root. `resolvePath` still passes the result through `resolveMutationTarget`, so every existing containment, protected, secret, and type check remains in force; only the base used to express the link target changes.

## Implementation steps

1. In `src/file-patch/view.ts`, import `realpathSync` from `node:fs`. Add a small helper that returns `realpathSync.native(root)` and falls back to `root` when it throws. In `createPatchView`, resolve the root once with that helper and have `resolveLink` call `path.relative` against the resolved root instead of the raw `root`.
2. In `src/file-patch/apply.test.ts`, add a case that creates a real directory holding `target` and a `link` symbolic link to it, creates a sibling symbolic link `alias` to that directory, and applies patches with the alias path passed to `applyPatchText`. Assert that an `*** Update File: link` hunk changes the real `target`, that `*** Delete File: link` removes the link and leaves `target`, and that `*** Update File: link` followed by `*** Move to: moved` leaves `moved` a symbolic link whose text is unchanged.
3. In `product/specs/acp.md`, state in the File patch tool section that a root opened through a symbolic link behaves as the directory it resolves to for the link operations, and that the existing refusals still apply.

## Tests

- `src/file-patch/apply.test.ts`: the new symlinked-root case pins the Update, Delete, and Move behavior through one alias root.
- The canonical-root link cases in `src/file-patch/sections.test.ts` (`moves links and follows changed targets`, `handles links, shared content, and recreation`, `allows entry operations on a moved link with a missing target`) and in `src/file-patch/commit.test.ts` (`deletes, moves and updates links without replacing their targets`, `commits a deleted link re-added as a regular file and moved`) must keep passing unchanged.
- The view and apply suites must keep passing, including their existing link fixtures.

## Out of scope

- Changing `resolveMutationTarget`, the path policy, the failure wording, or any other path computation.
- Canonicalizing link text, link targets, or mutation destinations beyond the single root used by `resolveLink`.
- Changing patch parsing, section order, rows, commit, restore, or the agent patch primer.
- Updating `help/` or user documentation, which does not describe the symlinked-root limitation.
