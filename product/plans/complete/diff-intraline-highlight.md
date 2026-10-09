# Fix: highlight the changed characters within a replaced line

**Complexity: 6/10** — one new pure module over a character-level alignment, one shared row-pairing walk both layouts already need, two spans per layout's rows, and a stylesheet rule. No wire, server, or parser change.

## Goal

Where a line was replaced rather than added or removed whole, the characters that changed carry a
stronger tint of the row's own color — the numerals in `timeout = 30` against `timeout = 60` — so the
edit reads at a glance in both the unified and the split layout, while a line too unlike its
counterpart, or too long to align, carries no such highlight rather than a misleading one.

## Approach

A replaced line is a removed line with an added line beside it, and the two layouts already pair them
the same way: a run of removed lines row by row with the run of added lines that follows.

1. **One pairing walk, used twice.** `web/src/plugins/diff/split-rows.ts` grows the walk out of
   `splitRows` so both renderers share it: `hunkRows` lays a hunk out as rows — a context line on both
   sides, a removed run paired row by row with the following added run — and `splitRows` becomes that
   walk's own name, because the split layout is exactly these rows. `HunkLines` draws each row's old
   side above its new one, which is the order git printed them in, so the pairing survives in the
   unified layout too.
2. **The alignment.** `web/src/plugins/diff/intraline.ts` finds the longest common subsequence of the
   two lines' characters on a length-capped table, and the characters outside it are the changed spans.
   Two guards keep it honest: a pair sharing less than half its shorter line is unrelated, and a line
   longer than `MAX_INLINE_CHARS` is not aligned at all — both answer no spans, because a wrong
   highlight is worse than none.
3. **The rendering.** `HunkLines` and `SplitSide` wrap each row's changed characters in a
   `.diff-changed` span inside the line's own `.diff-text`, and `diff.css` tints those spans from
   `--success` and `--error` at a stronger mix than the row's own background carries. The strike-through
   on a removed line's text and the wrap both keep working, because a span is text wherever it sits.

## Implementation steps

1. Refactor `web/src/plugins/diff/split-rows.ts` so the row walk is one function both layouts use, and render `HunkLines` from rows.
2. Add `web/src/plugins/diff/intraline.ts` with `changedSpans`, its two guards, and the cap.
3. Render `.diff-changed` spans in `web/src/plugins/diff/HunkLines.tsx` and `web/src/plugins/diff/SplitHunks.tsx`, and add the stylesheet rules.
4. Run `./scripts/run.mjs check-diff` and resolve any failures.
5. Add `web/src/plugins/diff/intraline.test.ts` and the rendering cases below.
6. Run `./scripts/run.mjs check-diff` and resolve any failures.
7. Update `product/specs/diff-tab.md` with the character-level highlight and its two guards.
8. Check `help.md` and `documentation/user-documentation/` for a diff-row claim, and update it only if present.

## Tests

- `changedSpans` answers the characters outside the common subsequence: the digits of `timeout = 30` against `timeout = 60`, and nothing for a line against itself.
- A pair sharing less than half its shorter line answers no spans, and so does a line past the length cap.
- The unified layout wraps the changed digits of a replaced line in `.diff-changed` and leaves the rest of the text plain.
- The split layout carries the old line's changed digits in the left column and the new line's in the right.

## Out of scope

- Syntax highlighting, the later `Syntax highlighting` entry.
- Word-level alignment, which is a coarser rule than the character alignment this needs.
- Anything the server sends for a line.
