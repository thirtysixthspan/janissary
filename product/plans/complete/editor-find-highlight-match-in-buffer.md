# fix(editor): highlight the previewed find match in the buffer

**Complexity: 5/10** — 9 requirements, 12 test scenarios, ~40 added lines across 4 files (p=5.69)

## Goal

When the editor tab's Cmd+F find overlay previews a match, the buffer scrolls the match's line into view and marks the whole line as the current line, but nothing points at the matched characters themselves. On a long line, or a line with several similar words, the reader has to hunt for the match. The overlay's own rows already emphasize the matched characters. This fix paints the same emphasis over the matched characters in the buffer behind the overlay while that match is previewed, so the match is as easy to spot in the buffer as it is in the overlay.

## Requirements

1. From the issue, "The match itself should be highlighted in the buffer": while the find overlay is open and the cursor sits on the highlighted result's line, the buffer paints that result's matched characters with a find-match highlight.
2. From the issue, "just as it is in the finder menu": the buffer's find-match highlight uses the same accent background and background-colored text the overlay row's emphasized characters use.
3. Only the highlighted result's matched characters are painted. Other occurrences on that line, and matches on other result rows, stay unpainted.
4. Moving the highlighted row with ↑/↓ or a click moves the buffer highlight to the newly previewed match.
5. Closing the overlay (Return, Escape, or leaving the tab) removes the buffer highlight.
6. With no matching result, or an empty query, the buffer shows no find-match highlight.
7. While the highlighted result's line is not the cursor's line (a typed query that has not been navigated to yet), the buffer shows no find-match highlight.
8. The highlight overrides a syntax-highlighting token's color on the characters it covers, so the matched text stays readable on the accent background.
9. The highlight is presentation only: it never changes the buffer text, the cursor, the selection, the dirty flag, or the undo history.

## Design decisions

- The highlight is a dedicated render decoration, not a buffer selection. A selection would change editing semantics (typing after Escape would replace the match, and the buffer's Escape collapses it), which the spec's "ready to type" Escape behavior rules out. See Assumption 3.
- The highlighted range comes from the result's own `ranges[0]`, the source range `contiguousMatch` already computed for the overlay row, so the buffer and the overlay always mark exactly the same characters. See Assumption 1.
- The decoration shows only while the cursor is on the result's line, the same guard the existing quarter-scroll effect uses, so the buffer never paints a match the view has not moved to. See Assumption 2.
- The decision of what to highlight is a pure function in a new `web/src/editor/find-highlight.ts` module, keeping the rule out of JSX and testable without a render, per `ai/guidelines/react-code-organization.md` §5.
- `EditorLine` takes the highlight as two primitive column props (`findFrom`/`findTo`, absent or -1 when unhighlighted), matching how selection bounds are already passed, so its `React.memo` shallow comparison stays cheap on large files. See Assumption 4.
- The CSS rule is scoped as `.editor-content .editor-find-match`, two classes, so it outranks the single-class `hljs-*` theme rules injected later into the document head. See Assumption 5.

## Preserved behavior

1. Moving the highlighted row moves the editor cursor to that line. The cursor must not stay on its old line or land on a different line. Pinned by `EditorTab find overlay moves the cursor to the highlighted line as the selection changes` in `web/src/editor/EditorTab.test.tsx`.
2. A previewed match is scrolled to one quarter down the editor body. The decoration must not change the scroll position computed for the caret. Pinned by `EditorTab find overlay positions a selected match one quarter down the editor viewport`.
3. Selection spans keep their `editor-sel` class combined with a token class. A find-match decoration on another line must not drop or reorder those classes. Pinned by `EditorLine token segments combines a token class with editor-sel when a selection overlaps a token` in `web/src/editor/render.test.tsx`.
4. A line with no selection, extras, or decoration renders exactly as before. The new props must not add segments or classes to an undecorated line. Pinned by `EditorLine with several selections renders exactly as before when the extras are empty`.
5. Escape closes the overlay and returns focus to the buffer. The decoration must not keep the overlay open or hold focus. Pinned by the Escape cases in the `find overlay` block of `web/src/editor/EditorTab.test.tsx`.

## Assumptions

1. Each editor find result carries exactly one matched range, in source offsets of the line: `web/src/shared/fuzzy-match.ts:163` `best = { path, index, score, ranges: [[sourceStart, sourceEnd]] };`.
2. The quarter-scroll effect previews a match only when the cursor is on the result's line: `web/src/editor/EditorTab.tsx:80` `state?.cursor.line !== result.index`.
3. Selecting a find result moves the cursor to column 0 with no selection: `web/src/editor/useEditorInteractions.ts:71` `cursor: { line: result.index, col: 0 }, anchor: null`.
4. Selection bounds reach `EditorLine` as primitives for cheap memo comparison: `web/src/editor/render.tsx:7` "Selection column bounds for one line as primitives".
5. Syntax themes are highlight.js stylesheets with single-class `hljs-*` selectors, swapped into one `<style id="syntax-theme">` in the head: `web/src/shared/syntax-highlight/themes.ts:27` `document.querySelector<HTMLStyleElement>('#syntax-theme')`.
6. The overlay row's emphasis style is `web/src/theme.css:636` `.editor-find-row mark { background: var(--accent); color: var(--bg); border-radius: 2px; }`.

## Existing functionality

1. The find overlay's open flag, results, and highlighted row: `web/src/shared/line-find/useLineFind.ts:11` `export type LineFindApi`.
2. Column-bounded segment rendering that already folds selection, caret, and token bounds into one list: `web/src/editor/render.tsx:79` `function contentSegments(props: LineProps)`.
3. Per-line props assembly for buffer rows: `web/src/editor/EditorLines.tsx:42` `const renderLine = (index: number, removed: boolean) =>`.

## Implementation steps

Step 1. Add `web/src/editor/find-highlight.ts` exporting a `FindMatch` type (line, from, to) and a pure `findMatchHighlight(find, cursorLine)` that takes the `findOpen`, `results`, and `selected` fields of `LineFindApi` and the cursor's line, and returns the highlighted result's first range on its line, or `null` when the overlay is closed, there is no highlighted result, or the cursor is on another line. Add its colocated test. Build command: `$janissary/scripts/run.mjs check-diff`.

Step 2. Extend `EditorLine`'s `LineProps` in `web/src/editor/render.tsx` with optional `findFrom`/`findTo` columns. `contentSegments` adds them to the segment bounds and gives every segment inside them the `editor-find-match` class, alongside any token and `editor-sel` classes; a small helper assembles the class list so `contentSegments` stays within the cognitive-complexity limit. Add `.editor-content .editor-find-match` to `web/src/theme.css` beside `.editor-sel`, with the overlay row mark's accent background, background-colored text, and 2px radius. Add render tests. Build command: `$janissary/scripts/run.mjs check-diff`.

Step 3. Give `EditorLines` an optional `findMatch` prop and have `renderLine` pass `findFrom`/`findTo` to the row whose index equals `findMatch.line`, -1 elsewhere. In `EditorTab`, compute `findMatchHighlight(find, state?.cursor.line)` and pass it to `EditorLines`. Add EditorTab tests. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. The matched characters of the previewed result, in the buffer row behind the find overlay, get the accent background with background-colored text and 2px rounded corners, matching the overlay row's emphasized characters.
2. The current-line background on the row stays; the highlight sits on top of it only over the matched characters.
3. A soft-wrapped line whose match spans a wrap point paints each wrapped fragment, since the decoration is inline segments.
4. No keyboard, focus, or accessibility behavior changes: the overlay keeps focus, and the overlay's live announcement is unchanged.

## Tests

- `web/src/editor/find-highlight.test.ts`: returns the highlighted result's line and range when open and the cursor is on its line (Requirement 1); returns `null` when closed (Requirement 5), with no results (Requirement 6), and when the cursor is on another line (Requirement 7); picks the selected row's result, not the first (Requirement 4).
- `web/src/editor/render.test.tsx`: an `EditorLine` with `findFrom`/`findTo` gives exactly the covered text the `editor-find-match` class (Requirements 1 and 3); a covered token keeps its `hljs-*` class alongside `editor-find-match` (Requirement 8); `findFrom` of -1 adds no `editor-find-match` class (Requirement 6).
- `web/src/editor/EditorTab.test.tsx` `find overlay` block: after arrowing to a match, the buffer's `.editor-find-match` text is the matched query text on that line and the buffer is not dirty (Requirements 1 and 9); a typed query that has not been navigated to paints nothing (Requirement 7); Escape removes the highlight (Requirement 5); arrowing between two results moves the highlight to the second line (Requirement 4).

## Out of scope

- The second backlog issue (scrolling past the last line so a match near the end of the file is not hidden behind the overlay).
- The shell tab and PDF tab finds, which share the overlay but render their own surfaces.
- Highlighting every occurrence of the query in the buffer; only the previewed match is painted.
- Moving the cursor to the match's column, or leaving a highlight after the overlay closes.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then, in the running app, open a file in an editor tab, press Cmd+F, type a word that appears mid-line on a few lines, and press ↓. The buffer should scroll to the first result's line and the matched characters on that line should carry the same accent highlight the overlay row shows. Press ↓ again: the highlight moves to the next result's line. Press Escape: the overlay closes and the highlight disappears, with the buffer text and dirty state unchanged. A failure looks like the line being marked only by the current-line background with no character-level highlight, or the highlight staying after the overlay closes.
