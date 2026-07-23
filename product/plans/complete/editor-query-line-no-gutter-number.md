# Editor query line should not show a line number in the gutter

**Complexity: 2/10** — a single conditional in an already-existing render branch, mirroring the pattern `DiffAddedLine` already uses for its own synthetic `+` gutter.

## Goal

The ephemeral agent query line (`product/specs/editor-tab.md` "In-editor persona suggestions") is rendered by `EditorLine` (`web/src/editor/render.tsx`) as a substitute for its (always-empty) anchor buffer line, and currently shows that anchor line's real line number in the gutter — the same as any ordinary buffer row. Per the backlog request, the query row should not display a line number at all.

## Approach

`EditorLine`'s gutter span (`web/src/editor/render.tsx:80`, after the placeholder-removal fix) unconditionally renders `{line + 1}`. `DiffAddedLine` (same file, `render.tsx:92-100`) already establishes the precedent for a synthetic, non-buffer row showing something other than a number in the gutter (`+`), so the fix is a small conditional in `EditorLine`'s gutter span: when `query` is true, render nothing instead of `line + 1`. The gutter cell keeps its fixed `gutterCh`-based width either way, so the content column stays aligned with ordinary rows.

## Implementation steps

1. In `web/src/editor/render.tsx`, change the gutter span in `EditorLine` from `<span className="editor-gutter" style={{ width: \`${gutterCh}ch\` }}>{line + 1}</span>` to conditionally render an empty gutter when `query` is set, e.g. `{query ? '' : line + 1}`.

## Tests

- `web/src/editor/render.test.tsx` — in the `'EditorLine query row'` describe block, add an assertion to the existing "renders the > marker, caret, and editor-row-query class when empty, with no placeholder span" test (or a new test) confirming `container.querySelector('.editor-gutter')?.textContent` is `''` for a query row.
- `web/src/editor/render.test.tsx` — confirm an existing non-query test still asserts the ordinary numbered gutter (e.g. the existing gutter-number test, if any, or add one) so the conditional doesn't regress normal rows.
- Run `./scripts/run.mjs check-diff` after the change; all suites must pass.

## Spec updates

- `product/specs/editor-tab.md` — the "In-editor persona suggestions" section describes the query line as "rendered inline, right at that line's on-screen position, visually distinct from ordinary buffer rows" (around line 213) but doesn't currently mention gutter numbering one way or the other. Add a short clause noting the query row shows no line number in its gutter, distinguishing it further from ordinary rows.

## Docs

- Checked `help.md` — no mention of the query line's gutter. No update needed.
- Checked `documentation/user-documentation/` — no page describes the query line's gutter numbering. No update needed.

## Out of scope

- The query line's bracket-free pill text and placeholder span (already fixed, separate plan).
- Escape cancelling an in-flight request (already fixed, separate plan).
- The query line's modality relative to buffer editing (separate backlog issue).
- `DiffAddedLine`'s own `+` gutter marker — unaffected, already correct.
