# Correct the file read error lines in the pull request description

**Complexity: 1/10** — one sentence in the pull request body, no code, tests, or docs; 1 requirement, 0 files edited (p=2.07)

## Summary

The pull request body's `file read` paragraph says "A missing or unreadable file reports `File not found`; anything that is not a regular file reports `Not a text file`." A directory is not a regular file, yet the implementation returns `Is a directory: <path>.` for it, as the same description's edge-case step 16 and `help/file.md` both state. A reader building a client or a test from that sentence expects the wrong line for a directory.

## Design decisions

1. **Three explicit classes, matching the reader.** `src/file-read/read.ts` checks `statSync().isDirectory()` before `isFile()`, so a directory reports `Is a directory: <path>.`; a non-file that is not a directory reports `Not a text file: <path>.`; and any filesystem failure, including a dangling symlink or an unreadable file, reports `File not found: <path>.`. The corrected sentence names those three classes exactly.
2. **Binary content and decoding.** `decodeText` uses a fatal UTF-8 decoder and rejects a NUL byte, so the `Not a text file` class also covers invalid UTF-8, text containing a NUL byte, and binary content.
3. **The path is named as typed.** The reader interpolates `args.path`, and `help/file.md` and `product/specs/acp.md` both say so. The corrected paragraph keeps that statement.
4. **Only the named paragraph changes.** Every other paragraph, the title, and the edge-case steps stay byte-for-byte as the author wrote them.

## Proposed changes

1. **The pull request's description**, after the push: read the current body with `gh pr view`, replace only the sentence beginning "A missing or unreadable file reports" with wording that names `File not found`, `Is a directory`, and `Not a text file` for their respective cases, add the path-as-typed statement, write the full body to `./temp/pr-body.md`, and apply it with `gh pr edit --body-file`.

## Tests

None, and none possible: the artifact is prose in a pull request body, and the behavior it describes is already pinned by `src/file-read/read.test.ts`, whose directory cases are untouched.

## Out of scope

- No change to `src/file-read/read.ts`, `src/file-read/read.test.ts`, `help/file.md`, `product/specs/`, or any other file.
- No change to the pull request title, to any other paragraph, or to edge-case step 16.

## Verification

Read the corrected body with `gh pr view 1992 --json body` and confirm the `file read` paragraph names all three error lines and the path-as-typed rule, and that edge-case step 16 still reads `Is a directory: notes.`. Confirm `src/file-read/read.ts` still branches directory before non-file, and run `$janissary/scripts/run.mjs check-diff` with the directory cases untouched.
