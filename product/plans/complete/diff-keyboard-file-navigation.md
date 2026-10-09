# Fix: move between the diff tab's file entries with j and k

**Complexity: 4/10** — one pure module over the walk's own coordinates, a straight-to-row move on the host's shared list selection, two keys on the body's handler, and a tooltip that names them. No wire, server, or payload change.

## Goal

GitHub's convention, on the tab's own keys: **j** moves to the next file's first hunk and **k** to the
previous one's, one file at a time, stopping at the first and last file rather than wrapping — so a
change set of many files is walked file by file without the mouse, and Return opens the file at the
hunk the walk landed on.

## Approach

The walk's flat list already knows where each file's hunks begin, because it is built in file order:
walking `hunkSpots` again and adding the hunks each file contributes gives the file starts. Moving the
selection straight to one of those stops is the host's shared selection rule with one more move on it,
the same clamp and the same dropping of the confirmation the arrow keys already do.

1. **The stops.** `web/src/plugins/diff/file-starts.ts` answers where each file's hunks begin — a file
   whose hunks hold no lines is absent rather than pointing at another file's hunk — and the stop a key
   lands on: the next file's first hunk going down, the previous one's coming back up, clamped to the
   ends so the walk never wraps past the first or last file.
2. **The move.** `useListSelection` in `web/src/shared/list-selection.ts` grows `select(index)`, the
   straight-to-row form of `navigate`: clamped into the list and dropping the confirmation for the same
   reason the arrow keys do. The walk's own `moveFile` composes it with the stops, so the scroll-into-view
   and the clamping are still the shared hook's work rather than a second copy of them.
3. **The keys.** `DiffTab` answers `j` and `k` on the body's own handler, beside the arrows. The handler
   is on the body — the tab's one focusable region — so a keypress reaches it only while the body holds
   focus, and the typable regions of the application are elsewhere by construction. The body names the
   three gestures in its `title`, which is the discoverability the entry asks for.

## Implementation steps

1. Add `web/src/plugins/diff/file-starts.ts` with the stops and the stop a key lands on, and its tests.
2. Add `select` to the shared selection hook and the walk's `moveFile`, and extend the tab's tests with the cases below.
3. Run `./scripts/run.mjs check-diff` and resolve any failures.
4. Update `product/specs/diff-tab.md` with the j and k keys.
5. Check `help.md` and `documentation/user-documentation/` for a keyboard claim about the diff tab, and update it only if present.

## Tests

- `fileStarts` answers where each file's hunks begin, leaving out a file whose hunks hold no lines.
- `fileStop` answers the next and previous file's first hunk, and the last and first file's own first hunk at the ends.
- `j` and `k` on the body move the walk to the next and previous file, and Return opens the file at the walked hunk.
- Repeated `j` and `k` stop at the last and first file rather than wrapping.

The `select` move is covered through these rather than by a test of its own: the shared hook has no
test file of its own anywhere — `navigate` and `rowClicked` are covered by the lists that compose it —
and the clamping and the no-move-at-the-ends behavior are exercised by the cases above.

## Out of scope

- A mouse gesture on the file header to select it, which the chevron and the name button already answer.
- A per-file highlight of its own, which would be a fifth state beside the walked hunk.
- The help menu's diff row, which describes the command rather than the keys.
