# Align the file help page's error conditions with the reader

**Complexity: 1/10** — no production code lines or files, 2 requirements, 3 test scenarios (p=2.86)

## Goal

Make the `file` command help page's **Errors** list state the conditions the reader actually applies, so a user who sees `File not found` for a file that exists, or `Not a text file` for a named pipe or device, finds the reason on the page.

## Approach

`loadBytes` in `src/file-read/read.ts` wraps the whole resolve, stat, and read sequence in one `try` whose `catch` returns `File not found`, so any failure to resolve or read the file, a permission error on an existing file included, prints `File not found`. Its `!stats.isFile()` branch returns `Not a text file` for anything that exists but is neither a directory nor a regular file, such as a socket, named pipe, or device. `decodeText` then returns undefined for invalid UTF-8 and for text containing a NUL byte, which also prints `Not a text file`. The help page names only a missing path for the first message and only binary or non-UTF-8 content for the second. Extend both bullets in `help/file.md` to match. The reader does not change. The socket, invalid-UTF-8, and NUL cases are already pinned in `src/file-read/read.test.ts`; add a test for an existing file without read permission so the widened `File not found` clause is pinned too.

## Implementation steps

1. In `help/file.md`, under **Errors**, add a condition to the `File not found: <path>.` bullet saying it is printed for a missing path and also when the file exists but cannot be read, such as one without read permission.
2. In the same list, extend the `Not a text file: <path>.` bullet so it names anything that is not a regular file or directory, such as a named pipe, socket, or device, alongside binary content and text that is not valid UTF-8.
3. In `src/file-read/read.test.ts`, add a test that an existing file with its permissions cleared reports `File not found`, skipped when the test process runs as root, where the permission check does not apply.

## Tests

- A file written and then given mode `000` reads as `File not found: <path>.` (skipped as root).
- Existing socket, invalid-UTF-8, and NUL-byte tests in `src/file-read/read.test.ts` keep passing and back the widened `Not a text file` bullet.
- Existing `src/commands.test.ts` help page checks keep passing.

## Specs and docs

- `help/file.md` **Errors** list, as above. The `help/commands.md` row stays unchanged.
- No spec change: the typed `file` command has no functional spec yet; its spec is written by subplan 26 of the ACP tool loop series.

## Out of scope

- Changing `src/file-read/read.ts`, including giving permission errors their own message.
- Tab completion for the `file` command (separate backlog entry).
