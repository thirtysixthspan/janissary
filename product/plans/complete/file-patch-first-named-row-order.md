# Report file patch rows in first-named order

**Complexity: 3/10** — ~9 added production lines, 3 edited production files, 2 requirements, 2 scenarios, 1 new unit (p=3.87)

## Goal

A successful `file patch` lists each path in the position of the first section that names it. Following a symbolic link to its target while applying an earlier section creates the target place early; that implicit creation must not give the target a row ahead of paths whose sections came before the target is named. A target reached only through a link and never named still has no row, and the existing `R` and destination-skip rules are unchanged.

## Approach

`createPatchView` stores places in a `Map` keyed by location, so `places()` returns them in resolution order. `patchRows` walks that order. When a section updates a link, `followLink` resolves the link's target before the next section runs, so the target is inserted into the map before paths named by later sections. Naming that target in a later section only clears `implicit`; it cannot move the place in the map.

Give each place an optional ordinal recording when it is first named. The view counts named places and assigns the next ordinal inside `resolvePath` whenever a non-implicit resolution meets a place without one. New implicit places carry no ordinal, so an implicit link target takes its position only when a section names it, and repeated naming leaves the first ordinal alone. `patchRows` iterates the places in ordinal order, keeping unknown ordinals after known ones so the handwritten fixtures that carry none retain their input order. The row rules themselves stay untouched.

## Implementation steps

1. In `src/file-patch/view-entry.ts`, add `firstNamed?: number` to `PatchPlace`, optional so existing handwritten `PatchPlace` fixtures remain valid.
2. In `src/file-patch/view.ts`, add a per-view named-place counter. In `resolvePath`, assign the next ordinal when `implicit` is false and the place has no ordinal yet, in both the existing-place branch and the newly created-place path. Leave the ordinal unset for a place created implicitly.
3. In `src/file-patch/rows.ts`, order the flat-mapped places by `firstNamed`, treating a missing ordinal as later than every assigned one, then keep the existing implicit skip, `R` origin, destination skip, and net-letter derivation unchanged.
4. In `src/file-patch/sections.test.ts`, add a case with a `target` file, an `old` file, and a `link` symbolic link to `target`. Apply sections that update `link`, delete `old`, and then update `target`, and assert the rows are exactly `M link`, `D old`, `M target` in that order. The target is resolved implicitly while following the link and is named only by the third section, so this pins first-named order against resolution order.
5. In `src/file-patch/view.test.ts`, add a case that resolves a link, follows it implicitly, and then names its target. Assert the link carries the first ordinal, the implicit target carries none until it is named, and resolving either path again does not change its ordinal.
6. In `product/specs/acp.md` and `help/file.md`, state that the rows follow the order a section first names each path, so a target reached through a link takes the position of the section that names it. The rest of each page stays as written.

## Tests

- `src/file-patch/sections.test.ts`: the new link, old, target case asserts exactly `M link`, `D old`, `M target`; the current resolution order would put `M target` second and fail it.
- `src/file-patch/view.test.ts`: the new ordinal case asserts a named link has an ordinal, its implicitly resolved target has none, naming the target assigns the next ordinal, and repeat resolution preserves both.
- The existing named-link row case and the destination-new row case in `src/file-patch/sections.test.ts` must keep passing unchanged.
- Every other row expectation in `sections.test.ts`, `apply.test.ts`, and `messages.test.ts` must keep passing unchanged.

## Out of scope

- Changing the implicit skip, the `R` origin rule, the destination skip, or any net-letter derivation in `patchRows`.
- Reordering writes, deletes, moves, or planned folders, or changing `buildPatchChanges`.
- Adding a row for an implicit link target that no section names.
- Changing the patch parser, apply order, commit, restore, or failure vocabulary.
- Changing the agent patch primer or any other user documentation beyond the two clarified sentences.
