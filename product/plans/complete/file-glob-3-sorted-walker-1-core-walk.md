# File glob 3.1 — core sorted walk: traversal, pruning, matching, limit

**Complexity: 5/10** — ~85 added lines in 1 new module, 13 requirements, 12 test scenarios (p=5.40)

Run order: piece 1 of 2 of file glob subplan 3, which is 3 of 9 in the file glob series. Subplan 3 is recorded whole in `product/plans/complete/file-glob-3-sorted-walker.md`; the feature's canonical plan is `product/plans/complete/file-glob.md`. Depends on subplan 2 (`createGlobMatcher` in `src/file-glob/match.ts`, and the `loadIgnoredPaths` set shape in `src/file-glob/ignored.ts`), which has landed. Imports nothing from subplan 1's `command.ts`. Piece 2 (`product/plans/draft/file-glob-3-sorted-walker-2-dirs-links-secrets-deadline.md`) builds on this one. Subplan 4 calls `walkGlob` only after piece 2 lands: this piece has no secret drop, so on its own `walkGlob` under `hidden` would list `.env`. Until then nothing in production imports `walk.ts`.

This piece adds `src/file-glob/walk.ts` with the walk that turns a start directory into a sorted list of matching root-relative file paths. It reads one directory at a time, sorts each by code unit, descends depth-first, prunes `.git`, hidden, `node_modules`, and ignored entries, tests each file against the pattern, and stops at the limit. Unreadable directories are skipped. It lists files only, and skips every symbolic link and special file. Piece 2 adds `--dirs` mode, symbolic-link classification, the secret-file drop, and the deadline.

## Design decisions

From the source plan:

- One async walk with promise-based `readdir(dir, { withFileTypes: true })` from `node:fs/promises`. Each directory's entries are sorted by name in code-unit order, and the walk descends depth-first, so results come out in sorted path order the way a file tree reads: `a/x` comes before `a-b/x`, and `B.ts` comes before `a.ts`.
- Why not Node's `fs.promises.glob`: it yields matches in traversal order, so stopping at `limit + 1` would not give the first `<n>` sorted matches without walking the whole tree. `walkFiles` in `src/file-navigator/search.ts` isn't reusable: it isn't exported, collects every file, and can't prune.
- The walk never descends into, tests, or lists an entry named `.git` at any depth, whatever its type (a submodule or worktree has a `.git` file), even with `hidden`.
- Without `hidden` it prunes any entry whose name starts with `.`, any entry named `node_modules` (at any depth, any type), and any entry whose root-relative path is in the ignored set. An ignored directory is pruned without being entered. With `hidden` nothing but `.git` is pruned.
- Each candidate's path relative to the start directory is tested against the pattern (anchoring: `*.ts` from `src` matches `src/a.ts` but not `src/x/b.ts`). A pattern with no `/` is not widened to any depth.
- In file mode (the only mode in this piece), regular files are tested; directories are only traversed.
- Matches are recorded root-relative with forward slashes, so a narrowed search still prints paths that `file read` accepts.
- The walk stops once it holds `limit + 1` matches (truncated). It then returns the first `limit` matches and `truncated: true`; it never counts the rest.
- Deliberate ceiling: the walk runs on the main event loop. Each `readdir` await yields, but matching one very large directory runs in one turn. If that shows up as lag, the walk moves behind the worker pattern in `src/search/matching-worker.ts`; that is not part of this series.

Decisions subplan 3 makes, carried by this piece:

- **One matcher per search.** `walkGlob` calls `createGlobMatcher(options.pattern, options.hidden)` once at the start and calls the returned predicate once per candidate. Never compile per candidate (subplan 2 measured that as about ten times slower), and never reintroduce `path.matchesGlob` or a leading-dot mask: the `hidden` dot rule is already the matcher's `dot` option. The predicate gets a forward-slash path relative to `start`, with no leading `./` and no trailing `/`, which is the input contract `createGlobMatcher` documents. A pattern minimatch rejects yields a matcher that answers `false`, so the walk runs and returns no paths; the walker adds no handling of its own.
- **Code-unit sort, not `localeCompare`.** `unicorn/require-array-sort-compare` (an error in `eslint.config.mjs`) forbids a bare `sort()`, and every comparator in this codebase uses `localeCompare` (`listProjectFiles` in `src/file-navigator/search.ts`, `sortedEntries` in `src/file-navigator/index.ts`). Do not copy them: `localeCompare` is locale-aware and puts `a.ts` before `B.ts`. Sort each directory's `Dirent`s by `name` with a comparator that returns `-1`, `1`, or `0` from the `<` and `>` operators on the two names, which is the code-unit order a default `sort()` gives. Put that comparison in a named, module-level function over two strings (for example `compareCodeUnits(a, b)`, written with `if` statements), and sort with `toSorted((a, b) => compareCodeUnits(a.name, b.name))` as the rest of `src/` does. Do not write the `<`/`>` ternary inline in the `toSorted` callback: `unicorn/prefer-simple-sort-comparator` (on through `unicorn.configs['flat/recommended']`) flags that shape as an error and its suggested fix, `a.name - b.name`, is wrong for strings. A callback whose body is a call to the named function is not flagged.
- **Never re-sort the result.** Matches are appended in walk order, which is already the required order. A final whole-list sort would break it: `-` (U+002D) sorts below `/` (U+002F), so a string sort puts `a-b/x` before `a/x`.
- **Sequential, never parallel.** Directories are read one at a time with `await` in a `for … of` loop over the sorted entries. `Promise.all` over children would break both the order and early stopping.
- **Per-entry order of checks.** For each entry, in this order: skip `.git`; without `hidden`, skip a leading-`.` name, `node_modules`, or an ignored root-relative path; then classify; then test and record; then, for a directory, descend. In this piece classification reads only the `Dirent`: `isFile()` is a file, `isDirectory()` is a directory, and anything else (a symbolic link, socket, FIFO, or device) is skipped. Piece 2 inserts the symbolic-link `stat` at the classify step, so pruning still runs before any `stat`.
- **Ignored set only without `hidden`.** The walker does not consult `ignored` when `hidden` is true, so "nothing but `.git` is pruned" holds whatever the caller passes. Subplan 4 still skips the git call under `--hidden` and passes an empty set. The set's entries are `loadIgnoredPaths`'s shape: root-relative, forward slashes, no trailing `/`, compared with `ignored.has(rootRelative)` for files and directories alike.
- **`start` is a lexical path under `root`.** `start` is `root` itself or `path.resolve(root, dir)`, never a `realpath`. The walker computes the start's root-relative prefix once with `path.relative(root, start)`, converts `path.sep` to `/`, and builds every candidate's two paths (relative to `start` for the matcher, relative to `root` for the ignored set and the output) by joining names with `/`, like `relPath` in `walkFiles` (`src/file-navigator/search.ts`). Never use `path.join` for these strings: it yields `\` on Windows, which the ignored set and the matcher don't use. A `realpath`'d start would produce a `../` prefix whenever `root` contains a symbolic link (macOS `tmpdir()` is under `/var`, a link to `/private/var`). Subplan 4 must pass the lexical form; its `realpath` is only for its containment check.
- **The start directory is not tested against the pruning rules**, because the walker only receives it after subplan 4 validated it. `--path .github` without `--hidden` therefore lists the contents of `.github`, and `--path dist` with `dist` ignored lists the contents of `dist`, since git collapses an ignored directory to the single entry `dist` and its children are not in the set.
- **Stopping at the limit.** After recording a match, if the count exceeds `limit`, set `truncated` and stop. Once stopped, the loops return without reading, classifying, or testing anything else. The result's `paths` is the first `limit` recorded matches (fewer when the walk is exhausted). The walker trusts `limit` to be an integer from 1 to `FILE_GLOB_MAX_LIMIT` (1000), which subplan 4 guarantees through `parseFileGlob` (`positiveInteger` in `src/positive-integer.ts` rejects anything below 1); it adds no validation of its own.
- **Read failures.** A `readdir` that rejects (permissions, a directory deleted mid-walk) skips that directory and the walk continues with its siblings, as `walkFiles` does. This applies to the start directory too: a start deleted between validation and walking yields no paths and `truncated: false`.

## What already exists (reuse, don't rebuild)

| Piece | Where | Use |
| --- | --- | --- |
| `createGlobMatcher(pattern, hidden)` and the `GlobMatcher` type | `src/file-glob/match.ts` (subplan 2) | Build once per walk; call the predicate per candidate. Handles case sensitivity, the `hidden` dot rule, and invalid patterns. |
| `loadIgnoredPaths(root)` return shape | `src/file-glob/ignored.ts` (subplan 2) | Defines `ignored`: a `ReadonlySet<string>` of root-relative, forward-slash paths without a trailing `/`. The walker never calls it; subplan 4 does. |
| `walkFiles` | `src/file-navigator/search.ts` | Shape to follow for the `readdir` call in `try`/`catch` and its `relPath` building (the parent's relative path, a `/`, then the entry name; the bare name at the top). Not its `localeCompare` sort. |
| `GlobResultFlags`, `formatGlobResult` | `src/file-glob/command.ts` (subplan 1) | Not imported here; `GlobWalkResult`'s `truncated` uses the same name so subplan 4 passes it straight through. |
| `write` test helper and temp-dir lifecycle | `src/file-glob/ignored.test.ts` | Copy the `write(root, relative)` helper and the `mkdtempSync(path.join(tmpdir(), …))` / `rmSync(root, { recursive: true, force: true })` pair. |

## Proposed changes

Create `src/file-glob/walk.ts` (about 85 lines, well under the 200-line limit) exporting:

- `GlobWalkOptions`: `root` (absolute root), `start` (absolute start directory, lexically inside the root, see Decisions), `pattern`, `hidden`, `limit`, and `ignored` (`ReadonlySet<string>`, the set from subplan 2). Piece 2 adds `dirs` and `deadline`.
- `GlobWalkResult`: `paths` (`string[]`, at most `limit` root-relative strings, in walk order) and `truncated`. Piece 2 adds `timedOut`.
- `walkGlob(options)`, an async function returning `GlobWalkResult`. It builds the matcher, keeps the collected matches and the stop state in a closure, and recurses one directory at a time. Local, unexported helpers keep `sonarjs/cognitive-complexity` under 15: one sorts a directory's entries by code unit, one decides pruning from the entry name and its root-relative path, one classifies one `Dirent` as file, directory, or skip, and one tests a candidate and records it. Piece 2 extends the classify and record helpers rather than adding branches to the loop.

Its one relative import is `./match.js`, with the `.js` extension. Its other imports are `readdir` from `node:fs/promises`, `import type { Dirent } from 'node:fs'` for the helper signatures (`@typescript-eslint/consistent-type-imports`), and the default `path` import from `node:path` as in `src/file-navigator/search.ts`.

## Tests

`src/file-glob/walk.test.ts`, against `mkdtempSync(path.join(tmpdir(), 'file-glob-walk-'))`, removed in `afterEach`. Unless a test is about ignoring, pass an empty set.

- Sorted depth-first order across nested directories, including `a/x` before `a-b/x`, and `B.ts` before `a.ts` (the case that fails under `localeCompare`).
- Anchoring: with `start` at `root/src`, `*.ts` gives `src/a.ts` and not `src/x/b.ts`; output paths are relative to `root`.
- Dotfiles, dot-directories, and `node_modules` (nested too) pruned without `hidden` and listed with it; `**/*` under `hidden` lists a non-secret dotfile (such as `.eslintrc.json`) and a file under `.github/`. Do not use `.env.example` here: `isSecretPath` in `src/file-read/policy.ts` treats any `.env.*` name as a secret (`src/file-read/read.test.ts` refuses `.env.example`), so piece 2's secret drop omits it. Piece 2 asserts that omission.
- A path in `ignored` (a file and a directory) is pruned; the directory's contents are not visited (a file under it that matches is absent). Membership is exact, not a prefix test: with `dist` ignored, a sibling `dist-old/x.ts` is still listed.
- Under `hidden`, a non-empty `ignored` set is not consulted.
- A start directory that is itself a dot-directory, or is in `ignored`, still has its contents listed without `hidden`.
- `.git` never listed in file mode, with or without `hidden`, whether it is a directory or a file. Piece 2 adds the `dirs`-mode half.
- The limit: `limit + 1` candidates gives `limit` paths and `truncated: true`; exactly `limit` gives `truncated: false`.
- An unreadable subdirectory (`chmodSync(dir, 0o000)`, restored before cleanup) is skipped and its later siblings are still listed. Skip this test when `process.getuid?.() === 0`, since root reads it anyway.
- A start directory that does not exist yields no paths and `truncated: false`.

Case sensitivity and invalid patterns are covered by `src/file-glob/match.test.ts` and end to end by subplan 4; the walker adds no logic of its own for them, so they are not repeated here.

## Verification

- `$janissary/scripts/run.mjs check-diff` (lint, typecheck, and `walk.test.ts`).
- Nothing calls `walkGlob` until subplan 4, so there is no manual end-to-end check here.

## Out of scope

`--dirs` mode, symbolic-link classification, the secret-file drop, and the deadline are piece 2. `--path` validation, the git call, the 30-second timeout constant, and output formatting are subplan 4. Following symbolic links into directories and a total match count are out of scope for the whole feature. Changing the `localeCompare` sorts in `src/file-navigator/` is out of scope.
