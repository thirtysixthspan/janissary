# ACP tool loop 2 — `file read` line formatting

**Complexity: 4/10** — ~45 added lines in one new module, 7 requirements, 14 scenarios (p=4.89)

Run order: 2 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (decision 16; the 2000-character line cut in decision 15; the offset error in decision 17; the numbering and truncation sentence of the `read.ts` bullet of "File read"). Depends on subplan 1 (`move-janissarys-acp-tool-loop-1-file-read-parser.md`) for `FileReadArgs`. Subplan 3 calls it.

`file read` answers with numbered lines in a window, never the raw file. This subplan is the pure half of the reader. It takes text that has already been decoded and turns it into exactly what the agent or the user sees: line numbers, the 2000-line window, the cut for long lines, and the continuation notice. Keeping it apart from the disk code means every formatting edge is testable without a filesystem.

## Design decisions

- **Lines.** Text splits on `\n`, with a trailing `\r` removed from each line. A final newline does not create an extra empty line. Empty text has zero lines.
- **Window.** The window starts at line `offset` (1-based) and holds at most `limit` lines.
- **Output** (source decision 16). Each line is printed `cat -n` style. The 1-based line number is right-aligned with `padStart` to the width of the largest number shown, then comes a tab, then the text.
- **Truncation notice** (source decision 16). When lines remain after the window, one more line is added: `(showing lines <first>-<last> of <total>; continue with --offset <last+1>)`.
- **Long lines** (source decision 15). A line longer than 2000 characters is cut to its first 2000 characters followed by `…`. A line of exactly 2000 characters is left alone.
- **Empty file** (source decision 16). Zero lines prints exactly `(empty file)`, whatever the offset.
- **Offset past the end** (source decision 17). An offset greater than the line count of a non-empty file returns exactly `Offset past end of file (<total> lines): <path>.`, with `<path>` as the caller gave it. That is why the function takes the path.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Parsed arguments | `FileReadArgs` in `src/file-read/command.ts` (subplan 1) |

## Proposed changes

New `src/file-read/format.ts`, pure, with no imports beyond the `FileReadArgs` type: `formatFileLines(text, args)` returns the formatted window, `(empty file)`, or the offset error line, applying the decisions above. It names the file by `args.path`. The far side loads it through subplan 3's reader, so it must stay free of `Managers` and the command registry.

## Tests

New `src/file-read/format.test.ts`:

- numbering and alignment across a width boundary (lines 9 and 10 share one width);
- the default window, an explicit offset and limit, and an offset of exactly the last line;
- the 2000-line cap and its notice, with the right `--offset` hint, and no notice when the window reaches the end;
- the 2000-character cut ending in `…`, and a 2000-character line left alone;
- empty text printing `(empty file)` at offset 1 and at offset 5;
- text that is only a newline, CRLF line endings, and text with no final newline;
- an offset one past the last line returning the offset error naming the path as given.

## Out of scope

Reading, containment, secrets, the size cap, and decoding (subplan 3).

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Nothing user-visible changes yet.
