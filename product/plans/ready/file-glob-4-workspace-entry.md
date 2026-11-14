# File glob 4 — workspace entry: `globWorkspace` and `globWorkspaceCommand`

**Complexity: 5/10** — 12 requirements and 28 test scenarios drive it, ~70 added lines in 1 new file with no edited files (p=5.59)

Run order: 4 of 9 in the file glob series. Source plan: `product/plans/complete/file-glob.md`. Depends on subplan 1 (`parseFileGlob`, `formatGlobResult`, `FileGlobArgs`), subplan 2 (`loadIgnoredPaths`), and subplan 3 (`walkGlob`). All three have landed on this branch: `src/file-glob/command.ts`, `src/file-glob/ignored.ts`, `src/file-glob/walk.ts`.

This subplan joins the pieces into the one function every caller uses: given a root and parsed arguments, validate `--path`, load the ignored set, walk, and return the text the user sees. It also adds the string-in, string-out command entry that the remote ACP loop calls. After it lands, `file glob` works end to end against a local directory in tests, though nothing routes to it yet. No existing file changes; like `walk.ts` today, the new module has no production importer until subplans 5, 7, and 8 land.

## Design decisions

All from the source plan unless marked:

- `globWorkspace(root, args, deadline)` is the one workspace entry. It runs against whatever root it is given; choosing the root is the caller's job (subplans 5 to 8). `deadline` is an absolute epoch-millisecond time compared with `Date.now()`, the same value `walkGlob`'s `deadline` option takes; callers pass `Date.now() + GLOB_TIMEOUT_MS` (subplan 7 already writes it that way).
- `--path` is validated with `checkLexicalPath` plus a `realpath` containment check through `checkRealTarget`, both from `src/file-read/policy.ts`. Each failure prints one line naming `--path` exactly as typed (`args.dir`, not normalized), in the `${failure}: ${path}.` shape `readWorkspaceLines` uses at `src/file-read/read.ts` (`return \`${lexicalFailure}: ${args.path}.\``):
  - `Outside the workspace: <dir>.` for an absolute path, a `..` escape, or a symbolic link that resolves outside the root.
  - `Directory not found: <dir>.` when it doesn't exist.
  - `Not a directory: <dir>.` when it names a file.
- Subplan decision, validation order. The checks run in this order and the first failure wins: (1) `checkLexicalPath(root, dir)`, failing only on `'Outside the workspace'`; (2) `realpath` of the root and of `path.resolve(root, dir)` inside one `try`, where any rejection (missing target, `ENOTDIR` for `a.ts/x`, an unresolvable root) maps to `Directory not found`; (3) `checkRealTarget(realRoot, realTarget)`, failing only on `'Outside the workspace'`; (4) `stat` of the real target, where anything but a directory maps to `Not a directory`. So `--path .env` naming a file prints `Not a directory: .env.`, not a secret line.
- Subplan decision, secret start. A `Secret file` result from step (1) or step (3) is not a failure line. Once steps (1) to (4) pass, a start that either check classed as secret returns `(no matches)` at once, without loading the ignored set or walking. This keeps the decided behavior that `--path .aws` is a valid search with `(no matches)`, and it closes a leak the walk alone would not catch: an in-root symbolic link `--path awslink` pointing at `.aws` yields root-relative names like `awslink/credentials`, which the walk's lexical secret check in `record` (`src/file-glob/walk.ts`, `checkLexicalPath(state.options.root, rootRelative) === 'Secret file'`) does not flag, and regular files below the start get no real-target check.
- Subplan decision, lexical start. The `start` handed to `walkGlob` is the lexical `path.resolve(root, dir)`, never the realpath from step (2). `walkGlob` derives the root-relative prefix with `path.relative(options.root, options.start)`, so a realpath start breaks output whenever the root's own path runs through a symbolic link (macOS temporary directories under `/var` resolve to `/private/var`, giving a `../../private/...` prefix). The realpath is used only for steps (3) and (4). With an in-root symbolic link as `--path`, results carry the link's name (`linked/a.ts`), not the target's.
- An in-root symbolic link given as `--path` is accepted, because only a link resolving outside the root is named as a failure; the never-enter rule applies to links met during the walk.
- Decided earlier: pruning applies only below the start. `--path .github` without `--hidden` lists `.github/workflows/ci.yml`, and `--path dist` where `dist/` is git-ignored lists its contents. `walkGlob` already behaves this way (`isPruned` runs on entries, never on the start; `git ls-files --directory` reports an ignored folder as one collapsed entry, so its children are not in the set).
- With no `--path` the start is the root and no validation runs. An unresolvable root then gives `(no matches)`, because `walkGlob` returns an empty result when its own `realpath` of the root fails.
- `--path .` and `--path src/` are valid: `path.resolve` normalizes both, so `.` behaves like no `--path` and `src/` like `src`.
- The ignored set is loaded once per search with `loadIgnoredPaths(root)`, relative to the root and not to `--path`. The call is skipped entirely under `--hidden`, which passes an empty set instead. `loadIgnoredPaths` never rejects (it returns an empty set on any git failure), so no extra error handling is needed.
- The search stops after 30 seconds (`GLOB_TIMEOUT_MS` is `30_000`, matching the fixed `search stopped after 30 seconds` text in `formatGlobResult`). The output is then the matches found so far, sorted, or `(no matches)`, followed by the timeout line. When the limit ends the search first, only the truncation line is printed. Both rules are already in `formatGlobResult`; `globWorkspace` passes `{ limit: args.limit, truncated, timedOut }` straight from the walk result and adds no text of its own. Time spent in `loadIgnoredPaths` counts against the same deadline because the walk checks it afterward.
- `(no matches)` is not an error.
- `globWorkspaceCommand(root, input)` parses with `parseFileGlob` and calls `globWorkspace` with `Date.now() + GLOB_TIMEOUT_MS`, returning `parsed.error` (the usage line) on malformed input, as `readWorkspaceCommand` does at `src/file-read/read.ts`. It is the far-side entry used by the remote ACP loop (subplan 8, `src/remote/serve-acp-loop.ts`). The remote operation (subplan 5) and the typed command (subplan 7) call `globWorkspace` directly.

## What already exists (reuse, don't rebuild)

| Piece | Where | Use |
| --- | --- | --- |
| `readWorkspaceLines`, `readWorkspaceCommand` | `src/file-read/read.ts` | The shape of the workspace entry, the failure-line format, and the parse-then-run command entry. They are synchronous; the glob entry is async because `walkGlob` and `loadIgnoredPaths` are, so use `realpath` and `stat` from `node:fs/promises` as `walk.ts` does, not the `*Sync` calls `read.ts` uses. |
| `checkLexicalPath`, `checkRealTarget` | `src/file-read/policy.ts` | `--path` containment and the secret-start test. `checkRealTarget` expects canonical paths, so pass it the two realpaths from step (2). |
| `parseFileGlob`, `formatGlobResult`, `FileGlobArgs`, `FILE_GLOB_USAGE` | `src/file-glob/command.ts` | Parsing and all output text, including `(no matches)`, the truncation line, and the timeout line. |
| `loadIgnoredPaths` | `src/file-glob/ignored.ts` | The ignored set. |
| `walkGlob` | `src/file-glob/walk.ts` | The walk, taking `{ root, start, pattern, hidden, dirs, limit, deadline, ignored }` and returning `{ paths, truncated, timedOut }`. It already prunes `.git`, dot-entries, `node_modules`, and ignored paths, drops secret matches before they count, never enters directory links, and drops links to secret or outside targets. Do not repeat any of that here. |

## Proposed changes

Create `src/file-glob/glob.ts` (well under the 200-line limit; relative imports carry `.js`: `../file-read/policy.js`, `./command.js`, `./ignored.js`, `./walk.js`) exporting:

- `GLOB_TIMEOUT_MS` (`30_000`).
- `globWorkspace(root: string, args: FileGlobArgs, deadline: number): Promise<string>`. A non-exported helper `resolveStart(root, dir)` runs the four validation steps above and returns either a failure line, a secret-start marker, or the lexical start directory. `globWorkspace` returns the failure line as is, returns `(no matches)` via `formatGlobResult([], …)` for a secret start, and otherwise loads the ignored set (unless `args.hidden`), calls `walkGlob` with `root`, the start, and `pattern`, `hidden`, `dirs`, `limit` from `args`, and returns `formatGlobResult(result.paths, { limit: args.limit, truncated: result.truncated, timedOut: result.timedOut })`.
- `globWorkspaceCommand(root: string, input: string): Promise<string>`, as described above.

## Tests

`src/file-glob/glob.test.ts`, against a `mkdtempSync(path.join(tmpdir(), …))` directory created in `beforeEach` and removed in `afterEach`, with `write` and git-repository helpers like those in `src/file-glob/walk-modes.test.ts` and `src/file-glob/ignored.test.ts` (`execSync('git init', …)` plus a user name and email). Pass the `mkdtempSync` path as the root unresolved, so the macOS `/var` symbolic link exercises the lexical-start decision. Assert the full returned string. Test files are exempt from `max-lines`.

- `**`, `*`, `?`, and `{a,b}` patterns through `globWorkspace`.
- Anchoring to `--path` with root-relative output: `*.ts --path src` lists `src/a.ts` and not `src/x/b.ts`. `--path .` gives the same output as no `--path`.
- Case sensitivity: `*.TS` gives `(no matches)` for `a.ts`.
- Dotfiles and `node_modules` pruned without `--hidden`. Under `--hidden`, `**/*` lists `.eslintrc.json` and a file under `.github/` while omitting `.env.example` (a secret file, omitted even under `--hidden`); `.*` lists `.eslintrc.json` under `--hidden` and gives `(no matches)` without it.
- Inside a temporary git repository, gitignored paths are pruned and are listed with `--hidden`; with `--path src` and `src/gen/` ignored, `src/gen/x.ts` is still pruned (the set is root-relative). Outside a repository, a `.gitignore` is not honored and `node_modules` is still skipped.
- `.git` never listed; secret files omitted and not counted (end to end): with `--hidden --limit 1`, a root holding `.env` and `a.ts` prints `a.ts` alone, with no truncation line.
- The limit and the truncation line (`--limit 2` over three files prints two paths and `(showing the first 2 matches; narrow the pattern or raise --limit)`); `(no matches)` for a pattern with no hits.
- Each bad-`--path` line: an absolute path, a `..` escape, a symbolic link resolving outside the root (to a second `mkdtempSync` directory), a missing directory, and a file, each naming the path as typed (`Outside the workspace: ../x.`, `Not a directory: a.ts.`, and so on).
- The `--path` decisions: `--path .aws` holding `credentials` gives `(no matches)` with and without `--hidden`; an in-root symbolic link `awslink` to `.aws` given as `--path` also gives `(no matches)`; an in-root symbolic link `linked` to `real/` given as `--path` lists `linked/a.ts`; `--path .github` without `--hidden` lists its files; `--path dist` naming a git-ignored folder lists its files.
- `--dirs` end to end: trailing slash, empty directory listed, `--path` directory excluded.
- The timeout line: an already-passed deadline (`0`) prints `(no matches)` then `(search stopped after 30 seconds; narrow the pattern or --path)`. For matches found before the stop, use `--hidden` (so no git process runs) with deadline `1` and `vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValue(2)`, as the mid-walk test in `src/file-glob/walk-modes.test.ts` does, over `a` and `b/x`: the output is `a` then the timeout line.
- `globWorkspaceCommand`: the usage line (`FILE_GLOB_USAGE`) for malformed input such as `file glob` with no pattern, and a normal result for valid input.

## Verification

- `$janissary/scripts/run.mjs check-diff` after creating each file.
- Manual check: none possible in the app yet, since nothing routes to `globWorkspace` until subplan 7. The end-to-end proof is `glob.test.ts` passing on macOS, where the temporary root sits behind the `/var` symbolic link.

## Out of scope

Choosing a root from a tab, the remote operation, command routing, ACP wiring, completion, help, and specs are subplans 5 to 9. Running the walk in a worker is out of scope. No change to `walk.ts`, `command.ts`, `ignored.ts`, or `policy.ts`.
