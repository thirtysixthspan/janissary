# Add a `file glob` command for ACP ask and tell sessions

**Complexity: 7/10** — ~365 added lines, 14 files edited, 25 requirements, 35 test scenarios (p=7.72)

`file glob` lets a person or an autonomous ACP agent list the files in the workspace whose paths match a glob pattern, without reading any contents. Agents today can `file read` a path they already know, but they have no cheap way to discover which paths exist, so they guess names or ask. A glob tool closes that gap: discover names first, then read or edit them. It joins `file read`, `file write`, and `file edit` as a fourth subcommand of the existing `file` command and the existing ACP file tool, and it works against the same root those commands use — the local workspace, the launch directory, or a remote tab's remote clone — never falling back to the local machine for a remote tab.

## Design decisions

Each decision comes from the feature text, from existing behavior ("from precedent"), or from a user answer ("user decision").

- **Command name.** `file glob`, a subcommand of the existing `file` command (`src/commands/file.ts`), alongside `file read`, `file write`, and `file edit`.
- **Who can run it.** It is a native ACP command granted by default to the built-in `ask` and `tell` roles, and it is also a typed application command, matching how `file read` is both.
- **Syntax (user decision).** `file glob <pattern> [--path <dir>] [--hidden] [--dirs] [--limit <n>]`, in the flag style of `file read`. The pattern is one whitespace-free token, the same rule `file read` applies to its path. Flags may appear in any order, before or after the pattern; each may appear once.
- **Glob semantics.** `**` matches zero or more directory segments, `*` matches within one segment, `?` matches one character, and `{a,b}` is alternation, as implemented by Node's `path.matchesGlob`.
- **Anchoring (user decision).** The pattern is matched against each candidate's path relative to the `--path` directory (the root when `--path` is omitted). `file glob *.ts --path src` matches `src/a.ts` but not `src/x/b.ts`. A pattern with no `/` is not widened to any depth.
- **Output paths (user decision).** One root-relative, forward-slash path per line, even when `--path` narrows the search, so any line can be passed straight to `file read`.
- **Case (user decision).** Matching is always case-sensitive, on every host. `*.TS` does not match `a.ts`.
- **Hidden and ignored paths (user decision).** By default, dotfiles and dot-directories are excluded, and so are paths that git ignores (`.gitignore`, `.git/info/exclude`, the global excludes file) and `node_modules`. `--hidden` includes both dotfiles and ignored paths, so one flag widens the search to everything on disk. The `.git` directory is never listed, even with `--hidden`.
- **Wildcards and dot-names (user decision).** Without `--hidden`, dot-names are pruned before matching, so the question doesn't come up. With `--hidden`, `*`, `**`, and `?` also match names that start with `.`, so `file glob **/* --hidden` lists `.env.example` and `.github/workflows/ci.yml`. An explicit dot in the pattern (`.*`, `**/.github/**`) also matches under `--hidden`. Without the flag it finds nothing, because dot-names are pruned before matching.
- **Workspace outside git (user decision).** When the root is not inside a git repository, nothing is ignored by `.gitignore` (no gitignore parsing). Without `--hidden`, the search skips dotfiles, dot-directories, and `node_modules`. With `--hidden` it lists everything except `.git`.
- **Secret files (user decision).** A path that `file read` would refuse as `Secret file:` (`.env`, `.env.*`, any path containing a `SECRET_DENY_PATHS` run) is silently left out of the results, and it doesn't count toward the limit. The same check applies to directories under `--dirs`, so a directory such as `.aws/` is never listed.
- **Limit (user decision).** `--limit` defaults to 100 and accepts 1 through 1000. A value above 1000, zero, a non-integer, or a repeated flag prints the usage line, matching how `parseFileRead` treats `--limit` above its maximum.
- **Truncation (user decision).** When more paths match than the limit, the output is the first `<n>` matches in sorted order, followed by the line `(showing the first <n> matches; narrow the pattern or raise --limit)`. No total is computed: the search may stop once it knows one more match exists.
- **Bad `--path` (user decision).** Each failure prints one line naming `--path` as typed: `Directory not found: <dir>.` when it doesn't exist, `Not a directory: <dir>.` when it names a file, and `Outside the workspace: <dir>.` for an absolute path, a `..` escape, or a symbolic link that resolves outside the root.
- **No matches (user decision).** When nothing matches, the output is `(no matches)`, in the style of `file read`'s `(empty file)`. This is not an error.
- **Timeout (user decision).** The search stops after 30 seconds. The output is then the matches found so far, sorted (or `(no matches)` if there are none), followed by the line `(search stopped after 30 seconds; narrow the pattern or --path)`. Whichever comes first, the limit or the timeout, ends the search; when the limit ends it, only the truncation line is printed.
- **Files or directories (user decision).** By default only files are listed (regular files and symbolic links to files). A `--dirs` flag lists matching directories instead of files. The full syntax is therefore `file glob <pattern> [--path <dir>] [--hidden] [--dirs] [--limit <n>]`.
- **`--dirs` output (user decision).** Each matching directory is printed root-relative with a trailing `/`, such as `src/a/`. The pattern is matched against the directory's path without the slash. Every directory on disk counts, empty ones included, subject to the same hidden and ignored rules as files (`--hidden` widens both). The `--path` directory itself is never listed.
- **Primer (user decision).** When a role grants `file glob`, the file tool's primer includes this text, placed after the `file read` primer and before the mutation primer, each part separated by a blank line:
  - `To find files in the workspace by path, end your reply with one line:`
  - `file glob <pattern> [--path <dir>] [--hidden] [--dirs] [--limit <n>]`
  - `Patterns are case-sensitive and relative to --path (default: the workspace root): ** spans folders, * stays within one name, ? is one character, {a,b} is either. Results are workspace-relative paths, at most 100 by default; hidden and git-ignored paths are skipped unless --hidden is given, and --dirs lists folders instead of files.`
  - `Example: file glob **/*.test.ts --path src`
- **Usage line (from precedent).** Malformed arguments print `Usage: file glob <pattern> [--path <dir>] [--hidden] [--dirs] [--limit <n>]`, in the form of `FILE_READ_USAGE`.
- **Agent runs (user decision).** Not in this version. An `agent` command run that requests `janissary file glob …` gets `Agent: command not permitted: <command>.`, with or without the `file` grant, the same way `file write` and `file edit` are refused there today.
- **Completion (user decision).** Typing in the command bar completes `glob` after `file`, completes the flags `--path`, `--hidden`, `--dirs`, and `--limit`, and completes directory names after `--path`. The pattern token is not completed.
- **Symbolic links (user decision).** A symbolic link to a directory is never entered, so cycles cannot happen. The link is not listed as a file, and with `--dirs` it isn't listed as a directory either. A symbolic link to a file is listed like a file.
- **Results.** Paths only, never contents, in sorted, stable order: depth-first, with each directory's entries in code-unit order of their names. So `a/x` comes before `a-b/x`, the way a file tree reads.
- **Remote tabs (from precedent).** A typed glob on a remote tab can also print `Remote connection unavailable.`, `The remote connection ended.`, or `The remote machine did not answer in time.`, exactly as `file read` does. It never falls back to the local disk.
- **Transcripts and history (from precedent).** A typed glob's output carries no host tag. In a remote ACP loop, the workspace step is tagged `[<host>] ` like every other workspace step. History and transcripts record the command as typed.
- **Authorization (user decision).** The ACP gate grants or refuses `file glob` by its native command name, exactly like `file read`. There's no per-pattern rule and no new resource field. The pattern is visible in the full command text that the tool transcript entry and the connection record's `tool` activity lines already carry. The backlog's "pattern as resource identifier" idea is out of scope.
- **Distinct from grep.** It matches path names only; content search is the separate `file grep` backlog item.
- **Workspace root.** It runs against the same root as `file read`: a local tab's workspace directory, or its launch/project directory when it has none; a remote tab's remote clone only; and in the ACP loop, the workspace of the host running the loop (`runsOn: 'workspace'`).

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How `file glob` uses it |
| --- | --- | --- |
| `file` command | `src/commands/file.ts` | Dispatches `file read` vs `file write`/`file edit`; gains a `file glob` branch. |
| Typed read root and remote fallback | `src/file-read/tab-read.ts` (`localReadRoot`, `readFileInTab`), `src/file-read/remote-tab-port.ts` (`withRemoteTabPort`, `REMOTE_UNAVAILABLE`) | Same root choice and the same remote port lifecycle for a glob on a remote tab. |
| Far-side workspace command | `src/file-read/read.ts` (`readWorkspaceCommand`) | Model for the far-side entry the remote ACP loop calls. |
| Pure parser with usage line | `src/file-read/command.ts` (`parseFileRead`, `FILE_READ_USAGE`, `FILE_READ_PRIMER`, `isFileReadCommandLine`) | Model for `parseFileGlob`, its usage line, primer, and command-line predicate. |
| ACP tool table | `src/acp/tool-table.ts` (`createAcpToolTable`, `filePrimer`, `gateAgentCommand`) | The `file` tool entry's `isCommandLine` and primer composition extend to glob. |
| Native command vocabulary | `src/plugins/roles/shared.ts` (`NATIVE_ACP_COMMANDS`) and default grants in `src/plugins/roles/roles-file.ts` | Adds `file glob` to the vocabulary and to the built-in `ask` and `tell` grants. |
| Gitignore-aware file listing | `src/file-navigator/search.ts` (`listProjectFiles`) | `git ls-files --cached --others --exclude-standard` with a walk fallback that excludes `.git`, `.svn`, `.hg`. |
| Glob matching | `node:path` `matchesGlob`, as used by `src/search/filter-paths.ts` | Node's built-in glob matcher; already supports `**`, `*`, `?`, `{a,b}`. |
| Remote read-only operation | `read-lines` in `src/remote/protocol.ts` and `RemoteFileSystemPort` (`src/file-navigator/remote/port.ts`) | Model for a new read-only remote operation that lists matches on the far side. |
| Typed command completion | `src/completion/file-read.ts` (`completeFileReadCommand`, `FILE_SUBCOMMANDS`), `src/completion/fs.ts` (`completeFilePath`) | Extended for the `glob` subcommand, its flags, and directory names after `--path`. |
| Path policy | `src/file-read/policy.ts` (`checkLexicalPath`, `checkRealTarget`) | Validates `--path` containment and drops secret files from results. |
| Remote operation descriptor | `src/remote/filesystem/operation-types.ts` (`descriptorFor`, `run` returns `MaybePromise`) | The `glob-paths` descriptor's async `run`. |
| Command rows | `src/application-commands.ts` (`buildApplicationCommands`) | Adds the `file glob` native row from the vocabulary with no edit. |

## Proposed changes

Implementation decisions (user): the code lives in a new `src/file-glob/` feature directory; candidates come from one async sorted `readdir` walk plus one git call for the ignored set; the walk runs on the main event loop with a deadline (no worker); a remote tab reaches its clone through a new read-only `glob-paths` remote filesystem operation.

### Pure command module — `src/file-glob/command.ts`

- `FileGlobArgs` carries `pattern`, `dir` (the `--path` value, or `undefined` for the root), `hidden`, `dirs`, and `limit`.
- `parseFileGlob(input)` returns `FileGlobArgs` or `{ error: FILE_GLOB_USAGE }`, in the shape of `parseFileRead`: it splits on whitespace, requires `file glob`, accepts exactly one non-flag token as the pattern, and scans `--path <dir>`, `--hidden`, `--dirs`, and `--limit <n>` in any order, each at most once. `--limit` defaults to 100 (`FILE_GLOB_DEFAULT_LIMIT`) and must be 1 through 1000 (`FILE_GLOB_MAX_LIMIT`). An unknown flag, a missing value, or a second pattern is a usage error.
- `FILE_GLOB_USAGE`, `FILE_GLOB_PRIMER` (the four primer lines from Design decisions, joined by newlines), and `isFileGlobCommandLine(line)`, which matches `^file\s+glob(\s|$)` case-insensitively, mirroring `isFileReadCommandLine`.
- `formatGlobResult(paths, { limit, truncated, timedOut })` is a pure formatter: the paths one per line, or `(no matches)` when the list is empty, then the truncation line or the timeout line when either applies.

### Walker and matcher — `src/file-glob/glob.ts`

- `globWorkspace(root, args, deadline)` is the one workspace entry. It validates `--path` with `checkLexicalPath` from `src/file-read/policy.ts` plus a `realpath` containment check (`checkRealTarget`), mapping the failures to `Outside the workspace: <dir>.`, `Directory not found: <dir>.`, and `Not a directory: <dir>.` (named as typed). It then walks and returns the formatted text.
- The ignored set comes from one `git ls-files --others --ignored --exclude-standard --directory -z` call run with `execFile` and `cwd: root`, in the async style of `listProjectFiles` (`src/file-navigator/search.ts`, `execFileAsync('git', ['ls-files', …], { cwd: root, maxBuffer: … })`). Git prints these paths relative to `cwd`, so they are already root-relative even when the root is a subdirectory of the repository. A collapsed ignored directory arrives with a trailing `/`; strip it before storing, and test a walked directory against the set by its root-relative path. Tracked files are never in the set (`--others`), so a tracked file under an ignore rule is still listed. If git fails (not a repository, git missing), the set is empty and the fixed skip list applies. The call is skipped entirely when `--hidden` is given.
- The walk visits the `--path` directory with promise-based `readdir({ withFileTypes: true })`, sorts each directory's entries by name, and descends depth-first so results come out in sorted path order. It never descends into `.git`. Without `--hidden` it prunes any entry whose name starts with `.`, any entry named `node_modules`, and any path in the ignored set (an ignored directory is pruned without being entered). It never enters a symbolic link to a directory. A symbolic link is classified with one `stat`: a link to a file counts as a file, and a link to a directory or a broken link is skipped.
- Each candidate's path relative to the `--path` directory is tested with `path.posix.matchesGlob(relative, pattern)`, so matching is case-sensitive on every host. `matchesGlob` never lets a wildcard match a leading `.` (`matchesGlob('.env', '*')` is false). So under `--hidden` a candidate also matches when `matchesGlob` accepts a copy of its path in which each segment's leading `.` is replaced by U+E000, a private-use character no real pattern contains. The original-path test keeps explicit-dot patterns working, and the copy gives wildcards the dot-matching the flag promises. In file mode, files are tested and directories are only traversed. In `--dirs` mode, directories (other than the `--path` directory itself) are tested and printed with a trailing `/`. A matching file or directory whose root-relative path `checkLexicalPath` (`src/file-read/policy.ts:52`) classifies as `Secret file` is dropped before it counts toward the limit. The check runs only on matches, not on every walked entry, because it calls `realpathSync` for its home-directory test.
- The walk stops once it holds `limit + 1` matches (truncated) or when the deadline passes (timed out), checked before each directory read. `GLOB_TIMEOUT_MS` is 30 000.
- Why not Node's `fs.promises.glob`: it yields matches in traversal order, not sorted order (`a.ts, z.ts, b/y.ts, b/a/x.ts` for `**/*.ts`), so stopping at `limit + 1` would not give the first `<n>` sorted matches without walking the whole tree. The hand-rolled sorted walk is the smallest mechanism that keeps early stopping. `walkFiles` in `src/file-navigator/search.ts` isn't reusable: it isn't exported, collects every file, and can't prune.
- Deliberate ceiling: the walk runs on the main event loop. Each `readdir` await yields, but matching a very large directory runs in one turn. If that ever shows up as lag, move the walk behind the existing worker pattern in `src/search/matching-worker.ts`.
- `globWorkspaceCommand(root, input)` parses and calls `globWorkspace` with a fresh deadline, returning the parse error text on malformed input. It is the far-side entry used by the remote ACP loop and by the remote operation.

### Typed entry — `src/file-glob/tab-glob.ts`

- `globFilesInTab(managers, label, input)` parses, then uses `localReadRoot` from `src/file-read/tab-read.ts` to pick the local root, or `withRemoteTabPort` from `src/file-read/remote-tab-port.ts` with prefix `file-glob` to send `glob-paths` on a remote tab. Remote refusals and connection failures map to the same lines `readFileInTab` prints.

### Remote protocol

- `src/remote/protocol-frames.ts` adds `'glob-paths'` to the operation union with args `{ pattern: string; dir?: string; hidden?: boolean; dirs?: boolean; limit?: number }`.
- A new `src/remote/filesystem/glob-paths-operation.ts`, modelled on `readLinesOperation` in `read-lines-operation.ts`: `valid`/`decode` check the pattern is a string, `dir` an optional string, `hidden`/`dirs` optional booleans, and `limit` an integer from 1 to `FILE_GLOB_MAX_LIMIT`. `paths` returns `[args.dir]` when present (else `[]`), with `rootDestination: true`, so the existing containment check applies to `--path`. `run` returns a promise of `{ text }` from `globWorkspace(context.root, …)`; the descriptor's `run` already allows `MaybePromise` (`src/remote/filesystem/operation-types.ts:22`). It's registered in the table in `src/remote/filesystem/operations.ts` beside `'read-lines': readLinesOperation`, and a `'glob-paths'` `{ text: string }` decoder goes in `src/remote/filesystem/result-decoders.ts` beside `'read-lines'`.
- A `remoteGlobPaths(request, paths, root, args)` helper goes in `src/file-navigator/remote/port-reads.ts` beside `remoteReadLines`, and does what that function does: an absolute `--path` is answered locally with `Outside the workspace: <dir>.` before anything is sent, and a relative one is mapped with `paths.to(root, dir)`. `RemoteFileSystemPort` (`src/file-navigator/remote/port.ts`) gains a one-statement `globPaths` method beside `readLines` that delegates to it. `port.ts` is at about 196 lint-counted lines, so the method must stay one statement; anything more goes in `port-reads.ts`. The standard 60-second request deadline (`REQUEST_DEADLINE_MS` in `port-requests.ts`) is enough, because the far side stops at 30 seconds, so `glob-paths` is not added to the long-running set.
- `REMOTE_PROTOCOL_VERSION` in `src/remote/protocol.ts` goes from 41 to 42, with a comment in the existing style: a version-41 remote would refuse `glob-paths` as unknown after the handshake had passed, so the exact-version handshake refuses the pairing first.

### Commands, roles, and the ACP tool loop

- `src/commands/file.ts` routes a `file glob` line (by `isFileGlobCommandLine`) to `globFilesInTab` and adds the samples `file glob **/*.ts` and `file glob *.md --path product --limit 20`.
- `NATIVE_ACP_COMMANDS` in `src/plugins/roles/shared.ts` adds `file glob` right after `file read`. The built-in `ask` and `tell` command lists in `src/plugins/roles/roles-file.ts` add `file glob` right after `file read`, so ask grants eight commands and tell grants thirteen. Saved roles files are not changed. `ROLES_PAYLOAD_SCHEMA_VERSION` stays at 4: the payload's shape doesn't change, only the vocabulary's contents.
- No change is needed in `src/acp/native-commands.ts`: `nativeCommandTool` already maps any `file ` name to the `file` owner. The commands tab picks up the new `file glob` row automatically, because `buildApplicationCommands` in `src/application-commands.ts` adds one native row per `NATIVE_ACP_COMMANDS` entry.
- `src/acp/tool-table.ts`: the `file` tool's `isCommandLine` also accepts `isFileGlobCommandLine`; `filePrimer` inserts `FILE_GLOB_PRIMER` after the read primer when `file glob` is granted; `gateAgentCommand` refuses `isFileGlobCommandLine` input with `Agent: command not permitted: <command>.`, so an agent run's glob never falls through to the caller side.
- `src/acp/run-prompt.ts` `runWorkspace` (today: mutation line → `mutateFileInTab`, anything else → `readFileInTab`) and `src/remote/serve-acp-loop.ts` `runWorkspace` (mutation → `runFileMutation`, else `readWorkspaceCommand`) each add a glob branch ahead of the read fallback, routing to `globFilesInTab` and `globWorkspaceCommand` respectively. The third `runWorkspace`, in `src/agent/execute.ts`, is left alone: `gateAgentCommand` refuses an agent's glob before it reaches the host.
- Order of landing, to keep typecheck green at each step: the pure command module and walker first, then the remote operation and port, then the typed entry and `src/commands/file.ts`, then the vocabulary, grants, tool table, and the two `runWorkspace` branches together, then completion.

### Completion

- `completeFileReadCommand` in `src/completion/file-read.ts` (20 lines) adds `glob` to `FILE_SUBCOMMANDS` (today only `['read']`) and, when `preceding[1]` is `glob`, completes `--dirs`, `--hidden`, `--limit`, and `--path` for a `--` token, leaves the token unchanged after `--limit`, completes directory names after `--path`, and otherwise leaves the token unchanged (the pattern is not completed). Directory-only completion is an optional `directoriesOnly` argument on `completeFilePath` in `src/completion/fs.ts` that filters entries with the existing `isDir` helper. Paths complete against the same `fileReadRoot` the read uses, so a remote tab (root `undefined`) completes no directories.

### Help and specs

- `help/file.md` documents `file glob` with its flags and an example.
- `product/specs/acp.md` gains a `### File glob` section after `### File read` that states every rule in Design decisions, updates the default-grant counts (ask eight, tell thirteen), and adds the glob primer text. `product/specs/roles.md` updates its grant lists and counts. `product/specs/agent-command.md` notes that `janissary file glob …` returns `Agent: command not permitted` in this version.

## Tests

- `src/file-glob/command.test.ts`: parsing the pattern and each flag in any order; defaults; the usage line for a missing pattern, two patterns, an unknown flag, a repeated flag, `--limit 0`, `--limit 1001`, and `--limit x`; `isFileGlobCommandLine`; `formatGlobResult` for empty, truncated, and timed-out results.
- `src/file-glob/glob.test.ts`, against a temporary directory: `**`, `*`, `?`, and `{a,b}`; anchoring to `--path` and root-relative output; case sensitivity; dotfiles and `node_modules` pruned without `--hidden` and listed with it; under `--hidden`, `**/*` matching `.env.example` and a file under `.github/`, `.*` matching dotfiles under `--hidden` and returning `(no matches)` without it; gitignored paths pruned inside a temporary git repository and listed with `--hidden`; `.git` never listed; secret files omitted and not counted; the limit and the truncation line; `(no matches)`; each bad-`--path` line; a symlink-to-directory cycle that terminates and isn't listed; a symlink to a file that is listed; `--dirs` with the trailing slash, empty directories included, and the `--path` directory excluded; and the timeout line with an already-passed deadline.
- `src/file-glob/tab-glob.test.ts`, mirroring `src/file-read/tab-read.test.ts`: local root choice and `Remote connection unavailable.` for a remote tab with no channel.
- `src/remote/filesystem/operations.test.ts`: the `glob-paths` descriptor decodes its args and result.
- The ACP tool-table and primer tests: glob primer placement and composition, gate refusal for an ungranted or agent-run glob, and the extractor recognizing a `file glob` line.
- The roles default-grant tests for `ask` and `tell`, and the native-command vocabulary order.
- `src/commands/file.test.ts`: a `file glob` line routes to the glob entry.
- The completion tests beside `src/completion/file-read.test.ts`.

## Out of scope

- Searching file contents (the separate `file grep` backlog item).
- Reading, writing, or editing files; `file glob` only lists paths.
- Any web UI beyond the command's transcript output.
- `file glob` for `agent` command runs.
- Per-pattern authorization rules or a resource field.
- Following symbolic links into directories.
- Parsing `.gitignore` outside a git repository.
- A separate flag that includes ignored paths without dotfiles, or the reverse; `--hidden` covers both.
- Patterns containing whitespace.
- A total match count.

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- Manual, local tab: run `file glob **/*.test.ts --path src/file-read` and confirm a sorted list of root-relative test paths under `src/file-read/`. Run `file glob * --dirs --path src --limit 5` and confirm five `src/<name>/` lines plus the truncation line. Run `file glob nothing-matches-this` and confirm `(no matches)`. Run `file glob *.ts --path missing` and confirm `Directory not found: missing.`
- Manual, ACP: open an `ask` session, ask it to list the plan files under `product/plans/complete` whose names mention `editor`, and confirm it emits one `file glob` line and receives the matching paths.
