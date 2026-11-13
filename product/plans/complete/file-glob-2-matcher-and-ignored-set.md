# File glob 2 — path matcher and git-ignored set

**Complexity: 5/10** — ~60 added lines, 11 requirements, 15 test scenarios, plus one runtime dependency (p=5.58)

Run order: 2 of 9 in the file glob series. Source plan: `product/plans/complete/file-glob.md`. Depends on subplan 1 only for its directory (`src/file-glob/` already holds `command.ts`); it imports nothing from it.

The walker in subplan 3 needs two small helpers: one that decides whether a candidate path matches the pattern, and one that loads the set of git-ignored paths under the root. Both are self-contained and testable without the walker, so they land first.

## Design decisions

From the source plan:

- Glob semantics are Node's `path.matchesGlob`: `**` matches zero or more directory segments, `*` matches within one segment, `?` matches one character, and `{a,b}` is alternation.
- Matching is case-sensitive on every host: `*.TS` does not match `a.ts`.
- Under `--hidden`, `*`, `**`, and `?` also match names that start with `.`, so `**/*` matches `.github/workflows/ci.yml`. Explicit-dot patterns (`.*`, `**/.github/**`) match with or without `--hidden`. Without `--hidden` dot-names never reach the matcher anyway, because the walker prunes them.
- The ignored set comes from one `git ls-files --others --ignored --exclude-standard --directory -z` call, run with `cwd: root`, in the async style of `listProjectFiles` in `src/file-navigator/search.ts`. That covers `.gitignore`, `.git/info/exclude`, and the global excludes file.
- Git prints these paths relative to `cwd`, so they are already root-relative even when the root is a subdirectory of the repository. A collapsed ignored directory arrives with a trailing `/`, which is stripped before storing.
- Tracked files are never in the set (`--others`), so a tracked file under an ignore rule is still listed.
- If git fails (not a repository, git missing), the set is empty, and no `.gitignore` is parsed. The walker's fixed skip list (dot-names and `node_modules`) still applies.

Decisions this subplan makes, verified against Node 24 and git on this repository's development host (macOS):

- **`path.matchesGlob` cannot be used.** It is case-insensitive on macOS and Windows, even as `path.posix.matchesGlob`: Node passes minimatch `nocase: isMacOS || isWindows` with `nocaseMagicOnly`, so on macOS `path.posix.matchesGlob('a.ts', '*.TS')` is `true` (only fully literal segments compare case-sensitively). There is no option to turn that off. The draft's `path.posix.matchesGlob` mechanism, and its case-sensitivity test, would fail on the main development platform.
- **Match with `minimatch` directly.** `path.matchesGlob` is a vendored copy of minimatch, so calling the `minimatch` package with Node's own option set, except `nocase`, gives exactly Node's glob semantics with case-sensitive matching on every host. The options are `nocase: false`, `nonegate: true`, `nocomment: true`, `windowsPathsNoEscape: true`, `optimizationLevel: 2`, and `platform: 'posix'`, which are the ones Node passes (so `!x` and `#x` are literal patterns and `\` is a separator, never an escape, as in `path.matchesGlob`). `minimatch` 10.2.5 is already in `package-lock.json` as a dev-only transitive package; this subplan adds it to `package.json` `dependencies` as `^10.2.5`, in the caret style of the other entries.
- **The `--hidden` dot rule is minimatch's `dot` option, not a mask.** `dot: hidden` gives `*`, `**`, and `?` the dot-matching `--hidden` promises, and explicit-dot patterns match either way. Checked: with `dot: true`, `*` matches `.env.example`, `**/*` and `**/.github/**` match `.github/workflows/ci.yml`, `?a` matches `.a`, and `.*` matches `.env.example`; with `dot: false` only the explicit-dot patterns match. This replaces the draft's U+E000 leading-dot mask, which produced the same results with an extra helper and a second match per candidate.
- **Compile the pattern once per search.** The module exports a matcher factory, not a per-call test. Measured on 100 000 paths with `**/*.test.ts`: about 220 ms compiling on every call (what `minimatch(path, pattern)` and `path.matchesGlob` do) against about 22 ms with one compiled `Minimatch`. The walker in subplan 3 builds one matcher per search and calls it per candidate.
- **A pattern minimatch rejects matches nothing.** `new Minimatch` throws `TypeError: pattern is too long` for a pattern over 64 KiB. The factory catches a throw at construction and returns a matcher that always answers `false`, so the command prints `(no matches)` instead of failing. This is the rule `src/search/filter-paths.ts` states for its fields ("a pattern that does not compile is treated as matching nothing rather than raising").
- **A directory whose untracked contents are all ignored is in the set.** Git reports such a directory collapsed even when no rule names it: with `*.log` ignored, a `logs/` holding only `b.log` and `c.log` comes back as `logs/` (plus its files). That is git's own view, the one `git status --ignored` shows, and it is kept as-is: the walker prunes `logs`, so `--dirs` does not list `logs/` without `--hidden`. An empty directory is never reported.
- **An ignored root prunes nothing.** When the root itself lies inside an ignored directory, git answers the single entry `./`. That entry (`.` after stripping the slash) is dropped, so the set is empty. Treating it as "everything is ignored" would make every search in such a root print `(no matches)` without `--hidden`.
- **Failure handling.** Any rejection from the git call resolves to an empty set: a non-zero exit (git exits 128 outside a repository), a missing `git` binary, or output beyond `maxBuffer`. `maxBuffer` is 64 MiB, the value `listProjectFiles` uses. Collapsing (`--directory`) keeps the output far below that.
- Whether to make the git call at all (it is skipped under `--hidden`) is decided by the caller in subplan 4, not here.

## What already exists (reuse, don't rebuild)

| Piece | Where | Use |
| --- | --- | --- |
| `listProjectFiles` and its module-level `const execFileAsync = promisify(execFile)` | `src/file-navigator/search.ts` | Copy the call shape: `await execFileAsync('git', ['ls-files', …], { cwd: root, maxBuffer: 1024 * 1024 * 64 })` inside `try`, `stdout.split('\0').filter(Boolean)`, and a `catch` that falls back (here to an empty set). |
| `minimatch` 10.2.5 (`Minimatch` class) | `node_modules/minimatch`, today dev-only in `package-lock.json` | The matcher engine behind `path.matchesGlob`, called with `nocase: false`. |
| Pattern-that-doesn't-compile rule | comment above `patterns` in `src/search/filter-paths.ts` | Precedent for "matches nothing rather than raising". |
| `initRepo` / `commitAll` test helpers | `src/file-navigator/search.test.ts` | Copy them into `ignored.test.ts` to build temporary repositories (`git init`, local `user.email`/`user.name`, `git add -A`, `git commit`). |
| Non-repository temp-dir test | `src/git/status.test.ts` ("resolves to an empty map for a directory that is not a git repository") | Precedent that a bare `mkdtempSync(path.join(tmpdir(), …))` directory is outside any repository in this suite. |

## Proposed changes

Land in this order so typecheck stays green: the dependency first, then the two modules (independent of each other).

1. **Dependency.** Run `$janissary/scripts/run.mjs check-malicious-package minimatch@10.2.5 brace-expansion@5.0.12 balanced-match@4.0.4` (minimatch and the two packages it pulls in, at their lockfile versions; all three report `OK` today). Do not proceed on exit code 2, 3, or 1. Then add `minimatch` at `^10.2.5` to `dependencies` with npm so `package-lock.json` drops `"dev": true` from those three entries without changing their versions.
2. **`src/file-glob/match.ts`** exports `createGlobMatcher(pattern, hidden)`, which returns a predicate `(relative: string) => boolean`. `relative` is a forward-slash path relative to the `--path` directory, with no leading `./` and no trailing `/` (the walker strips the `--dirs` slash before testing). The factory builds one `Minimatch` (imported from `'minimatch'`) with the option set in Design decisions plus `dot: hidden`, and the predicate returns its `match(relative)`. Construction is wrapped in `try`/`catch`; on a throw the factory returns a predicate that always answers `false`. A short comment states why `path.matchesGlob` isn't used (its macOS and Windows case folding), since that reason is not visible from the code.
3. **`src/file-glob/ignored.ts`** exports `loadIgnoredPaths(root)`, an async function returning a `ReadonlySet<string>` of root-relative, forward-slash paths. It splits the `-z` output on NUL, drops empty strings, strips one trailing `/` from each entry, and drops the `.` entry. Any rejection resolves to an empty set.

Both files stay far below the 200-line limit. Relative imports, if any, carry `.js`; the `minimatch` import is a bare package specifier.

## Tests

- `src/file-glob/match.test.ts`:
  - `**/*.ts` matches `a.ts` and `x/y/b.ts`; `*.ts` matches `a.ts` but not `x/a.ts`; `?.ts` matches `a.ts` but not `ab.ts`; `{a,b}.ts` matches `a.ts` and `b.ts` and not `c.ts`.
  - Case sensitivity: `*.TS` does not match `a.ts`, and `*.ts` does not match `a.TS`. These must fail if the module ever goes back to `path.matchesGlob` on macOS.
  - Without hidden, `*` does not match `.env.example` and `**/*` does not match `.github/workflows/ci.yml`.
  - With hidden, both match; `.*` matches `.env.example` with and without hidden; `**/.github/**` matches `.github/workflows/ci.yml` with and without hidden.
  - A pattern of 70 000 characters returns a matcher that does not throw and answers `false`.
- `src/file-glob/ignored.test.ts`, against `mkdtempSync(path.join(tmpdir(), 'file-glob-ignored-'))` with `initRepo`/`commitAll` as in `src/file-navigator/search.test.ts`, removed in `afterEach`:
  - Inside a repository with a `.gitignore` listing `dist/` and `*.log`, where `dist/` holds a nested `sub/y.js`: the set contains `dist` (slash stripped) and `a.log`, does not contain `dist/sub/y.js` (collapsed), and does not contain an untracked, unignored `keep.txt`.
  - A directory `logs/` holding only `.log` files is in the set as `logs`.
  - A file that is tracked (`git add -f`) and also matches an ignore rule is not in the set.
  - A root that is a subdirectory of the repository gets paths relative to that subdirectory (`deep`, not `sub/deep`).
  - A root that is itself an ignored directory (`dist`) returns an empty set.
  - A directory outside any repository returns an empty set.

## Verification

- `$janissary/scripts/run.mjs check-diff` (lint, typecheck, and the two new test files).
- Confirm `git diff package-lock.json` changes only the root `dependencies` entry and the `"dev": true` flags on `minimatch`, `brace-expansion`, and `balanced-match`, with no version changes.
- Nothing calls these modules until subplan 3, so there is no manual end-to-end check here.

## Out of scope

Walking the tree, pruning, symbolic links, limits, deadlines, and output formatting are subplans 3 and 4. Deciding when to load the ignored set (skipped under `--hidden`) is subplan 4. Changing `src/search/filter-paths.ts`, which has the same macOS case folding through `path.matchesGlob`, is out of scope. Parsing `.gitignore` outside a git repository is out of scope for the whole feature.
