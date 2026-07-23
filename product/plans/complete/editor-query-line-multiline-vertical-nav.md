# Editor query line should support multiline text with up/down navigation across the buffer boundary

**Complexity: 7/10** — reverses an explicit prior "the query is single-line" design decision
(Decision 9) and adds bidirectional focus-transfer logic between two independently-controlled
cursor models (the buffer's `EditorState` and the query's own `EditorState`), touching request
parsing, keydown routing, and row rendering across five files.

## Goal

The ephemeral agent query line (`product/specs/editor-tab.md` "In-editor persona suggestions") is
hardcoded to a single line: `emptyQueryState()` starts it at `{ lines: ['>'], ... }` and Up/Down
were explicit no-ops (`handleSuggestKeyDown.ts`, "Decision 9, the query is single-line"). Per the
backlog request, the query should support multiple lines, Up/Down should move the cursor within
that multiline text, and once the cursor passes the query's first or last line, it should hand off
to the buffer at the anchor line's neighbor — and the same crossing should work in reverse: the
buffer's own Up/Down, on reaching the query's anchor line, should hand focus into the query instead
of landing on the (rendered-over) anchor line.

## Approach

Four pieces, reusing existing infrastructure wherever it already generalizes:

1. **Creating a second line.** Enter already fires the request when runnable (Decision 7); Shift+Enter
   is free and is the natural convention for "insert a line break instead of submitting" (chat
   inputs, PR description boxes). `handleQueryLineKeyDown`'s `Enter` branch inserts `'\n'` via the
   already-generic `insertText` (`model.ts`, which already splits on `\n` for paste) when `e.shiftKey`
   is set, instead of firing.

2. **Vertical movement within the query.** `handleQueryEdit`'s Up/Down case, previously an
   unconditional no-op, now checks whether `qs.cursor.line + dir` is still inside `qs.lines`: if so,
   it reuses `motion.ts`'s existing `moveCursor(qs, 'up'/'down', extend)` (the same function the
   buffer already uses) to move within the query text. Selection-extension (`e.shiftKey`) works the
   same way Left/Right/Home/End already do in the query.

3. **Crossing out of the query, into the buffer.** When the target line falls outside `qs.lines`
   (and `e.shiftKey` isn't held — extending a selection across models isn't supported), a new
   `EditorSuggestApi.exitQueryToBuffer(dir, col, bufferState)` method (`useEditorSuggest.ts`, which
   already receives the buffer's `setState`) moves buffer focus to `anchorLine + dir` at `col`,
   clamped with the existing `clampPos`. It's a no-op when that line is outside the document (the
   anchor sits at the first/last line) — matching the old no-op behavior for that one edge case.

4. **Crossing into the query, from the buffer.** A new `crossIntoQuery` check in
   `handleSuggestKeyDown` (only reached when `focusTarget === 'buffer'`) fires when a plain
   ArrowUp/ArrowDown would land the buffer cursor exactly on the query's anchor line — the same
   check the buffer's own vertical motion would otherwise silently allow, landing on a row that's
   actually rendered as the query overlay. `EditorSuggestApi.enterQueryFromBuffer(dir, col)` then
   moves focus into the query's first line (entering from above) or last line (entering from
   below), at `col`. Modifier keys (`Shift`/`Ctrl`/`Cmd`) are excluded, same reasoning as above.

   This deliberately checks logical-line adjacency only (`cursor.line + dir === anchorLine`), not
   the wrapped-line-aware visual-row hit-testing `resolveVertical` uses elsewhere — acceptable
   because the anchor's real buffer line is always empty (Decision 3's trigger precondition) and
   therefore never wraps, so a logical-line check is exactly equivalent to a visual-row one here.

5. **Rendering.** `EditorLines.tsx`'s `renderQueryRow` previously rendered only `qs.lines[0]` as a
   single row. It now maps every line in `qs.lines` to its own `EditorLine`, all `query` rows
   sharing the anchor's buffer-line position, with the caret only on the row `qs.cursor.line` is
   on, and the status pill only on the last row (reads naturally top-to-bottom once the prompt spans
   several lines).

6. **Request parsing.** `suggest-request.ts`'s `parseSuggestRequest`/`suggestPillLabel` operated on
   a single line; the persona token still only ever appears on the query's first line, but the
   prompt can now continue onto every line after it. Both now split their input on `\n`, use
   `personaToken` on `lines[0]` only (unchanged), and join everything after the token — first
   line's remainder plus every following line — into the prompt via a shared `promptFrom` helper.
   `useEditorSuggest.ts`'s `fireOnLine` now passes the query's full `toText(state)` instead of
   `lines[0]` to both the request and `firingLine`/`noSuggestionLine` tracking. `handleQueryTab`'s
   persona-completion also had a latent bug once queries could be multiline — it rebuilt
   `{ lines: [newLine] }`, discarding every line after the first — fixed to keep `qs.lines.slice(1)`.

## Implementation steps

1. `web/src/editor/suggest-request.ts` — add `promptFrom(lines, tokenEnd)`; change
   `parseSuggestRequest`/`suggestPillLabel` to split their input on `\n`, resolve the persona token
   against `lines[0]`, and build the prompt from every line after it.
2. `web/src/editor/useEditorSuggest.ts` — import `clampPos`; add `exitQueryToBuffer` and
   `enterQueryFromBuffer` to `EditorSuggestApi` and the hook's implementation; change `fireOnLine`
   to use `toText(q.state)` instead of `q.state.lines[0]` throughout.
3. `web/src/editor/handleSuggestKeyDown.ts` — thread `bufferState` into `handleQueryEdit`; implement
   its Up/Down branch (move within the query or call `exitQueryToBuffer`); add Shift+Enter to
   `handleQueryLineKeyDown`'s `Enter` branch; fix `handleQueryTab` to preserve lines after the
   first; change its pill computation to `suggestPillLabel(toText(qs), ...)`; add the new
   `crossIntoQuery` check to the top-level `handleSuggestKeyDown`.
4. `web/src/editor/EditorLines.tsx` — change `renderQueryRow` to map every `qs.lines` entry to its
   own row, with the caret and pill placement described above.

## Tests

- `web/src/editor/suggest-request.test.ts` — `parseSuggestRequest` joins a multi-line prompt after
  the persona token, and still requires the persona token on the first line specifically;
  `suggestPillLabel` shows `run` once any line completes the prompt, and matches
  running/no-suggestion state against the full multi-line text.
- `web/src/editor/useEditorSuggest.test.ts` — `exitQueryToBuffer` moves focus and cursor into the
  buffer at `anchorLine + dir`, is a no-op when that line doesn't exist; `enterQueryFromBuffer`
  lands on the query's first line entering from above, last line entering from below.
- `web/src/editor/handleSuggestKeyDown.test.ts` — a single-line query exits on either arrow (both
  edges coincide); a multiline query moves within itself instead of exiting when a neighboring
  query line exists; Shift+Enter inserts a line break instead of firing; the buffer crosses into
  the query on an adjacent ArrowUp/ArrowDown into the anchor line, and does not for a non-adjacent
  move or with a modifier held.
- `web/src/editor/EditorLines.test.tsx` — a multiline query renders one row per line, gutter empty
  on every query row, pill only on the last, caret only on the cursor's row.
- Run `./scripts/run.mjs check-diff`; all suites must pass.

## Spec updates

- `product/specs/editor-tab.md` — the "In-editor persona suggestions" section currently states
  "Up/Down arrows are no-ops within the query line, since it holds a single line." Replace with a
  description of Shift+Enter adding a line, Up/Down moving within the query, and crossing into/out
  of the buffer at the query's edges.

## Docs

- Checked `help.md` and `documentation/user-documentation/` — neither documents the query line's
  keyboard behavior in this level of detail. No update needed.

## Out of scope

- Wrapped-line-aware (visual-row) crossing detection — the anchor's real buffer line is always
  empty and never wraps, so this isn't needed for correctness today, but a future change allowing
  the anchor to be a non-empty line would need to revisit this.
- Selection extension across the buffer/query boundary — Shift+Up/Down at the query's edge, or the
  buffer's edge into the query, is a no-op rather than extending a cross-model selection.
- Both prior small fixes from this backlog (gutter numbering, pill fixed size) — already shipped
  separately.
