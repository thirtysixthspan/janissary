# ACP tool loop 3 — `file read` workspace reader

**Complexity: 5/10** — ~60 added lines in one new module, 11 requirements, 17 scenarios (p=5.31)

Run order: 3 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (decisions 14 and 17; the 5 MB cap in decision 15; the `read.ts` bullet of "File read"). Depends on subplans 1 and 2 (`move-janissarys-acp-tool-loop-1-file-read-parser.md`, `move-janissarys-acp-tool-loop-2-file-read-format.md`). Subplans 4, 5, 8, 13, and 18 call it.

This is the one module in the series that touches disk for `file read`. It resolves a path under a root, refuses anything outside it or secret, reads and decodes the file, and hands the text to subplan 2's formatter. It runs on whichever host owns the root: the local host for a local tab or local agent run, the far side for a remote one. That is how file contents never cross to the local machine except as the formatted result text.

## Design decisions

- **Containment** (source decision 14). The path is relative to the root. It must resolve, with symlinks followed, to a regular file inside the root. The check runs twice. First it runs lexically with `containedPath` from `src/path-containment.ts`, which also rejects an absolute path. Then it runs on the real path, comparing `realpathSync` of the file against `realpathSync` of the root with `containedAbsolute`. A symlink inside the root that points outside it is `Outside the workspace`.
- **Secrets** (source decision 14). A file named `.env` or starting with `.env.` is refused anywhere in the workspace. So is any path whose segments contain an entry of `SECRET_DENY_PATHS` (`src/sandbox/paths.ts`) as a contiguous run of segments. That covers single-segment names such as `.ssh` and `.netrc` and multi-segment ones such as `.config/gh/hosts.yml`. The rule is checked against both the path as given and the resolved path relative to the real root, so a symlink cannot launder a secret name.
- **Check order.** The order is lexical containment, then the secret rule on the given path, then existence, then real containment, then the secret rule on the resolved path, then directory, then size, then decoding. A path that is both outside and secret reports `Outside the workspace`. A missing secret file reports `Secret file`, so the reader never reveals whether a secret exists.
- **Size** (source decision 15). Size is checked with `statSync().size` before reading, and anything over 5 MB (5 × 1024 × 1024 bytes) is refused. The whole file is then read into memory, which the cap bounds. A streaming reader is the upgrade if the cap is ever raised.
- **Decoding.** Content is decoded with a fatal UTF-8 `TextDecoder`, so invalid UTF-8 is `Not a text file`. A NUL byte also counts as binary. That catches the binary files that happen to be valid UTF-8, which is what "binary or not valid UTF-8" in decision 17 asks for. A non-directory that is not a regular file, such as a FIFO or a socket, is also `Not a text file`.
- **Errors** (source decision 17). Each error is exactly one line, with `<path>` as the caller gave it:
  - `File not found: <path>.`
  - `Is a directory: <path>.`
  - `Not a text file: <path>.`
  - `File too large (>5 MB): <path>.`
  - `Outside the workspace: <path>.`
  - `Secret file: <path>.`
  
  The seventh, `Offset past end of file (<total> lines): <path>.`, comes from the formatter. The reader never throws for a filesystem condition. `ENOENT`, `ENOTDIR`, and any other filesystem error map to `File not found`, so no error message naming a resolved absolute path leaks out.
- **Command runner.** `readWorkspaceCommand(root, input)` parses with `parseFileRead` and answers `FILE_READ_USAGE` on a parse error. Otherwise it answers with `readWorkspaceLines`. The local agent-run runner (subplan 13) and the far side (subplan 18) run an extracted command with this one call, so both answer a malformed line the same way.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Lexical containment | `containedPath`, `containedAbsolute` in `src/path-containment.ts` |
| Physical containment walk used by the remote filesystem | `physicallyContainedPath` in `src/remote/filesystem/path-containment.ts` (a reference for the realpath comparison; the reader needs the file itself to exist, so it compares directly) |
| Secret path names (pure, no imports) | `SECRET_DENY_PATHS` in `src/sandbox/paths.ts` |
| Contained local read for comparison | `LocalFileSystemPort.readFile` in `src/file-navigator/filesystem-port.ts` |
| Formatter | `formatFileLines` in `src/file-read/format.ts` (subplan 2) |

## Proposed changes

New `src/file-read/read.ts`. It must not import `Managers` or the command registry, because the far side loads it.

- `readWorkspaceLines(root, args)`: takes a `FileReadArgs` and returns the formatted text or one error line, following the decisions above.
- `readWorkspaceCommand(root, input)`: the parse-then-read runner above.

## Tests

New `src/file-read/read.test.ts`, over a temporary directory:

- a text file returns numbered lines through the formatter;
- every error line:
  - a missing file;
  - a directory;
  - invalid UTF-8;
  - a NUL byte;
  - a file over 5 MB (sparse, so the test stays fast);
  - `../x`;
  - an absolute path;
  - a symlink escaping the root;
  - `.env` and `config/.env.local`;
  - `.ssh/id_rsa` and `.config/gh/hosts.yml`;
  - a symlink inside the root pointing at `.env`;
- a missing `.env` reports `Secret file`;
- `readWorkspaceCommand` answering the usage line for a malformed command and the numbered text for a valid one.

## Out of scope

Line formatting (subplan 2). Who calls the reader and which root they pass (subplans 4, 5, 8, 13, and 18). Streaming reads.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Nothing user-visible changes yet.
