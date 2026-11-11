# Tab-complete the file read command against the workspace root it reads from

**Complexity: 4/10** — ~35 added lines across 3 edited files, 5 requirements, 11 test scenarios (p=5.17)

The new `file read <path>` command has no completion handler, so `completeCommandLine` falls through to `completeFilePath` rooted at the tab's shell working directory. `file r<Tab>` completes filesystem entries instead of the `read` subcommand, and on a tab whose shell has changed directory a completed path names a file that the read, rooted at the tab's workspace, reports as not found.

## Goal

- `file <Tab>` offers the `read` subcommand; `file r<Tab>` completes to `file read `.
- After `file read`, a path argument completes against the same root `readFileInTab` resolves the read against: the tab's workspace directory, else the launch directory.
- A token starting with `--` completes the `--offset` and `--limit` flags; the value after either flag gets no candidates.
- On a remote tab the path argument gets no candidates, never local filesystem entries. The subcommand and flags still complete.
- Any other `file` subcommand gets no candidates rather than falling through to shell-cwd path completion.

## Approach

1. **`src/file-read/tab-read.ts`**: export `localReadRoot(managers, label)` returning `undefined` for a tab with `remote`, else `tab.workspaceDir ?? managers.tab.launchDir`. Re-express `readFileInTab` through it so the read and the completion share one rule; its behavior is unchanged (an undefined root still reports `Remote connection unavailable.`).
2. **`src/completion/file-read.ts`** (new): `completeFileReadCommand(cursor, root)` returns `null` unless `cursor.command === 'file'`. Argument 1 completes against `['read']` with `completeWord`. Past argument 1, anything but a `read` subcommand returns `unchanged`. After a `read` subcommand, a token following `--offset`/`--limit` returns `unchanged`, a token starting with `--` completes the two flags, and otherwise the token completes with `completeFilePath` against `root`, or returns `unchanged` when `root` is undefined. Paths use `completeFilePath` rather than the quoting `pathCandidates`, because `parseFileRead` splits on whitespace and does not understand quotes.
3. **`src/completion/index.ts`**: add a trailing `fileReadRoot?: string` parameter to `completeCommandLine` and call `completeFileReadCommand(cursor, fileReadRoot)` in the handler chain ahead of the `completeFilePath` fallback.
4. **`src/controller/completion.ts`**: pass `localReadRoot(managers, tab.label)` as the new argument.

## Tests

- `src/completion/file-read.test.ts` (new):
  - `file r` completes to `file read `; `file ` lists `read`.
  - A non-`file` command returns `null`.
  - A path after `file read` completes from the given root, not from another directory.
  - A directory match gets a trailing `/`.
  - `--` lists `--limit` and `--offset`; `--o` completes to `--offset `.
  - The token after `--offset` or `--limit` returns no matches and leaves the input unchanged.
  - An undefined root (remote tab) offers no path candidates.
  - A subcommand other than `read` gets no candidates.
- `src/completion/index.test.ts`: `completeCommandLine` with a cwd different from the read root completes `file read` paths from the read root, and with no read root offers nothing rather than cwd entries.
- `src/file-read/tab-read.test.ts` (new): `localReadRoot` returns the tab's workspace, falls back to the launch directory for a tab without one or an unknown label, and returns `undefined` for a remote tab.
- `src/plugins/shell-capabilities.test.ts`: the exact-arguments assertion on `completeCommandLine` gains the read root the answering shell tab resolves to.
- `src/commands/file.test.ts` keeps passing unchanged.

## Specs and docs

- `product/specs/tab-completion.md`: describe `file read` completion (subcommand, flags, paths from the workspace root, nothing on a remote tab).
- `help/file.md`: no change unless it already describes completion.

## Out of scope

- Remote reads and remote path completion (piece 2 of subplan 5).
- Quoted paths, which the `file read` parser does not accept.
- Filtering already-used flags or a second path argument from the candidates.
