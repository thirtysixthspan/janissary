# ACP tool loop 2 — `file read` line formatting

**Complexity: 4/10** — ~48 added lines in one new module, 8 requirements, 18 scenarios across line-splitting, window, and cut edges (p=5.09)

Run order: 2 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (decision 16; the 2000-character line cut in decision 15; the offset error in decision 17; the numbering and truncation sentence of the `read.ts` bullet of "File read"). Depends on subplan 1 (`product/plans/complete/move-janissarys-acp-tool-loop-1-file-read-parser.md`), which has landed: `FileReadArgs` and `FILE_READ_MAX_LIMIT` already exist in `src/file-read/command.ts`. Subplan 3 (`move-janissarys-acp-tool-loop-3-file-read-reader.md`) is the only caller; it decodes the file and passes the text here.

`file read` answers with numbered lines in a window, never the raw file. This subplan is the pure half of the reader. It takes text that has already been decoded and turns it into exactly what the agent or the user sees: line numbers, the 2000-line window, the cut for long lines, and the continuation notice. Keeping it apart from the disk code means every formatting edge is testable without a filesystem.

## Design decisions

- **Lines.** Text splits on `\n`. One trailing `\r` is then removed from each line, so CRLF files read like LF files. A lone `\r` that is not followed by `\n` is not a line break and stays in the text. A final newline does not create an extra empty line: `a\nb\n` is two lines, `a\n\n` is two lines (`a` and an empty one), and `\n` alone is one empty line. Empty text (`''`) has zero lines. A UTF-8 byte-order mark never reaches the formatter, because subplan 3's `TextDecoder` drops it by default.
- **Total.** `<total>` everywhere below is the line count from the rule above, counted over the whole text, not the window.
- **Window.** The window starts at line `offset` (1-based) and holds at most `limit` lines, so the last line shown is the smaller of `offset + limit - 1` and `<total>`. The formatter does not re-validate `args`: the parser (subplan 1) and the far side's `read-lines` descriptor (subplan 4) guarantee `offset` and `limit` are positive integers. It does clamp `limit` to `FILE_READ_MAX_LIMIT`, imported from `./command.js`, so the 2000-line cap holds for every caller even if one forwards a larger value. Only the window's lines are cut and numbered; the rest of the split text is only counted.
- **Output** (source decision 16). Each window line is printed `cat -n` style: the 1-based line number, right-aligned with `padStart` to the width of the last number shown (`String(last).length`), then one tab, then the line text. There are no leading spaces beyond that padding, unlike real `cat -n`, which pads to six. Lines join with `\n`, and the result has no trailing newline. So in a window ending at line 10, line 9 starts with a space, then `9`, then a tab, while line 10 starts with `10` and a tab. An empty line prints as its padded number and a tab, nothing after.
- **Truncation notice** (source decision 16). When `last < <total>`, one more line is appended after a `\n`: `(showing lines <offset>-<last> of <total>; continue with --offset <last+1>)`. When the window reaches the last line there is no notice, including when `offset` is exactly the last line.
- **Long lines** (source decision 15). The cut length is a new exported constant in `format.ts`, `FILE_READ_MAX_LINE_LENGTH` = 2000. It is a separate constant from `FILE_READ_MAX_LIMIT` because it limits characters per line, not lines per read, even though both are 2000 today. Characters are Unicode code points, not UTF-16 code units, so a cut never splits a surrogate pair and leaves a lone half in the output. A line with more than 2000 code points becomes its first 2000 code points followed by `…` (U+2026, one character). A line of exactly 2000 code points is left alone. A line whose `length` is at most 2000 cannot exceed 2000 code points, so only longer lines need to be split into code points. The cut happens after the `\r` is removed.
- **Empty file** (source decision 16). Zero lines prints exactly `(empty file)`, whatever the offset. This check runs before the offset check, so `file read empty.txt --offset 5` is `(empty file)`, not an offset error. Text that is only `\n` is one line, not an empty file.
- **Offset past the end** (source decision 17). When `offset > <total>` for non-empty text, the result is exactly `Offset past end of file (<total> lines): <path>.`, with `<path>` taken from `args.path` as the caller gave it. The word stays `lines` even when `<total>` is 1, matching the source plan's single fixed line. That is why the function takes the whole `args` rather than just the window numbers.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Parsed arguments | `FileReadArgs` in `src/file-read/command.ts` (subplan 1, landed) |
| The 2000-line default and maximum | `FILE_READ_MAX_LIMIT` in `src/file-read/command.ts`; import it, never write 2000 again |
| Test style for this directory | `src/file-read/command.test.ts` (plain `describe`/`it`/`expect` from `vitest`, imports from `./command.js`) |

Nothing in `src/` already numbers lines or cuts long lines with `…` in a reusable way; `src/browser/index.ts` cuts page text at `CONTENT_LIMIT`, but per text blob, not per line, so it is not a fit.

## Proposed changes

New `src/file-read/format.ts`, pure. Its only import is from `./command.js` (with the `.js` extension, per the NodeNext rule): `FileReadArgs` as a type-only import, which `@typescript-eslint/consistent-type-imports` requires, and `FILE_READ_MAX_LIMIT` as a value. No `node:` modules, no `Managers`, no command registry: the far side loads it through subplan 3's reader. It exports:

- `FILE_READ_MAX_LINE_LENGTH`: 2000, the per-line cut above.
- `formatFileLines(text, args)`: takes the decoded text and a `FileReadArgs`, and returns one string, the formatted window, `(empty file)`, or the offset error line, applying the decisions above. It never throws for any text.

Keep the per-line cut in a private helper beside `formatFileLines`, so the exported function stays well under the `sonarjs/cognitive-complexity` limit of 15. The file should land around 45 lines.

## Tests

New `src/file-read/format.test.ts`, in the style of `src/file-read/command.test.ts`. Build arguments as plain `FileReadArgs` objects, and build long inputs from `FILE_READ_MAX_LIMIT` and `FILE_READ_MAX_LINE_LENGTH` rather than literal 2000s:

- numbering and alignment across a width boundary: a ten-line text read whole pads line 9 to ` 9` and leaves `10` as is (lines 9 and 10 share one width), and a window of lines 1–9 of the same text has no padding;
- the default window, an explicit offset and limit, and an offset of exactly the last line (one line, no notice);
- a text of `FILE_READ_MAX_LIMIT + 1` lines read with the default limit shows `FILE_READ_MAX_LIMIT` lines and ends with `(showing lines 1-2000 of 2001; continue with --offset 2001)`; a window that reaches the end has no notice;
- a `limit` above `FILE_READ_MAX_LIMIT` is clamped to it;
- a line of `FILE_READ_MAX_LINE_LENGTH + 1` characters is cut to `FILE_READ_MAX_LINE_LENGTH` characters followed by `…`, and a line of exactly `FILE_READ_MAX_LINE_LENGTH` is left alone;
- a line of `FILE_READ_MAX_LINE_LENGTH + 1` astral characters (for example an emoji repeated) is cut to `FILE_READ_MAX_LINE_LENGTH` of them plus `…`, with no lone surrogate;
- empty text printing `(empty file)` at offset 1 and at offset 5;
- text that is only `\n` printing `1\t`; CRLF line endings printing no `\r`; text with no final newline counting its last line; a lone `\r` kept in the line;
- an offset one past the last line returning `Offset past end of file (<total> lines): <path>.` with the path exactly as given (for example `./notes/a.md`).

## Out of scope

Reading, containment, secrets, the size cap, decoding, and the parse-then-read runner (subplan 3). Validating `offset` and `limit` (subplans 1 and 4). Any caller wiring (subplans 3, 4, 5, 8, 13, and 18).

## Verification

Run `$janissary/scripts/run.mjs check-diff`: it lints the new files, typechecks, and runs `src/file-read/format.test.ts`. Confirm `src/file-read/format.ts` imports only from `./command.js`. There is no manual end-to-end check yet, because nothing user-visible changes until subplan 5 registers the typed command.
