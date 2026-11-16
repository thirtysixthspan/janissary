# File patch 3: pure hunk applier

**Complexity: 6/10** — 22 requirements and 31 test scenarios from the placement, end-of-file, and line-ending rules drive it, with ~130 added lines and no existing files edited (p=6.17)

Run order: 3 of 15 in the `file patch` series. Source plan: `./product/plans/complete/file-patch.md`. Depends on `./product/plans/ready/file-patch-2-hunk-parser.md` for the `PatchHunk` and `PatchHunkLine` types, which it defines in `src/file-patch/parse-hunks.ts` (that file and the `src/file-patch/` folder don't exist in the repo yet; subplans 1 and 2 create them). It doesn't depend on subplan 1's `parse.ts` and must not import it.

This subplan adds the pure function that applies an Update section's hunks to one file's text. It decides where each hunk lands, how strictly it matches, and how the file's line endings and final newline survive. Nothing calls it from production code yet. Subplan 5 calls it once per Update section.

## Goal

`applyHunks(text, hunks)` in a new `src/file-patch/hunks.ts` returns either the new text or a failure naming the hunk that didn't match. It does no I/O.

## Design decisions

From the source plan:

- **Match strictness.** A hunk's old block (its context and `-` lines, in order) is first matched against the file's lines exactly. If no exact match exists, the search runs again comparing each line with its trailing whitespace ignored on both sides. No further fuzzing: no trimmed leading whitespace, no Unicode punctuation folding.
- **Placement.** Hunks are searched in order. Each search starts after the previous hunk's matched position (the line after the last line it replaced). The first match wins, as in Codex.
- **Anchors.** An `@@ <text>` header first moves the search to the next line equal to `<text>`, under the same exact-then-trailing-whitespace rule, and the hunk's old block is then searched from the line after that one. A bare `@@` does not move the search.
- **End of file.** A hunk marked `endOfFile` must match with its old block ending at the file's last line.
- **Line endings.** The file's line ending is judged from its first line ending: CRLF when the first `\n` is preceded by `\r`, LF otherwise. The text is split into lines with that ending removed, the hunks apply to the lines, and the result is joined with the same ending. The file's final-newline state (whether its text ends in a line ending) is kept as it was.
- **Exact content.** Inserted (`+`) lines are written exactly as the patch carries them, indentation included.
- **Failure.** A hunk with no match fails with that hunk's first context or `-` line, which subplan 8 prints as `No matching text for hunk starting "<line>"`.

Decided here:

- **Kept lines come from the file.** Context lines in the result keep the file's own text. When the trailing-whitespace fallback matched, the file's trailing whitespace on those context lines survives. Only `+` lines come from the patch.
- **Mixed line endings.** A file judged CRLF has one trailing `\r` removed from each split line, and the whole result is joined with `\r\n`, so a CRLF-first mixed-ending file comes out all CRLF. This is the source plan's "rejoins with the same ending" applied to every line. A file judged LF is split on `\n` with nothing removed, so the `\r` of any CRLF line stays part of that line's text and the line comes out unchanged; such lines match a `\r`-free patch line only through the trailing-whitespace fallback.
- **An empty file.** A zero-length file has no lines, an LF ending, and counts as ending in a newline, so lines added to it come out LF-terminated.
- **A pure insertion.** A hunk with no context or `-` lines always matches (once its anchor, if any, is found). It inserts at the current search position: after its anchor line when it has one, otherwise after the previous hunk's match, otherwise at the start of the file. When it's marked `endOfFile`, it appends at the end of the file instead. This is a deliberate difference from Codex, which appends every pure insertion at the end of the file; keep it as written rather than copying Codex here.
- **An anchor that isn't found.** It fails the hunk with the anchor text as the quoted line, so subplan 8 prints `No matching text for hunk starting "<anchor>"`.
- **The fallback is per hunk.** The exact search runs over the whole remaining range first, and the trailing-whitespace search only runs when the exact one found nothing. An anchor search follows the same rule on its own.
- **Result shape.** `applyHunks` returns `{ ok: true, text }` or `{ ok: false, line }`, where `line` is the quoted line above. It doesn't check sizes or encodings. Subplan 5 runs those checks on the result. Export the union as `ApplyHunksResult` from `hunks.ts`. It deliberately isn't `FileOperationResult` (`src/file-navigator/file-operation-result.ts`), because the failure carries the hunk's line, not a finished reason; subplan 8 builds the reason text.
- **What "trailing whitespace ignored" means.** Two lines compare equal under the fallback when their `trimEnd()` results are equal (JavaScript's `String.prototype.trimEnd`, which removes Unicode white space and line terminators). So a stray `\r` left at the end of a line in an LF-judged file also matches under the fallback. Leading whitespace is always compared exactly.
- **Positions refer to the original lines.** Every search (anchor and old block) runs over the file's original split lines, never over text an earlier hunk inserted. Each successful hunk records a replacement (start index, number of old lines, its new lines), and the replacements are applied once every hunk has matched. Because each search starts after the previous match, replacements never overlap. Two replacements at the same index (two pure insertions in a row) keep patch order. The `unicorn/no-array-reverse` lint rule is an error, so when applying from the end use `toReversed()` or a backwards index loop, not `reverse()`.
- **The search position.** It starts at line 0. An anchor search starts at the current position and, when found, moves the position to the line after the anchor. A matched old block moves it to the line after the block's last line. A pure insertion leaves it at the insertion point.
- **What a hunk's old and new blocks are.** The old block is the hunk's context and `-` lines in order; the new block is its context and `+` lines in order, where each context line is replaced by the matched file line (per "Kept lines come from the file" above). A `-` line's patch text is only used for matching.
- **End of file with a position.** An `endOfFile` hunk's old block must both end at the file's last line and start at or after the current search position (after its anchor, when it has one). Exact first, then the trailing-whitespace fallback, both only at that one place. A block longer than the remaining lines fails.
- **Which line a failure quotes.** When the anchor isn't found, the anchor text. When the anchor is found (or there is none) but the old block isn't, the hunk's first context or `-` line, taken as the patch carries it (prefix removed, nothing trimmed). The first failing hunk wins and later hunks aren't tried.
- **No hunks.** An empty `hunks` array returns the input text unchanged, byte for byte, with no line-ending normalization. Any non-empty, successful application rejoins the lines, so a CRLF-first mixed-ending file is normalized even when the hunks leave its lines' text alone.
- **Splitting and joining.** After the ending is judged, one trailing line ending is removed when present (that's the final-newline state), and the rest is split on `\n` (one trailing `\r` per line dropped for a CRLF file). So `"a\n"` is one line with a final newline, `"a"` is one line without, and `"\n"` is one empty line with a final newline. The empty text is special-cased to zero lines (see "An empty file") rather than split, since splitting it would give one empty line. Joining puts the ending between lines and adds one more at the end when the final-newline state is kept true. A result with zero lines is the empty string whatever the final-newline state, so a hunk deleting every line of a file leaves a zero-byte file.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How the applier uses it |
| --- | --- | --- |
| Hunk types | `PatchHunk`, `PatchHunkLine` in `src/file-patch/parse-hunks.ts` (subplan 2) | The input shape: `anchor` (absent, never empty), `lines` with `kind` `'context'`, `'remove'`, or `'add'` and prefix-free `text`, and `endOfFile`. Import them with `import type` from `./parse-hunks.js` (`consistent-type-imports` and the `.js` extension rule). |
| Exact replacement precedent | `src/file-write/edit-text.ts:38` "`export function replaceExactText(`" | Shows the house style for a pure text transform that returns a result instead of throwing. Its count-and-split approach doesn't fit line-based search, so nothing is reused directly. |
| `diff` package | `package.json` | Not used, per the source plan: its hunks need line numbers. |

## Proposed changes

- New `src/file-patch/hunks.ts` with `applyHunks` and `ApplyHunksResult`, plus private helpers to detect the ending, split and join, find a block from a position under a comparison (exact or `trimEnd`), and find an anchor line. Keep it under 200 lines and each function under the cognitive-complexity limit. Use `indexOf`, `split`, and plain comparisons, no regular expressions, so `security/detect-unsafe-regex` has nothing to flag.
- No existing file is edited.

## Tests

New `src/file-patch/hunks.test.ts` (vitest `server` project), calling `applyHunks` with hand-built `PatchHunk` values (not through `parsePatchText`), covering:

- A clean match replacing one line.
- The trailing-whitespace fallback: the file has trailing spaces the patch lacks, and the reverse. Kept context keeps the file's whitespace.
- No match reports the hunk's first context-or-`-` line, and a hunk starting with a `-` line reports that line.
- Two hunks applied in order, and a second hunk whose text appears only before the first hunk's match failing.
- A repeated context block resolved by sequential search, so the second hunk lands on the second copy.
- An `@@ <text>` anchor moving the search past an earlier identical block, and an anchor that isn't found.
- `endOfFile`: a block that appears twice matches the copy at the end, and a block that isn't at the end fails.
- A pure insertion at the start, after an anchor, and at the end with `endOfFile`.
- A CRLF file staying CRLF, a CRLF-first mixed-ending file normalized to CRLF, an LF-first mixed-ending file keeping its CRLF lines, and an empty file gaining LF-terminated lines.
- A file with no final newline keeping that state after an edit to its last line, and a file with one keeping it.
- A later hunk never matching text an earlier hunk inserted, and two pure insertions in a row keeping patch order.
- An anchor that is found with an old block that isn't, reporting the block's first line, not the anchor.
- An `endOfFile` block that is at the end but starts before the search position failing, and an `endOfFile` pure insertion on a file without a final newline (the old last line gains an ending, the new last line has none).
- A hunk deleting every line giving the empty string, an empty `hunks` array returning a mixed-ending text unchanged, and `"\n"` treated as one empty line.
- An LF-first file whose line ends in `\r` matching a patch line without it through the fallback, with the kept context line's `\r` surviving.
- The quoted line kept exactly as the patch carries it, leading and trailing whitespace included.

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- No manual check: nothing reaches the applier from the app until subplan 14.

## Out of scope

- Reading or writing files, BOM handling, and the size and text checks (subplans 4 and 5).
- Fuzzy matching beyond trailing whitespace (source plan, Out of scope).
