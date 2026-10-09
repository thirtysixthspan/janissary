# Fix: open an oversized change collapsed, with the cap named in its note

**Complexity: 3/10** — one new pure cap module, a second collapse reason on the existing entry state, a note, its stylesheet rule, and the tab's rendering tests. No server, protocol, parser, or wire-shape change.

## Goal

An entry whose change is larger than the tab's per-entry cap opens collapsed like a whole-file change does, with its header saying how many lines the change holds and what the cap is, and a double-click on the header expanding it to every line.

## Approach

The payload counts each change's added and removed lines (`additions` and `deletions`, already summed from the hunk lines), so the cap is computed from the payload with no new wire field and no parser change. A change of 400 lines or fewer is the ordinary case and stays expanded; one over the cap opens collapsed.

1. **A pure cap.** `web/src/plugins/diff/size-cap.ts` exports `CHANGE_LINE_CAP` — 400 lines, chosen because the body's rows are 12px monospace and 400 of them is already a screenful and a half of scrolling — and `oversizedLines(file: DiffFile): number`, the count over the cap, answering 0 for an entry within it.
2. **A second collapse reason.** `FileEntry` collapses while `isWholeFileChange(file) || oversizedLines(file) > 0` and the entry is not expanded, and its header carries the existing whole-file note unchanged plus a `.diff-large-file` note for the oversized case naming the count and the cap. Both notes share the header's muted color through one rule.
3. **The expansion stays one gesture.** The double-click that opens a whole-file entry opens an oversized one, so the two collapse reasons never diverge in how they are dismissed.

## Implementation steps

1. Add `web/src/plugins/diff/size-cap.ts` with the cap constant and `oversizedLines`.
2. Add the oversized reason and its note to `web/src/plugins/diff/FileEntry.tsx`, keeping the whole-file note and the one double-click gesture.
3. Add the `.diff-large-file` rule to `web/src/plugins/diff/diff.css`.
4. Run `./scripts/run.mjs check-diff` and resolve any failures.
5. Extend `web/src/plugins/diff/size-cap.test.ts` and `web/src/plugins/diff/DiffTab.test.tsx` with the cases below.
6. Run `./scripts/run.mjs check-diff` and resolve any failures.
7. Update `product/specs/diff-tab.md` with the oversized collapse and its note.
8. Check `help.md` and `documentation/user-documentation/` for entry-layout guidance, and update it only if present.

## Tests

- `oversizedLines` answers the count over the cap for a change past it, 0 for one within it, and 0 for a record with no hunks.
- An entry over the cap renders no line rows until its header is double-clicked, then renders them all.
- The oversized note names the change's line count and the cap.
- An entry at the cap renders its rows with no note.
- A whole-file entry that is also oversized carries both notes and one double-click expands it.

## Out of scope

- The font size and syntax highlighting the editor carries.
- No-changes flicker, section spacing, and the added and removed row colors.
- Whether the server sends less for a large change; the payload is unchanged.
