# Share one file-command implementation between local commands and far-side handlers

**Complexity: 7/10** — ~210 added lines across 10 production files, 12 requirements and 24 test scenarios (p=6.82).

This resolves the recorded pull-request review entry whose summary is "Remove the technical debt of duplicated file-command logic by sharing one implementation between the local commands and the far-side handlers." The four local `tab-*` executors and the six far-side filesystem descriptors currently answer `file list`, `file stat`, `file exists`, `file head`, and `file tail` from two copies of the same logic, held together only by parity tests.

## Goal

Make the local executors and the far-side handlers call one implementation per command, so row wording, type words, and error mapping cannot drift between a local tab and a remote tab. The user-visible answers stay the same; the guarantee becomes structural instead of test-enforced.

## Design decisions

- Extract each command's body, below command parsing and root resolution, into a shared pure module under its own feature directory. A shared function takes the already-parsed arguments plus `root` and, where the command needs filesystem access, an optional `FileSystemPort` defaulting to `new LocalFileSystemPort()`. It returns the finished answer text; it never knows about `Managers`, tab labels, or dispatcher framing.
- `listFiles(root, requested, port?)` owns the lexical check, the lstat directory check with the existing `filesystemFailure` mapping (`ENOENT`/`ENOTDIR` to `missing`, every other code, including `EACCES`, to `forbidden`), the `readDirectory` rejection guard returning `forbidden`, secret filtering, `statRows`, and row assembly through `formatFileRow`. The far side therefore stops mapping every `readRowStat` miss to `missing`, which is the concrete drift the review names.
- `statFile(root, requested, port?)` owns the lexical check, `statRows`, and `formatFileRow`.
- `fileExists(root, requested)` owns `typeWord`, `resolveExisting`, `resolveRealTarget`, and the `checkRealTarget` / `readRowStat` path. No port is needed.
- `headTail(root, parsed)` owns `countLines`, `directoryFailureLine`, and the head/tail branch selection. Export `countLines` and `directoryFailureLine` from the same module so the far side stops carrying its own copies.
- Keep `fileFailureLine`, `formatFileRow`, `formatFileLines`, `readWorkspaceLines`, and `readWorkspaceText` as the single failure vocabulary and formatter set; the extracted modules import them rather than redefining them.
- Each `tab-*` function becomes a thin wrapper: parse the input, bail on a parse error, resolve `localReadRoot(managers, label)`, and return the shared module's answer, passing the local port where one is used. Each far-side `run` becomes a thin wrapper that passes `context.root` and `context.filesystem` into the same module and wraps the text in `{ text }`.
- `head-tail-support.ts` keeps only argument validation (`validLineCount`, `decodeLineCount`); its duplicated `countLines` and `directoryFailureLine` are deleted. `head-lines-operation.ts` and `tail-lines-operation.ts` call `headTail` with the appropriate direction instead of assembling the answer themselves.
- No re-export barrels, no new comments except where an existing non-obvious why moves with the code, `.js` relative import extensions in `src/`, and every new or edited source file stays under the 200-line `max-lines` limit by construction.

## What already exists (reuse, don't rebuild)

| Piece | Where |
| --- | --- |
| One-word failure vocabulary | `src/file-failure.ts` |
| Fixed row formatter | `src/file-row.ts` |
| Numbered-line formatter, workspace readers | `src/file-read/format.ts`, `src/file-read/read.ts` |
| Path policy, canonicalization, secret rule | `src/file-read/policy.ts`, `src/file-read/canonical.ts` |
| Port contract and local port | `src/file-navigator/filesystem-port.ts` |
| Local root rule | `src/file-read/tab-read.ts` |
| Parsers for all four commands | `src/file-list/command.ts`, `src/file-stat/command.ts`, `src/file-exists/command.ts`, `src/file-head-tail/command.ts` |
| Far-side descriptors and argument checks | `src/remote/filesystem/operation-types.ts`, `src/remote/filesystem/argument-checks.ts` |
| Parity test workspace | `src/remote/filesystem/descriptor-test-workspace.ts` |

## Proposed changes

- Add `src/file-list/list-core.ts`, `src/file-stat/stat-core.ts`, `src/file-exists/exists-core.ts`, and `src/file-head-tail/head-tail-core.ts` with the shared functions described above.
- Reduce `src/file-list/tab-list.ts`, `src/file-stat/tab-stat.ts`, `src/file-exists/tab-exists.ts`, and `src/file-head-tail/tab-head-tail.ts` to parse-plus-root wrappers.
- Replace the bodies of `list-directory-operation.ts`, `stat-path-operation.ts`, `path-exists-operation.ts`, `head-tail-support.ts`, `head-lines-operation.ts`, and `tail-lines-operation.ts` with calls into the shared modules, removing their now-unused imports and duplicated helpers.
- Add two parity cases to the far-side tests: an unreadable directory whose read fails with `EACCES`, asserting both surfaces answer `forbidden`; and a non-regular file type (a FIFO), asserting both surfaces answer the fallback type word `file`.

## Tests

- Keep every existing parity assertion in `src/remote/filesystem/*.test.ts` byte-for-byte unchanged; they exercise the shared path from both surfaces.
- In `list-directory-operation.test.ts`, inject a port whose `readDirectory` throws an `EACCES`-coded error, compare the far-side answer with `listFilesInTab` using the same port, and pin `forbidden` on both.
- In `path-exists-operation.test.ts`, create a FIFO, compare the far-side answer with `fileExistsInTab`, and pin `file` on both without echoing the path.
- Rely on the existing local executor suites (`tab-list.test.ts`, `tab-stat.test.ts`, `tab-exists.test.ts`, `tab-head-tail.test.ts`) to pin the wrappers still resolve roots and parse arguments correctly.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after the source changes and again after the tests; confirm lint, typecheck, and both test projects are clean, with no source file over 200 lines.

## Out of scope

No protocol or version change, no new command or flag, no change to the answers themselves beyond the shared error mapping, no help or user-documentation rewrite, and no change to the pending feature subplans still in `product/plans/ready/`.
