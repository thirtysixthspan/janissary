# File glob 3 — sorted, pruning, early-stopping walker

**Complexity: 5/10** — ~115 added lines, 14 requirements, 18 test scenarios (p=5.64)

Run order: 3 of 9 in the file glob series. Source plan: `product/plans/complete/file-glob.md`. Depends on subplan 2 (`globMatches`).

This subplan adds the walk that turns a start directory into a sorted list of matching root-relative paths. It prunes hidden and ignored entries, never enters symbolic links to directories, drops secret files, and stops early at the limit or the deadline. It takes the ignored set and an already-validated start directory as inputs, so `--path` validation, the git call, and formatting stay in subplan 4.

## Design decisions

All from the source plan:

- One async walk with promise-based `readdir({ withFileTypes: true })`. Each directory's entries are sorted by name in code-unit order (the default string comparison), and the walk descends depth-first, so results come out in sorted path order the way a file tree reads: `a/x` comes before `a-b/x`.
- Why not Node's `fs.promises.glob`: it yields matches in traversal order, so stopping at `limit + 1` would not give the first `<n>` sorted matches without walking the whole tree. `walkFiles` in `src/file-navigator/search.ts` isn't reusable: it isn't exported, collects every file, and can't prune.
- The walk never descends into, tests, or lists `.git`, even with `--hidden`.
- Without `--hidden` it prunes any entry whose name starts with `.`, any entry named `node_modules`, and any entry whose root-relative path is in the ignored set. An ignored directory is pruned without being entered. With `--hidden` nothing but `.git` is pruned.
- A symbolic link is classified with one `stat`. A link to a file counts as a file. A link to a directory is never entered and never listed, not even under `--dirs`, so cycles cannot happen. A broken link is skipped.
- Each candidate's path relative to the start directory is tested with `globMatches` (anchoring: `*.ts` from `src` matches `src/a.ts` but not `src/x/b.ts`). A pattern with no `/` is not widened to any depth.
- In file mode (the default), regular files and links to files are tested; directories are only traversed. In `--dirs` mode, directories are tested instead, empty ones included, and the start directory itself is never tested or listed. Pruning rules apply identically in both modes.
- Matches are recorded root-relative with forward slashes, so a narrowed search still prints paths that `file read` accepts. In `--dirs` mode the recorded path ends in `/`; the pattern is matched against the path without the slash.
- A match whose root-relative path `checkLexicalPath` (`src/file-read/policy.ts`) classifies as `Secret file` is dropped before it counts toward the limit. The check runs only on matches, never on every walked entry, because it calls `realpathSync` for its home-directory test. The same check covers directories under `--dirs`, so `.aws/` is never listed.
- The walk stops once it holds `limit + 1` matches (truncated) or when the deadline has passed (timed out). The deadline is checked before each directory read. When it stops for the limit it returns the first `limit` matches and `truncated: true`; it never counts the rest.
- Deliberate ceiling: the walk runs on the main event loop. Each `readdir` await yields, but matching one very large directory runs in one turn. If that shows up as lag, the walk moves behind the worker pattern in `src/search/matching-worker.ts`; that is not part of this series.
- Subplan decision: the pruning rules apply to entries found below the start directory. The start directory itself is not tested against them, because the walker only receives it after subplan 4 validated it.

## What already exists (reuse, don't rebuild)

| Piece | Where | Use |
| --- | --- | --- |
| `globMatches` | `src/file-glob/match.ts` (subplan 2) | Pattern test, with the `--hidden` dot mask. |
| `checkLexicalPath` | `src/file-read/policy.ts` | The `Secret file` classification `file read` uses, applied to each match's root-relative path in native separator form. |

## Proposed changes

Create `src/file-glob/walk.ts` exporting:

- `GlobWalkOptions`: `root` (absolute root), `start` (absolute start directory inside the root), `pattern`, `hidden`, `dirs`, `limit`, `deadline` (an epoch millisecond time), and `ignored` (the set from subplan 2, empty under `--hidden`).
- `GlobWalkResult`: `paths` (at most `limit` root-relative strings), `truncated`, and `timedOut`.
- `walkGlob(options)`, an async function returning `GlobWalkResult`. It keeps the collected matches and a stop flag in a closure and recurses one directory at a time. A small local helper classifies one `Dirent` as file, directory, or skip, doing the single `stat` for a symbolic link. Another decides pruning from the entry name and its root-relative path. Splitting these keeps `sonarjs/cognitive-complexity` under the limit. A `readdir` that fails on one subdirectory (permissions, a race with deletion) skips that directory rather than failing the walk.

## Tests

`src/file-glob/walk.test.ts`, against a temporary directory:

- Sorted depth-first order across nested directories, including `a/x` before `a-b/x`.
- Anchoring: matches are relative to `start`, output paths are relative to `root`.
- Dotfiles, dot-directories, and `node_modules` pruned without `hidden` and listed with it; `**/*` under `hidden` lists `.env.example` and a file under `.github/`.
- A path in `ignored` (a file and a directory) is pruned; the directory's contents are not visited.
- `.git` never listed, with or without `hidden`, in either mode.
- Secret files (`.env`, `.env.local`, a file under `.aws/`) omitted under `hidden`, and not counted toward the limit; `.aws/` omitted under `dirs` and `hidden`.
- The limit: `limit + 1` candidates gives `limit` paths and `truncated: true`; exactly `limit` gives `truncated: false`.
- A symbolic link to a parent directory (a cycle) terminates and is not listed in either mode; a symbolic link to a file is listed; a broken link is skipped.
- `dirs`: directories listed with a trailing `/`, an empty directory included, the start directory excluded, and files not listed.
- An already-passed deadline returns no paths and `timedOut: true`.

## Verification

- `$janissary/scripts/run.mjs check-diff`.

## Out of scope

`--path` validation, the git call, the 30-second timeout constant, and output formatting are subplan 4. Following symbolic links into directories and a total match count are out of scope for the whole feature.
