# File glob 2 — path matcher and git-ignored set

**Complexity: 4/10** — ~55 added lines, 8 requirements, 12 test scenarios (p=4.98)

Run order: 2 of 9 in the file glob series. Source plan: `product/plans/complete/file-glob.md`. Depends on subplan 1 only for its directory; it imports nothing from it.

The walker in subplan 3 needs two small helpers: one that decides whether a candidate path matches the pattern, and one that loads the set of git-ignored paths under the root. Both are self-contained and testable without the walker, so they land first.

## Design decisions

All from the source plan:

- Glob semantics are Node's `path.matchesGlob`: `**` matches zero or more directory segments, `*` matches within one segment, `?` matches one character, and `{a,b}` is alternation.
- Matching uses `path.posix.matchesGlob`, so it is case-sensitive on every host: `*.TS` does not match `a.ts`.
- `matchesGlob` never lets a wildcard match a leading `.` (`matchesGlob('.env', '*')` is false). Under `--hidden` a candidate also matches when `matchesGlob` accepts a copy of its path in which each segment's leading `.` is replaced by U+E000, a private-use character no real pattern contains. The original-path test keeps explicit-dot patterns (`.*`, `**/.github/**`) working, and the masked copy gives `*`, `**`, and `?` the dot-matching `--hidden` promises. Without `--hidden` only the original path is tested; dot-names never reach the matcher anyway, because the walker prunes them.
- The ignored set comes from one `git ls-files --others --ignored --exclude-standard --directory -z` call, run with `execFile` and `cwd: root`, in the async style of `listProjectFiles` in `src/file-navigator/search.ts`. That covers `.gitignore`, `.git/info/exclude`, and the global excludes file.
- Git prints these paths relative to `cwd`, so they are already root-relative even when the root is a subdirectory of the repository. A collapsed ignored directory arrives with a trailing `/`, which is stripped before storing.
- Tracked files are never in the set (`--others`), so a tracked file under an ignore rule is still listed.
- If git fails (not a repository, git missing), the set is empty, and no `.gitignore` is parsed. The walker's fixed skip list (dot-names and `node_modules`) still applies.

## What already exists (reuse, don't rebuild)

| Piece | Where | Use |
| --- | --- | --- |
| `listProjectFiles`, its `execFileAsync('git', ['ls-files', …], { cwd: root, maxBuffer: … })` call | `src/file-navigator/search.ts` | The async git call style, buffer size, and failure fallback to copy. |
| `matchesGlob` usage | `src/search/filter-paths.ts` | Precedent for Node's built-in matcher. |

## Proposed changes

- `src/file-glob/match.ts` exports `globMatches(relative, pattern, hidden)`. `relative` is a forward-slash path relative to the `--path` directory. It returns `path.posix.matchesGlob(relative, pattern)`, or, when `hidden` is true and that fails, the same test on the masked copy. A small local helper builds the masked copy by replacing a leading `.` in each `/`-separated segment with U+E000. A short comment states why the mask exists, since the reason is not visible from the code.
- `src/file-glob/ignored.ts` exports `loadIgnoredPaths(root)`, an async function returning a `ReadonlySet<string>` of root-relative, forward-slash paths with any trailing `/` stripped. It splits the `-z` output on NUL and drops the empty tail. Any rejection from `execFile` resolves to an empty set.

## Tests

- `src/file-glob/match.test.ts`:
  - `**/*.ts` matches `a.ts` and `x/y/b.ts`; `*.ts` matches `a.ts` but not `x/a.ts`; `?.ts` matches `a.ts` but not `ab.ts`; `{a,b}.ts` matches both and not `c.ts`.
  - Case sensitivity: `*.TS` does not match `a.ts`.
  - Without hidden, `*` does not match `.env.example` and `**/*` does not match `.github/workflows/ci.yml`.
  - With hidden, both match; `.*` matches `.env.example` with or without hidden; `**/.github/**` matches `.github/workflows/ci.yml` with hidden.
- `src/file-glob/ignored.test.ts`, against a temporary directory:
  - Inside a fresh `git init` repository with a `.gitignore` listing `dist/` and `*.log`: `dist` (trailing slash stripped) and `a.log` are in the set; an untracked, unignored file is not.
  - A file that is tracked and also matches an ignore rule is not in the set.
  - A root that is a subdirectory of the repository gets paths relative to that subdirectory.
  - A directory outside any repository returns an empty set.

## Verification

- `$janissary/scripts/run.mjs check-diff`.

## Out of scope

Walking the tree, pruning, symbolic links, limits, deadlines, and output formatting are subplans 3 and 4. Parsing `.gitignore` outside a git repository is out of scope for the whole feature.
