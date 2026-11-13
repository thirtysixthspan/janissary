# File glob 4 — workspace entry: `globWorkspace` and `globWorkspaceCommand`

**Complexity: 4/10** — ~60 added lines, 8 requirements, 16 test scenarios (p=5.10)

Run order: 4 of 9 in the file glob series. Source plan: `product/plans/complete/file-glob.md`. Depends on subplan 1 (`parseFileGlob`, `formatGlobResult`, `FileGlobArgs`), subplan 2 (`loadIgnoredPaths`), and subplan 3 (`walkGlob`).

This subplan joins the pieces into the one function every caller uses: given a root and parsed arguments, validate `--path`, load the ignored set, walk, and return the text the user sees. It also adds the string-in, string-out command entry that the remote ACP loop and the remote operation call. After it lands, `file glob` works end to end against a local directory in tests, though nothing routes to it yet.

## Design decisions

All from the source plan unless marked:

- `globWorkspace(root, args, deadline)` is the one workspace entry. It runs against whatever root it is given; choosing the root is the caller's job (subplans 5 to 8).
- `--path` is validated with `checkLexicalPath` plus a `realpath` containment check through `checkRealTarget`, both from `src/file-read/policy.ts`. Each failure prints one line naming `--path` as typed:
  - `Outside the workspace: <dir>.` for an absolute path, a `..` escape, or a symbolic link that resolves outside the root.
  - `Directory not found: <dir>.` when it doesn't exist.
  - `Not a directory: <dir>.` when it names a file.
- Subplan decision: only the `Outside the workspace` results of the two policy checks are failures. A `Secret file` result for the `--path` directory itself (such as `--path .aws`) is not one of the three named lines, so the search runs; every candidate below it is a secret match and is dropped, so the output is `(no matches)`. An in-root symbolic link given as `--path` is accepted, because only a link resolving outside the root is named as a failure; the never-enter rule applies to links met during the walk.
- The ignored set is loaded once per search with `loadIgnoredPaths(root)`, relative to the root and not to `--path`. The call is skipped entirely under `--hidden`.
- The search stops after 30 seconds (`GLOB_TIMEOUT_MS` is 30 000). The output is then the matches found so far, sorted, or `(no matches)`, followed by the timeout line. When the limit ends the search first, only the truncation line is printed.
- `(no matches)` is not an error.
- `globWorkspaceCommand(root, input)` parses with `parseFileGlob` and calls `globWorkspace` with a fresh deadline, returning the usage line on malformed input. It is the far-side entry used by the remote ACP loop (subplan 8), and the remote operation (subplan 5) calls `globWorkspace` directly.

## What already exists (reuse, don't rebuild)

| Piece | Where | Use |
| --- | --- | --- |
| `readWorkspaceLines`, `readWorkspaceCommand` | `src/file-read/read.ts` | The shape of the workspace entry and the parse-then-run command entry. |
| `checkLexicalPath`, `checkRealTarget` | `src/file-read/policy.ts` | `--path` containment. |
| `parseFileGlob`, `formatGlobResult` | `src/file-glob/command.ts` (subplan 1) | Parsing and output text. |
| `loadIgnoredPaths` | `src/file-glob/ignored.ts` (subplan 2) | The ignored set. |
| `walkGlob` | `src/file-glob/walk.ts` (subplan 3) | The walk. |

## Proposed changes

Create `src/file-glob/glob.ts` exporting:

- `GLOB_TIMEOUT_MS` (30 000).
- `globWorkspace(root, args, deadline)`, async, returning the output text. A local helper resolves `args.dir` to an absolute start directory or a failure line: lexical check, then `realpath` of the root and of the target (a missing target maps to `Directory not found`), then `checkRealTarget`, then a `stat` that must be a directory (else `Not a directory`). With no `--path` the start is the root. It then loads the ignored set (unless `hidden`), calls `walkGlob`, and returns `formatGlobResult(paths, { limit, truncated, timedOut })`.
- `globWorkspaceCommand(root, input)`, async, as described above.

## Tests

`src/file-glob/glob.test.ts`, against a temporary directory, covering the source plan's end-to-end list at this entry:

- `**`, `*`, `?`, and `{a,b}` patterns through `globWorkspace`.
- Anchoring to `--path` with root-relative output: `*.ts --path src` lists `src/a.ts` and not `src/x/b.ts`.
- Case sensitivity: `*.TS` gives `(no matches)` for `a.ts`.
- Under `--hidden`, `**/*` lists `.env.example` and a file under `.github/`; `.*` lists dotfiles under `--hidden` and gives `(no matches)` without it.
- Inside a temporary git repository, gitignored paths are pruned and are listed with `--hidden`; outside a repository, a `.gitignore` is not honored and `node_modules` is still skipped.
- `.git` never listed; secret files omitted and not counted (end to end).
- The limit and the truncation line; `(no matches)`.
- Each bad-`--path` line: an absolute path, a `..` escape, a symbolic link resolving outside the root, a missing directory, and a file, each naming the path as typed.
- `--dirs` end to end: trailing slash, empty directory listed, `--path` directory excluded.
- The timeout line after the matches found so far, using an already-passed deadline.
- `globWorkspaceCommand`: the usage line for malformed input, and a normal result for valid input.

## Verification

- `$janissary/scripts/run.mjs check-diff`.

## Out of scope

Choosing a root from a tab, the remote operation, command routing, ACP wiring, completion, help, and specs are subplans 5 to 9. Running the walk in a worker is out of scope.
