# Fix: highlight hovered diff code lines

**Complexity: 2/10** — shared CSS for both diff layouts and colocated style regression tests.

## Goal

When the mouse hovers over a code line in the unified or split diff, highlight that line and show a pointer cursor.

## Approach

Both `HunkLines.tsx` and `SplitHunks.tsx` already attach double-click handlers to code rows. The shared stylesheet currently inherits the hunk's text cursor and has no code-row hover rule. Add a pointer cursor to `.diff-line` and nonempty `.diff-cell` rows, and an inset accent tint on hover. An inset shadow leaves addition, removal, and intraline backgrounds intact. Empty split alignment cells retain their existing appearance and cursor.

## Implementation steps

1. Update `web/src/plugins/diff/diff.css` with shared code-row cursor and hover rules. Run `./scripts/run.mjs check-diff`.
2. Extend `web/src/plugins/diff/diff-styles.test.ts` to cover both layouts, all line kinds, hover tint, and empty placeholders. Run `./scripts/run.mjs check-diff`.
3. Update `product/specs/diff-tab.md` with hover behavior. Check existing help and user documentation, updating only descriptions affected by the change.
4. Promote this plan to complete and remove only the selected hover entry from `product/backlog/pull-request.md`. Run `./scripts/run.mjs check-diff` before publication.

## Tests

- Context, added, and removed rows in unified and split layouts show a pointer cursor, inherited by the code text.
- Both layouts share a hover rule applying an accent inset tint without replacing their background colors.
- Empty split placeholders inherit the hunk's text cursor and do not match the hover rule.

Use computed styles for cursor assertions and stylesheet rule assertions for hover colors, since jsdom does not resolve mouse hover or theme color mixing. Existing interaction tests continue to cover double-click navigation.

## Out of scope

- Changing click or double-click navigation, keyboard selection, or deleted-file behavior.
- Syntax highlighting, font sizing, context expansion, or other PR backlog entries.
- Server, protocol, and plugin contract changes.
