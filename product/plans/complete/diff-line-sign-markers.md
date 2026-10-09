# Fix: mark the diff tab's added and removed lines with their sign

**Complexity: 3/10** — one marker span in both layouts' row components, two stylesheet rules, and the tab's rendering and stylesheet tests. No wire, server, or parser change.

## Goal

Every added line carries a **+** beside its line number and every removed line a **−**, so a change reads by its sign with the color as the secondary cue, and the gutter number of a changed line takes a saturated tint of the row's own color — a more saturated green on an addition, a darker red on a removal — where today the gutter is the same faint gray on every row and the only cue is the row's background.

## Approach

The two row components already know each line's kind, so the marker is one span per row and the tint one rule per kind. A context line keeps its plain gutter and no marker, which is what makes the marked rows stand out.

1. **The marker.** `HunkLines.tsx` and `SplitHunks.tsx` render a `.diff-marker` span between the number and the text: `+` on an added line, `−` on a removed one, nothing on a context line or on an empty placeholder side. The span is a fixed-width column, so a row's text starts at the same offset whichever kind it is.
2. **The tint.** `web/src/plugins/diff/diff.css` colors `.diff-marker` from `--success` and `--error` and gives the added and removed gutter numbers a saturated mix of the row's own color with the faint gray, so the gutter is a second cue rather than a fourth shade of nothing.

## Implementation steps

1. Render the `.diff-marker` span in `web/src/plugins/diff/HunkLines.tsx` and `web/src/plugins/diff/SplitHunks.tsx`, with no marker on a context line or an empty side.
2. Add the `.diff-marker` and gutter-tint rules to `web/src/plugins/diff/diff.css`.
3. Run `./scripts/run.mjs check-diff` and resolve any failures.
4. Add the cases below to `web/src/plugins/diff/DiffTab.test.tsx` and `web/src/plugins/diff/diff-styles.test.ts`.
5. Run `./scripts/run.mjs check-diff` and resolve any failures.
6. Update `product/specs/diff-tab.md` with the markers and the tinted gutters.
7. Check `help.md` and `documentation/user-documentation/` for a row-styling claim, and update it only if present.

## Tests

- An added line carries a `+` marker and a removed line a `−`, and a context line none, in both the unified and the split layout.
- An empty side of a split row carries no marker.
- The gutter of an added row is tinted toward the addition color and a removed row's toward the removal color, while a context row's stays faint.

## Out of scope

- Syntax highlighting inside the line, which the later entries request.
- The row backgrounds, which already carry the pale green and pale red.
- The `+24 −8` counts on the file header.
