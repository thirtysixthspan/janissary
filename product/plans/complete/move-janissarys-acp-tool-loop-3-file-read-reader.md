# ACP tool loop 3 — `file read` workspace reader

**Complexity: 5/10** — ~70 added lines in one new module and no edited files, 13 requirements, 30 test scenarios across containment, secrets, type, size, and decoding (p=5.67)

Run order: 3 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (decisions 14 and 17; the 5 MB cap in decision 15; the `read.ts` bullet of "File read"). Depends on subplans 1 and 2 (`product/plans/complete/move-janissarys-acp-tool-loop-1-file-read-parser.md`, `product/plans/complete/move-janissarys-acp-tool-loop-2-file-read-format.md`), which have both landed: `parseFileRead`, `FileReadArgs`, and `FILE_READ_USAGE` exist in `src/file-read/command.ts`, and `formatFileLines` exists in `src/file-read/format.ts`. Subplans 4, 5, 8, 13, and 18 call it.

This is the one module in the series that touches disk for `file read`. It resolves a path under a root, refuses anything outside it or secret, reads and decodes the file, and hands the text to subplan 2's formatter. It runs on whichever host owns the root: the local host for a local tab or local agent run, the far side for a remote one. That is how file contents never cross to the local machine except as the formatted result text.

The source plan's `read.ts` bullet also gives the reader the numbering, the truncation notice, and the empty-file text. Subplan 2 moved all of that into `formatFileLines`, so this module does none of it.

## Design decisions

- **Synchronous.** Both exported functions return a `string` synchronously, using the `node:fs` `*Sync` calls. Every caller accepts that: subplan 10's host runners may return text "synchronously or as a promise", subplan 4's far-side `run` returns the text in its result, and subplan 5's `readFileInTab` is async and simply returns it.
- **Root.** `root` is a directory path as the caller has it, absolute or relative, and is not assumed to be a real path. The reader resolves it once with `realpathSync` for the physical checks. On macOS the test temp directory under `/var` is itself a symlink to `/private/var`, which is why the real comparison must use the real root and not `root` as given. If the root itself cannot be resolved, the result is `File not found: <path>.`.
- **Path as given.** `args.path` is never rewritten. Every error line names it exactly, and `args` goes to `formatFileLines` unchanged, so the formatter's offset error names it too. Normalizing happens only on private copies used for the checks.
- **Containment** (source decision 14). The path is relative to the root. It must resolve, with symlinks followed, to a regular file inside the root. The check runs twice.
  - Lexically: an absolute `args.path` (`path.isAbsolute`) is `Outside the workspace`. Otherwise the reader resolves it with `path.resolve(root, args.path)` and requires `containedAbsolute(root, resolved)` from `src/path-containment.ts`. Use `containedAbsolute`, not `containedPath`: `containedPath` also returns nothing for `''`, `.`, and `..`, which would make `.` an `Outside the workspace` error while `a/..` (which resolves to the root) passes. With `containedAbsolute`, `''`, `.`, and `a/..` all name the root and fall through to `Is a directory`, and only `..` and `../`-prefixed paths escape.
  - Physically: `realpathSync` of the lexically resolved path, compared against the real root with `containedAbsolute`. A symlink inside the root that points outside it is `Outside the workspace`.
- **Secrets** (source decision 14). The rule works on path segments relative to the root, split on `path.sep`, compared case-insensitively (both sides lowercased), so `.ENV` or `.SSH/id_rsa` on a case-insensitive macOS volume cannot slip past it. A path is secret when either:
  - its last segment is `.env` or starts with `.env.`, so `.env.local` and `.env.example` are refused but `.envrc` is not, and a directory named `.env` (a common virtualenv name) is not secret by itself; or
  - an entry of `SECRET_DENY_PATHS` (`src/sandbox/paths.ts`), split on `/`, occurs as a contiguous run of segments anywhere in the path. That covers single-segment names such as `.ssh` and `.netrc`, also under a subdirectory (`notes/.ssh/key`), and multi-segment ones such as `.config/gh/hosts.yml`.
  
  The rule runs twice. The first run uses `path.relative(root, resolved)` from the lexical check, never the raw `args.path`, so `foo/../.env` counts as `.env` before any disk access. The second run uses `path.relative(realRoot, realFile)`, so a symlink cannot launder a secret name in either direction.
- **Check order.** The order is lexical containment, then the secret rule on the lexical path, then existence (the `realpathSync` calls), then real containment, then the secret rule on the resolved path, then type (directory, then non-regular), then size, then decoding. Consequences an implementer must keep:
  - a path that is both outside and secret reports `Outside the workspace`;
  - a missing secret file reports `Secret file`, so the reader never reveals whether a secret exists;
  - a dangling symlink, wherever it points, reports `File not found`, because `realpathSync` fails before the real containment check.
- **Type.** Type and size come from one `statSync` of the real path, taken before any read. A directory is `Is a directory`. Anything else that is not a regular file, such as a FIFO or a socket, is `Not a text file`. The `stat` must come before the read because opening a FIFO blocks.
- **Size** (source decision 15). The cap is a new exported constant in `read.ts`, `FILE_READ_MAX_BYTES` = 5 × 1024 × 1024. A file whose `size` is greater than the cap is `File too large (>5 MB)`. A file of exactly the cap is read. The whole file is then read into memory with `readFileSync` on the real path, which the cap bounds. A file that grows between the `stat` and the read is accepted as read: the cap bounds memory, and no caller of `file read` can write files. A streaming reader is the upgrade if the cap is ever raised.
- **Decoding.** Content is decoded with `new TextDecoder('utf-8', { fatal: true })`, so invalid UTF-8 is `Not a text file`. Leave `ignoreBOM` at its default (`false`): that is what drops a leading UTF-8 byte-order mark, and `formatFileLines` does not strip one (subplan 2 relies on this). A decoded text containing a NUL character (U+0000) is also `Not a text file`. That catches the binary files that happen to be valid UTF-8, which is what "binary or not valid UTF-8" in decision 17 asks for. Decode once per call; the decoder is cheap and keeping no module state keeps the far side's import side-effect free.
- **Errors** (source decision 17). Each error is exactly one line, with `<path>` as `args.path`:
  - `File not found: <path>.`
  - `Is a directory: <path>.`
  - `Not a text file: <path>.`
  - `File too large (>5 MB): <path>.`
  - `Outside the workspace: <path>.`
  - `Secret file: <path>.`
  
  The seventh, `Offset past end of file (<total> lines): <path>.`, comes from the formatter. The reader never throws for a filesystem condition. Wrap the `realpathSync`, `statSync`, and `readFileSync` calls so that `ENOENT`, `ENOTDIR`, `EACCES`, `ELOOP`, and any other filesystem error map to `File not found`, and no error message naming a resolved absolute path leaks out. Subplan 5 relies on every error line ending with `: <path>.` to rewrite a far-side path back to the typed spelling, so keep that exact suffix on all six.
- **Command runner.** `readWorkspaceCommand(root, input)` parses `input` (the extracted command line, for example `file read a.md --limit 5`) with `parseFileRead`. On a parse error it answers the result's `error`, which is `FILE_READ_USAGE`. Otherwise it answers `readWorkspaceLines(root, args)`. The local agent-run runner (subplan 13) and the far side (subplan 18) run an extracted command with this one call, so both answer a malformed line the same way.
- **Imports.** `read.ts` imports only `node:fs`, `node:path`, `../path-containment.js`, `../sandbox/paths.js` (which has no imports of its own), `./command.js`, and `./format.js`, with `.js` extensions per the NodeNext rule and `FileReadArgs` as a type-only import. It must not import `Managers`, the command registry, or anything under `src/remote/`, because the far side loads it.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Lexical containment | `containedAbsolute` in `src/path-containment.ts` (and why not `containedPath`, above) |
| Physical containment walk used by the remote filesystem | `physicallyContainedPath` in `src/remote/filesystem/path-containment.ts`: a reference for the `realpathSync` comparison only. It walks up to the nearest existing parent because a write target may not exist yet; the reader needs the file itself to exist, so it compares directly and must not import it (it lives under `src/remote/`) |
| Secret path names (pure, no imports) | `SECRET_DENY_PATHS` in `src/sandbox/paths.ts` |
| Contained local read for comparison | `LocalFileSystemPort.readFile` in `src/file-navigator/filesystem-port.ts` (lexical check only, throws `OUTSIDE_ROOT_REASON`; the reader returns error lines instead) |
| Parser and usage line | `parseFileRead`, `FileReadArgs`, `FILE_READ_USAGE` in `src/file-read/command.ts` (subplan 1) |
| Formatter | `formatFileLines(text, args)` in `src/file-read/format.ts` (subplan 2); it never throws and does not strip a BOM |
| Temp-directory test setup | `mkdtempSync(path.join(tmpdir(), ...))` with `rmSync(..., { recursive: true, force: true })` in `afterEach`, as in `src/database/export.test.ts` |

## Proposed changes

New `src/file-read/read.ts`, expected around 70 lines, well under the 200-line limit:

- `FILE_READ_MAX_BYTES`: the 5 MB cap above, exported for the test.
- `readWorkspaceLines(root, args)`: takes a `FileReadArgs` and returns the formatted text or one error line, following the decisions above.
- `readWorkspaceCommand(root, input)`: the parse-then-read runner above.

Keep `readWorkspaceLines` under the `sonarjs/cognitive-complexity` limit of 15 by putting the secret rule in a private `isSecretPath(relative)` helper and the resolve-stat-read sequence (with its `try`/`catch`) in a private helper that returns either the bytes or the error kind.

## Tests

New `src/file-read/read.test.ts`, over a temporary directory created per test as in `src/database/export.test.ts`, passing the `mkdtempSync` path as the root unchanged (on macOS it is not a real path, which exercises the real-root comparison). Build arguments with `parseFileRead` or as plain `FileReadArgs`:

- a text file returns numbered lines through the formatter, and `--offset`/`--limit` reach the formatter;
- a file starting with a UTF-8 byte-order mark reads without it on line 1;
- an offset past the end returns the formatter's error naming the path as given;
- every error line, each asserted as the exact string with the path as given:
  - a missing file, a dangling symlink, and `a.txt/b` under a regular file;
  - a directory, `.`, and `a/..`;
  - invalid UTF-8;
  - a NUL byte;
  - a Unix socket (created with `net.createServer().listen(<path in the temp dir>)`, closed after the test);
  - a file over `FILE_READ_MAX_BYTES` (sparse, made with `truncateSync`, so the test stays fast), and a file of exactly `FILE_READ_MAX_BYTES` bytes of text that is read;
  - `../x`, `..`, and an absolute path;
  - a symlink escaping the root;
  - `.env`, `config/.env.local`, `.env.example`, and `.ENV`;
  - `.ssh/id_rsa`, `notes/.ssh/key`, and `.config/gh/hosts.yml`;
  - a symlink inside the root pointing at `.env`, and a symlink named `.env` pointing at an ordinary file;
- `.envrc` and a file inside a directory named `.env` are read normally;
- a missing `.env` and a missing `foo/../.env` report `Secret file`;
- a path that is both outside and secret (`../.env`) reports `Outside the workspace`;
- `readWorkspaceCommand` answering `FILE_READ_USAGE` for a malformed command and the numbered text for a valid one.

## Out of scope

Line formatting (subplan 2). Who calls the reader and which root they pass (subplans 4, 5, 8, 13, and 18). Rewriting a normalized far-side path back to the typed one (subplan 5). Streaming reads. Opening the file by descriptor to close the stat-to-read race.

## Verification

Run `$janissary/scripts/run.mjs check-diff`: it lints the new files, typechecks, and runs `src/file-read/read.test.ts`. Confirm `src/file-read/read.ts` imports nothing beyond the list under "Imports". There is no manual end-to-end check yet, because nothing user-visible changes until subplan 5 registers the typed command.
