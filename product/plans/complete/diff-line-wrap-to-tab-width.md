# Fix: wrap the diff tab's lines to the tab's width

**Complexity: 2/10** — one stylesheet rule in the diff tab's own sheet plus its colocated CSS test. No markup, server, protocol, or parser change.

## Goal

A line of the diff longer than the tab's body wraps at the body's width, the way every other monospace row in the application wraps, instead of turning each row into its own horizontal scroller that hides the rest of the line behind a per-line scrollbar and lets a hunk's text run past the tab's edge.

## Approach

`.diff-line, .diff-cell` in `web/src/plugins/diff/diff.css:49-51` carries `white-space: pre; overflow-x: auto`, so every hunk row scrolls on its own. The tab's own header comment says its rows follow the editor's inline suggest diff, and the editor's rows wrap: `.line` (`web/src/theme.css:447`) and `.editor-content` (`web/src/theme.css:852`) both use `white-space: pre-wrap; overflow-wrap: break-word`, breaking at word boundaries and inside a token only when a word alone is wider than the body.

1. **Move the wrapping onto the text span.** `.diff-text`, the span that carries the line's text in both `HunkLines.tsx` and `SplitHunks.tsx`, gains `white-space: pre-wrap`, `overflow-wrap: break-word`, and `min-width: 0`, the last so the flex row lets the span shrink to the body's width instead of sizing it to the longest line.
2. **Stop each row scrolling.** The row rule keeps its flex layout, its gap, and its padding, and drops `white-space: pre; overflow-x: auto`, so the body's own vertical scroll (`.diff-body`) is the only scrollbar in the tab. `.diff-number` keeps `flex-shrink: 0`, so a wrapped line's number stays beside its first row. A line whose text is empty still renders a single space in `.diff-text`, which under `pre-wrap` still gives the row its height.

## Implementation steps

1. Update the `.diff-line, .diff-cell` rule and add the `.diff-text` rule in `web/src/plugins/diff/diff.css`, and say in the sheet's header comment that lines wrap to the body's width.
2. Run `./scripts/run.mjs check-diff` and resolve any failures.
3. Add `web/src/plugins/diff/diff-styles.test.ts` with the cases below, following `web/src/plugins/pdf/pdf-styles.test.ts` — load `./diff.css?raw` into a `style` element and read computed styles.
4. Run `./scripts/run.mjs check-diff` and resolve any failures.
5. Update `product/specs/diff-tab.md` to say that a long line wraps to the body's width.
6. Check `help.md` and `documentation/user-documentation/` for line-rendering guidance, and update it only if present.

## Tests

- A unified row's `.diff-text` wraps at word boundaries (`white-space: pre-wrap`) and breaks inside a token only when it must (`overflow-wrap: break-word`).
- A split row's `.diff-text` wraps the same way, since both layouts share the one rule.
- A row of either layout never scrolls horizontally — no `overflow-x: auto` — so the body holds the tab's only scrollbar.

## Out of scope

- The header's root-path truncation (`.diff-root`), which stays one line with its ellipsis.
- The editor's own wrapping rule.
- Any change to which lines a hunk shows, or to the line numbers.
