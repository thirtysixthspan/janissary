<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Make the file command help page's error conditions match the reader, which prints `File not found` for any unreadable file and `Not a text file` for any non-regular file.

Existing Issue: The help page says `File not found` is printed for a missing path and `Not a text file` for binary or non-UTF-8 content, while `loadBytes` in the reader returns `File not found` for every exception (an existing file without read permission included) and `Not a text file` for any path that is not a regular file (a FIFO, socket, or device), so two of the documented rules state narrower conditions than the code applies. Severity: 2/10

Existing Risk: 2/10 - A user who sees `File not found` for a file that plainly exists, because it is unreadable, has nothing in the help page to explain it and goes looking for a path typo that is not there.

Proposal Risk: 1/10 - The page then describes the reader's real behavior; if the reader later distinguishes permission errors, the help sentence has to change with it, which a reviewer comparing the two would see.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1992 "align the file help page's error conditions with the reader". In `help/file.md`, under **Errors**, add a condition to the `File not found: <path>.` bullet saying it is also printed when the file exists but cannot be read, and extend the `Not a text file: <path>.` bullet so it names anything that is not a regular file (such as a named pipe or device) alongside binary content and invalid UTF-8. Ground both clauses in `loadBytes` and `decodeText` in `src/file-read/read.ts` (the catch-all `catch` returning `File not found`, the `!stats.isFile()` branch, and the NUL-byte check). Do not change `src/file-read/read.ts`. Verify by reading each bullet against those branches and `src/file-read/read.test.ts`, and run the diff-scoped checks so `src/commands.test.ts` still passes.


* Handle tab completion for the new file command, which today offers no `read` subcommand and completes paths against the shell's current directory instead of the workspace root the read uses.

Existing Issue: The commit adds `file read <path>` without a completion handler, so `completeCommandLine` falls through to `completeFilePath` with the tab's shell working directory from `workingDirOf`, which means `file r<Tab>` completes filesystem entries instead of `read`, and a path completed on a tab that has `cd`'d away from its workspace names a file the command then resolves against `workspaceDir` and reports as not found. Severity: 3/10

Existing Risk: 3/10 - Users on a tab whose shell has changed directory accept a completed path and get `File not found`, since the plan deliberately roots the read at the workspace rather than the shell's directory.

Proposal Risk: 1/10 - Completion and the read share one root, so a completed path resolves; the residual hazard is a remote tab, where the completer should offer nothing rather than local paths, which a test should pin.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1992 "add tab completion for file read rooted at the workspace". Add a `completeFileReadCommand(cursor, root)` handler in a new `src/completion/file-read.ts` (or beside `completeSearchCommand` in `src/completion/handlers.ts` if it stays small): for `cursor.command === 'file'`, argument 1 completes against `['read']` with `completeWord`, and argument 2 and later after a `read` subcommand complete paths with `pathCandidates`/`completeFilePath` from `src/completion/candidates.ts` and `src/completion/fs.ts` against the given root, offering `--offset`/`--limit` when the token starts with `--`; return `null` when `root` is undefined. In `src/controller/completion.ts`, compute the root with the same rule as `readFileInTab` in `src/file-read/tab-read.ts` (undefined for a tab with `remote`, else `workspaceDir ?? managers.tab.launchDir`), ideally by exporting a small `localReadRoot(managers, label)` helper from `tab-read.ts` that both call so the two can never disagree, and pass it through `completeCommandLine` in `src/completion/index.ts` ahead of the `completeFilePath` fallback. Add colocated tests: `file r` completes to `read `, a path completes from the workspace root when the cwd differs, and a remote tab gets no path candidates. Existing `src/completion/index.test.ts` and `src/completion/handlers.test.ts` must keep passing; `src/commands/file.test.ts` covers `readFileInTab` and must not change behavior.
