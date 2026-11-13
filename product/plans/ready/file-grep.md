# Add a `file grep` command for ACP ask and tell sessions

**Complexity: 7/10** — ~410 added lines, 17 files edited, 32 requirements, 45 test scenarios (p=8.09)

`file grep` lets a person or an autonomous ACP agent find where a pattern appears inside the workspace's files. Each matching line comes back as a path, a line number, and a short preview. `file glob` (planned in `product/plans/ready/file-glob.md`) answers which paths exist; `file grep` answers what is inside them. An agent can then follow up with `file read --offset` or `file edit` on exactly the reported location. It joins `file read`, `file write`, `file edit`, and `file glob` as a subcommand of the existing `file` command and the existing ACP file tool. It runs against the same root those commands use: the local workspace, the launch directory, or a remote tab's remote clone. It never falls back to the local machine for a remote tab.

## Design decisions

Each decision comes from the feature text, from existing behavior ("from precedent"), or from a user answer ("user decision").

- **Depends on `file glob` (user decision).** This plan assumes `product/plans/ready/file-glob.md` has landed first. `file grep` slots in after `file glob` everywhere the two share a list: the native vocabulary, the default grants, the primer, completion, and the remote protocol version.
- **Command name (feature text).** `file grep`, a subcommand of the existing `file` command (`src/commands/file.ts`).
- **Who can run it (feature text).** It is a native ACP command granted by default to the built-in `ask` and `tell` roles. It is also a typed application command, matching `file read` and `file glob`.
- **Syntax (user decision).** `file grep [--literal] [--word] [--case-sensitive] [--path <path>] [--include <globs>] [--exclude <globs>] [--limit <n>] [--] <pattern>`. Flags come first, in any order, and each may appear once. The first token that isn't one of these flags starts the pattern, and the pattern is the rest of the line from there, internal spaces kept exactly as typed. So `file grep --literal request timed out` searches for `request timed out`. Surrounding whitespace on the line is trimmed. Each flag value is one whitespace-free token.
- **Dash-led patterns (user decision).** A `--` token ends the flags, and everything after it is the pattern: `file grep --literal -- --limit` searches for `--limit`. Without `--`, a token before the pattern that starts with `--` but isn't a known flag prints the usage line, so a mistyped flag name is caught rather than searched for.
- **Regular expression by default (feature text).** The pattern is a JavaScript regular expression, the engine `compileMatcher` (`src/search/compile-matcher.ts`) already uses for the search tab. Matching is line-oriented: each line is tested on its own, `^` and `$` anchor to that line, and no pattern spans two lines. `\s`, `\w`, `\b`, character classes, and lookaheads and lookbehinds are supported. No `u` flag is set.
- **Literal (feature text).** `--literal` matches the pattern as fixed text, so regex punctuation searches for itself. This is `compileMatcher`'s plain-text mode.
- **Case (user decision).** Matching is case-insensitive by default, like the search tab's Match case toggle. `--case-sensitive` turns case sensitivity on.
- **Whole word (user decision).** `--word` requires the match to sit on a word boundary, using `compileMatcher`'s whole-word mode. It composes with `--literal` and with a regular expression.
- **Output (user decision).** One line per matching line, `<path>:<line>: <preview>`, such as `src/file-read/command.ts:9: export const FILE_READ_USAGE = …`. The path is root-relative with forward slashes, even when `--path` narrows the search, so `<path>` can go straight to `file read`. Line numbers start at 1. The preview carries no match markers.
- **Order (from precedent).** Rows come in path order, then line order. Paths are in `listProjectFiles` order (sorted with `localeCompare`), the order the search tab lists them.
- **CRLF files (user decision).** Lines are split on `\n` only, as the search tab's `splitLines` (`src/search/search-files.ts`) does, so a line in a CRLF file keeps its trailing `\r` while matching. A pattern ending in `$` therefore doesn't match those lines, the same as in the search tab. The preview drops a single trailing `\r`.
- **Preview (user decision).** Leading whitespace is trimmed from the line. A trimmed line of 200 characters or fewer is shown whole. A longer one shows a 200-character window that contains the line's first match, centered on it where the line allows, with `…` marking each end that was cut. A match longer than 200 characters starts the window at the match.
- **Limit (user decision).** `--limit` defaults to 100 and accepts 1 through 250, the search tab's `SEARCH_MAX_RESULTS`. A value above 250, zero, a non-integer, or a repeated flag prints the usage line.
- **Truncation (user decision).** When more lines match than the limit, the output is the first `<n>` rows, then `(showing the first <n> matches; narrow the pattern or raise --limit)`. No total is computed.
- **Files searched (user decision).** The same set the search tab and Quick Open search, from `listProjectFiles` (`src/file-navigator/search.ts`): tracked files plus untracked files git doesn't ignore. Tracked dotfiles such as `.github/workflows/ci.yml` are searched. Outside a git repository, every file is searched except those under `.git`, `.svn`, and `.hg` (and `.DS_Store` and `Thumbs.db`). In that case `node_modules` is searched too. There is no `--hidden` flag.
- **Size and binary skips (from precedent).** A file over 2 MB (`SEARCH_MAX_FILE_BYTES`) is skipped, and so is a file with a NUL byte in its first 8 KB (`SEARCH_BINARY_PREFIX_BYTES`). Neither is reported.
- **Secret files (user decision).** A file that `file read` would refuse as `Secret file:` (`.env`, `.env.*`, any path containing a `SECRET_DENY_PATHS` run) is skipped before it is read. It never yields rows and doesn't count toward the limit.
- **Symbolic links (user decision).** Never followed. A symbolic link is skipped whether it points to a file or a directory, inside the workspace or out. Directory links were already never entered, so cycles can't happen. A `--path` that passes through a symbolic link anywhere (its real path differs from the root's real path joined with the path as typed) is treated like a skipped named file: the output is `(no matches)`.
- **`--include` and `--exclude` (user decision).** Each takes the search tab's comma-separated globs, through `filterPaths` (`src/search/filter-paths.ts`). A pattern with no `/` names a file at any depth (`*.ts`). A pattern with a `/` is anchored (`commands/*.ts`). A plain name with no wildcard selects a whole directory (`src` means `src/**`). The comma always separates patterns, so write `*.js,*.jsx` rather than `*.{js,jsx}`. Exclude wins over include.
- **Anchoring with `--path` (user decision).** Include and exclude globs are matched against paths relative to `--path`. So `file grep x --path src --include commands/*.ts` searches `src/commands/*.ts`. Output paths are still root-relative.
- **`--path` (user decision).** It names a directory to search beneath, or a single file to search on its own. With a single file, `--include` and `--exclude` are matched against the file's name. `.`, `./src`, and `src/` are accepted; the output prefix is the normalized root-relative directory (`src`), and `--path .` searches the whole root. Bad values print one line naming `--path` as typed: `Path not found: <path>.` when nothing exists there, and `Outside the workspace: <path>.` for an absolute path, a `..` escape, or a path whose real location is outside the root.
- **A named file that would be skipped (user decision).** A single file given to `--path` goes through the same filters as a directory search. If it is git-ignored, secret, a symbolic link, binary, over 2 MB, or excluded by `--include` or `--exclude`, the output is `(no matches)`. No reason is given.
- **No matches (feature text, from precedent).** The output is `(no matches)`, as in `file glob`. It is not an error.
- **Malformed regular expression (user decision).** Two lines. The first is the engine's own message for the pattern as typed, as the search tab shows it (for example `Invalid regular expression: /[unclosed/i: Unterminated character class`). The second is `Use --literal to search for the text as typed.`
- **Pattern that matches empty text (user decision).** A pattern that matches the empty string (`x*`, `^`) would match every line, so nothing is searched. The output is `Pattern matches empty text, so it would match every line: <pattern>.`
- **Timeout (user decision).** The search stops after 30 seconds. The output is then the rows found so far (or `(no matches)` if there are none), followed by `(search stopped after 30 seconds; narrow the pattern or --path)`.
- **Slow pattern (user decision).** Matching one file has the matcher worker's existing one-second deadline (`MATCHING_JOB_DEADLINE_MS`). If a file exceeds it, the search ends. The output is the rows found so far (or `(no matches)`), followed by `(search stopped: the pattern took too long on <path>; simplify it or use --literal)`, where `<path>` is root-relative.
- **Other matcher failures (from precedent).** Any other worker failure, such as the worker exiting, is not caught by the scan. It reaches the existing error handling, which prints the error's text: `CommandManager`'s catch (`src/command/manager.ts:178`, `errorText(error)`) for a typed command, and the far side's error reply for a remote one.
- **Which ending is printed.** Whichever comes first ends the search: the limit, the timeout, or a slow pattern. Only that ending's trailer line is printed.
- **Usage line (user decision).** Malformed arguments print `Usage: file grep [--literal] [--word] [--case-sensitive] [--path <path>] [--include <globs>] [--exclude <globs>] [--limit <n>] [--] <pattern>`. That covers a missing pattern, an unknown flag before the pattern, a repeated flag, a flag missing its value, and a bad `--limit`.
- **Primer (user decision).** When a role grants `file grep`, the file tool's primer includes this text after the `file glob` primer, separated from it by a blank line:
  - `To find text inside workspace files, end your reply with one line:`
  - `file grep [--literal] [--word] [--case-sensitive] [--path <path>] [--include <globs>] [--exclude <globs>] [--limit <n>] [--] <pattern>`
  - `Flags come first; the rest of the line is the pattern, a case-insensitive regular expression unless --literal or --case-sensitive. Results are path:line: text, at most 100 by default; --include and --exclude take comma-separated globs such as *.ts,*.tsx.`
  - `Example: file grep --include *.ts function\s+parse`
- **Agent runs (user decision).** Not in this version. An `agent` command run that requests `janissary file grep …` gets `Agent: command not permitted: <command>.`, with or without the `file` grant, the same way `file glob`, `file write`, and `file edit` are refused there.
- **Authorization (user decision).** The ACP gate grants or refuses `file grep` by its native command name, exactly like `file read` and `file glob`. There's no per-pattern rule and no new resource field. The pattern is visible in the full command text that the tool transcript entry and the connection record's `tool` activity lines already carry.
- **Completion (user decision).** Typing in the command bar completes `grep` after `file`. Before the pattern, a `--` token completes to the seven flags. After `--path`, it completes file and directory names. The pattern itself is never completed, and neither are the values after `--include`, `--exclude`, and `--limit`.
- **Remote tabs (feature text, from precedent).** A typed grep on a remote tab searches the remote clone only. It can also print `Remote connection unavailable.`, `The remote connection ended.`, or `The remote machine did not answer in time.`, exactly as `file read` does.
- **Transcripts and history (from precedent).** A typed grep's output carries no host tag. In a remote ACP loop, the workspace step is tagged `[<host>] ` like every other workspace step. History and transcripts record the command as typed.
- **Workspace root (from precedent).** The same root as `file read` and `file glob`: a local tab's workspace directory, or its launch or project directory when it has none; a remote tab's remote clone only; and in the ACP loop, the workspace of the host running the loop (`runsOn: 'workspace'`).

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How `file grep` uses it |
| --- | --- | --- |
| Line matcher | `src/search/compile-matcher.ts` (`compileMatcher`, `patternError`) | Literal or regex, case, whole word, the empty-match refusal, and the engine's error text. |
| Matcher worker | `src/search/matching-worker.ts` (`createMatcherWorker`, `MATCHING_JOB_DEADLINE_MS`) | Runs each file's matching off the main thread, with the one-second per-file deadline. `rows(relPath, text)` returns one row per matching line with the first match's span. |
| Candidate listing | `src/file-navigator/search.ts` (`listProjectFiles`) | The gitignore-aware file set, with its walk fallback outside git. |
| Include and exclude | `src/search/filter-paths.ts` (`filterPaths`) | The search tab's comma-separated glob rule. |
| Size and binary limits | `src/search/types.ts` (`SEARCH_MAX_FILE_BYTES`, `SEARCH_BINARY_PREFIX_BYTES`, `SEARCH_MAX_RESULTS`) | The 2 MB cap, the 8 KB NUL check, and the 250 ceiling on `--limit`. |
| Content scan model | `src/file-navigator/search-text.ts` (`searchText`) | The model for the scan, and for read-ahead if it is ever needed. It isn't reused directly, because it follows symbolic links, doesn't skip secrets, has no overall deadline, and discards every row when the worker stalls. |
| `file` command and parser model | `src/commands/file.ts`, `src/file-read/command.ts` (`parseFileRead`, `FILE_READ_USAGE`, `FILE_READ_PRIMER`, `isFileReadCommandLine`) | Routing, usage line, primer, and command-line predicate. |
| Typed root and remote port | `src/file-read/tab-read.ts` (`localReadRoot`), `src/file-read/remote-tab-port.ts` (`withRemoteTabPort`) | Root choice and remote failure lines. |
| Path policy | `src/file-read/policy.ts` (`checkLexicalPath`, `checkRealTarget`, `isSecretPath`) | `--path` containment and secret-file classification. |
| `file glob` (planned) | `product/plans/ready/file-glob.md` | The `glob-paths` remote operation, the `globPaths` port method, the primer composition, the completion branch, and the tool-table and `runWorkspace` branches that `file grep` mirrors one-for-one. |
| ACP wiring | `src/acp/tool-table.ts`, `src/acp/run-prompt.ts`, `src/remote/serve-acp-loop.ts`, `src/plugins/roles/shared.ts` (`NATIVE_ACP_COMMANDS`), `src/plugins/roles/roles-file.ts` | File tool predicate and primer, workspace routing, vocabulary, and default grants. |

## Proposed changes

Implementation decisions (user): the code lives in a new `src/file-grep/` feature directory with its own scan loop; a remote tab reaches its clone through a new read-only `grep-files` remote operation that returns formatted text; the change lands after `file glob`.

### Pure command module — `src/file-grep/command.ts`

- `FileGrepArgs` carries `pattern`, `literal`, `word`, `caseSensitive`, `path` (the `--path` value, or `undefined` for the root), `include`, `exclude` (empty strings when absent), and `limit`.
- `parseFileGrep(input)` returns `FileGrepArgs` or `{ error: FILE_GREP_USAGE }`, in the shape of `parseFileRead`. It trims the input, requires `file grep`, then walks the flag tokens from the front until `--` or the first token that isn't a known flag. The pattern is the remainder of the trimmed input from that token's offset, so internal whitespace survives. `--limit` defaults to 100 (`FILE_GREP_DEFAULT_LIMIT`) and must be 1 through `SEARCH_MAX_RESULTS`.
- `FILE_GREP_USAGE`, `FILE_GREP_PRIMER` (the four primer lines from Design decisions, joined by newlines), and `isFileGrepCommandLine(line)`, which matches `^file\s+grep(\s|$)` case-insensitively, mirroring `isFileReadCommandLine`.

### Pure formatter — `src/file-grep/format.ts`

- `previewLine(line, start, end)` drops a single trailing `\r`, trims leading whitespace, shifts the span to match, and applies the 200-character window rule with `…` on each cut end.
- `formatGrepResult(rows, ending)` prints `<path>:<line>: <preview>` per row, or `(no matches)` when there are none, then the trailer for `ending`. `ending` is `undefined`, `{ kind: 'limit', limit }`, `{ kind: 'timeout' }`, or `{ kind: 'slow', path }`.

### Scan — `src/file-grep/scan.ts`

- `scanFiles(root, relPaths, args, deadline)` takes root-relative candidate paths and matches them one at a time, in order, in a plain loop. Deliberate ceiling: only one file is read at a time, so a large tree on a slow disk reaches the 30-second stop sooner than the search tab would. If that shows up, add read-ahead modelled on the `reads` map and `scheduleReads` in `searchText` (`src/file-navigator/search-text.ts:33`). Before reading, each candidate is skipped when its root-relative path is a secret, or when an `lstat` shows a symbolic link, a non-regular file, or more than `SEARCH_MAX_FILE_BYTES`. A read text with a NUL in its first `SEARCH_BINARY_PREFIX_BYTES` is skipped. The rest go to one `createMatcherWorker(pattern, { regex: !literal, matchCase: caseSensitive, wholeWord: word }, signal)` for the whole scan, disposed in a `finally`. Each file is passed to `rows(relPath, text)` with its root-relative path, so the returned `SearchMatch` rows already carry the output path, and `line`, `match`, `start`, and `end` feed the formatter (`above` and `below` are ignored).
- The secret test is `isSecretPath` in `src/file-read/policy.ts:23`, which this change exports unchanged. It splits on `path.sep`, which is `/` on every host the workspace runs on, so the forward-slash candidate paths work as given.
- The scan stops when it holds `limit + 1` rows (ending `limit`; only the first `limit` are printed), when the deadline has passed before the next file is matched (ending `timeout`), or when `rows()` rejects with the worker's deadline error (ending `slow`, naming that file). Any other rejection is rethrown. `GREP_TIMEOUT_MS` is 30 000.
- To tell the deadline apart from other failures without matching message text, `src/search/matching-worker.ts` exports a `MatcherDeadlineError` class (extending `Error`) and throws it at its one deadline site, `terminate(new Error(\`Search matching exceeded its ${deadline} ms deadline\`))` in `request`. The message stays the same, so the search tab's output doesn't change. The scan tests `instanceof MatcherDeadlineError`.
- The lexical secret check is enough per candidate because symbolic links are never followed, so a candidate's real path is the real root joined with its relative path. The home-anchored half of the secret rule is applied once, to `--path` itself, by `checkLexicalPath` in `grep.ts`.

### Workspace entry — `src/file-grep/grep.ts`

- `grepWorkspace(root, args, deadline)` is the one workspace entry. It returns the bad-regex lines (from `patternError(pattern, modes)`) or the empty-match line (when `compileMatcher(pattern, modes)` returns `null`) before touching the disk. Both calls use the same `MatcherModes` the scan passes to the worker.
- It then resolves `--path`, in this order. `checkLexicalPath(root, path)`: `Outside the workspace` prints `Outside the workspace: <path>.`; `Secret file` yields `(no matches)`. `realpath` of the target: a missing target prints `Path not found: <path>.`. `checkRealTarget(realpath(root), realTarget)`: `Outside the workspace` prints that line. A real path that differs from `realpath(root)` joined with the lexical relative path means a symbolic link was crossed, and yields `(no matches)`. Finally a `stat` tells a directory from a file.
- A directory's candidates are `listProjectFiles(searchDir)` narrowed by `filterPaths(…, include, exclude)`, then prefixed with the directory's root-relative path (`path.relative(root, searchDir)`, forward slashes, empty for the root). A file's candidates are `listProjectFiles(parentDir)` reduced to the one entry equal to the file's name, then narrowed and prefixed the same way, so a git-ignored file falls out. It then calls `scanFiles` and `formatGrepResult`.
- `grepWorkspaceCommand(root, input)` parses and calls `grepWorkspace` with a fresh deadline, returning the usage line on malformed input. It is the far-side entry used by the remote ACP loop and by the remote operation.

### Typed entry — `src/file-grep/tab-grep.ts`

- `grepFilesInTab(managers, label, input)` parses, then uses `localReadRoot` from `src/file-read/tab-read.ts` to pick the local root, or `withRemoteTabPort` from `src/file-read/remote-tab-port.ts` with prefix `file-grep` to send `grep-files` on a remote tab. Remote refusals and connection failures map to the same lines `readFileInTab` prints. To do that, `tab-read.ts` exports its existing `asTyped` (rewrites a far-side `<reason>: <sent path>.` line back to the typed path) and `rejectionLine` (maps `OUTSIDE_ROOT_REASON` and `REMOTE_UNAVAILABLE`), and `grepFilesInTab` uses them exactly as `readRemoteFile` does. If `file glob` already exported them, reuse those exports.

### Remote protocol

- `src/remote/protocol-frames.ts` adds `'grep-files'` to the operation union with args `{ pattern: string; literal: boolean; word: boolean; caseSensitive: boolean; path?: string; include: string; exclude: string; limit: number }`.
- A new `src/remote/filesystem/grep-files-operation.ts`, modelled on `glob-paths-operation.ts`: `valid`/`decode` check each field's type and that `limit` is an integer from 1 to `SEARCH_MAX_RESULTS`. `paths` returns `[args.path]` when present (else `[]`), with `rootDestination: true`. `run` returns a promise of `{ text }` from `grepWorkspace(context.root, …)`. It's registered in `src/remote/filesystem/operations.ts`, with a `'grep-files'` `{ text: string }` decoder in `src/remote/filesystem/result-decoders.ts`.
- A `remoteGrepFiles(request, paths, root, args)` helper goes in `src/file-navigator/remote/port-reads.ts` beside `remoteReadLines` and `remoteGlobPaths`, and returns the same `{ text, path }` pair as `remoteReadLines`: an absolute `--path` is answered locally with `Outside the workspace: <path>.`, and a relative one is mapped with `paths.to(root, path)` and sent. `RemoteFileSystemPort` gains a one-statement `grepFiles` method that delegates to it, like `readLines` (`src/file-navigator/remote/port.ts:121`). The standard 60-second request deadline is enough, because the far side stops at 30 seconds, so `grep-files` is not added to the long-running list in `port-requests.ts`.
- `port.ts` is at 196 lint-counted lines today, and `file glob`'s `globPaths` adds three. `grepFiles` adds three more, which crosses 200. So first move the private `createItem` method into `src/file-navigator/remote/port-mapped.ts` as `remoteCreateItem(request, paths, root, destination, operation)`, the same split `port-moves.ts` uses, with `createFile` and `createDirectory` calling it through `this.requester()`. Measure again after `file glob` lands; if glob already made room, skip the move.
- `src/remote/filesystem/operations.ts` is at 194 lint-counted lines and gains one import and one table entry (glob adds the same two), which stays under 200.
- `REMOTE_PROTOCOL_VERSION` in `src/remote/protocol.ts` goes up by one past `file glob`'s bump, with a comment in the existing style explaining that an older remote would refuse `grep-files`.

### Commands, roles, and the ACP tool loop

- `src/commands/file.ts` routes a `file grep` line (by `isFileGrepCommandLine`) to `grepFilesInTab`, and adds the samples `file grep TODO` and `file grep --literal --include *.md request timed out`.
- `NATIVE_ACP_COMMANDS` adds `file grep` right after `file glob`. The built-in `ask` and `tell` command lists in `src/plugins/roles/roles-file.ts` add `file grep` right after `file glob`, so ask grants nine commands and tell grants fourteen. Saved roles files are not changed, and `ROLES_PAYLOAD_SCHEMA_VERSION` stays where it is.
- `src/acp/tool-table.ts`: the `file` tool's `isCommandLine` also accepts `isFileGrepCommandLine`; `filePrimer` inserts `FILE_GREP_PRIMER` after the glob primer when `file grep` is granted; `gateAgentCommand` refuses `isFileGrepCommandLine` input with `Agent: command not permitted: <command>.`.
- `src/acp/run-prompt.ts` `runWorkspace` and `src/remote/serve-acp-loop.ts` `runWorkspace` each add a grep branch beside the glob branch, ahead of the read fallback, routing to `grepFilesInTab` and `grepWorkspaceCommand` respectively. The third `runWorkspace`, in `src/agent/execute.ts`, is left alone, because `gateAgentCommand` refuses an agent's grep first.
- Order of landing, to keep typecheck green at each step: the `MatcherDeadlineError` and `isSecretPath` exports; the pure command and format modules; the scan and workspace entry; the remote operation and port (with the `createItem` move if needed); the typed entry and `src/commands/file.ts`; then the vocabulary, grants, tool table, and both `runWorkspace` branches together; then completion.

### Completion

- `completeFileReadCommand` in `src/completion/file-read.ts` adds `grep` to `FILE_SUBCOMMANDS`. When `preceding[1]` is `grep`, it walks `preceding` from index 2: a known flag that takes a value consumes the next token, a known boolean flag consumes nothing, and any other token (including `--`) means the pattern has started. Once the pattern has started, the token is left unchanged. Otherwise the token after `--path` completes file and directory names through `completeFilePath(cursor, root)`; the token after `--include`, `--exclude`, or `--limit` is left unchanged; and a token starting with `--` completes the seven flags. Paths complete against the same `fileReadRoot` the caller in `src/completion/index.ts:78` already passes, so a remote tab completes no paths. If this function would pass 200 lines or the cognitive-complexity limit, put the grep branch in its own `src/completion/file-grep.ts` and call it from there.

### Help and specs

- `help/file.md` documents `file grep` with its flags and an example.
- `product/specs/acp.md` gains a `### File grep` section after `### File glob` that states every rule in Design decisions, updates the default-grant counts (ask nine, tell fourteen), and adds the grep primer text. `product/specs/roles.md` updates its grant lists and counts. `product/specs/agent-command.md` notes that `janissary file grep …` returns `Agent: command not permitted` in this version.

## Tests

- `src/file-grep/command.test.ts`: each flag in any order before the pattern; defaults; a pattern with internal spaces kept exactly; `--` ending the flags; the usage line for a missing pattern, an unknown flag, a repeated flag, a flag with no value, `--limit 0`, `--limit 251`, and `--limit x`; `isFileGrepCommandLine`.
- `src/file-grep/format.test.ts`: the row form; `(no matches)`; each trailer; the preview window for a short line, a long line with an early, middle, and late match, and a match longer than 200 characters; leading-whitespace trimming; a trailing `\r` dropped.
- `src/file-grep/scan.test.ts`, against a temporary directory: secret files skipped and not counted; symbolic links to files skipped; oversize and binary files skipped; the limit and `limit + 1` stop, with no trailer when exactly `limit` rows match; the timeout ending with an already-passed deadline; the slow ending naming the file, with earlier rows kept, driven by a pattern such as `(a+)+$` against a long run of `a`s followed by `b`.
- `src/search/matching-worker.test.ts`: the deadline rejection is a `MatcherDeadlineError` with the unchanged message.
- `src/file-grep/grep.test.ts` also covers `--path` through a symbolic link yielding `(no matches)` and `--path ./src/` printing `src/…` paths.
- `src/file-grep/grep.test.ts`, against a temporary directory: regex, literal, case, and whole-word matching; root-relative paths under `--path`; `--path` naming a file; include and exclude anchored to `--path`; a git-ignored file skipped inside a temporary git repository; each bad-`--path` line; the bad-regex and empty-match lines.
- `src/file-grep/tab-grep.test.ts`, mirroring `src/file-read/tab-read.test.ts`: local root choice, `Remote connection unavailable.` for a remote tab with no channel, and a far-side `Path not found: <sent>.` rewritten to the typed path.
- `src/remote/filesystem/operations.test.ts`: the `grep-files` descriptor decodes its args and result.
- The ACP tool-table and primer tests: grep primer placement, gate refusal for an ungranted or agent-run grep, and the extractor recognizing a `file grep` line.
- The roles default-grant tests for `ask` and `tell`, and the native-command vocabulary order.
- `src/commands/file.test.ts`: a `file grep` line routes to the grep entry.
- The completion tests beside `src/completion/file-read.test.ts`.

## Out of scope

- Editing or replacing text; `file grep` only reports locations.
- Any web UI beyond the command's transcript output.
- Context lines around a match, multi-line patterns, and count-only output.
- A total match count.
- A `--hidden` flag, or searching git-ignored files.
- Brace lists in `--include` and `--exclude`.
- Following symbolic links.
- `file grep` for `agent` command runs.
- Per-pattern authorization rules or a resource field.
- A `--limit` above 250.
- Making `$` match before a CRLF line ending.

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- Manual, local tab: run `file grep FILE_READ_USAGE --path src` and confirm `src/…:<line>: …` rows. Run `file grep --literal --include *.md request timed out` and confirm only Markdown rows containing that phrase. Run `file grep --limit 3 import` and confirm three rows plus the truncation line. Run `file grep [unclosed` and confirm the engine message plus the `--literal` hint. Run `file grep x --path missing` and confirm `Path not found: missing.`
- Manual, ACP: open an `ask` session, ask it where `FILE_READ_USAGE` is defined, and confirm it emits one `file grep` line and receives the `src/file-read/command.ts:9:` row.
