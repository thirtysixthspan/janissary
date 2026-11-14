# File glob 3 — sorted, pruning, early-stopping walker

**Complexity: 6/10** — ~115 added lines in 1 new module, 18 requirements, 20 test scenarios (p=5.86)

Run order: 3 of 9 in the file glob series. Source plan: `product/plans/complete/file-glob.md`. Depends on subplan 2 (`createGlobMatcher` in `src/file-glob/match.ts`), which has landed. Imports nothing from subplan 1's `command.ts`.

This subplan adds the walk that turns a start directory into a sorted list of matching root-relative paths. It prunes hidden and ignored entries, never enters symbolic links to directories, drops secret files, and stops early at the limit or the deadline. It takes the ignored set and an already-validated start directory as inputs, so `--path` validation, the git call, and formatting stay in subplan 4.

## Design decisions

From the source plan:

- One async walk with promise-based `readdir(dir, { withFileTypes: true })` from `node:fs/promises`. Each directory's entries are sorted by name in code-unit order, and the walk descends depth-first, so results come out in sorted path order the way a file tree reads: `a/x` comes before `a-b/x`, and `B.ts` comes before `a.ts`.
- Why not Node's `fs.promises.glob`: it yields matches in traversal order, so stopping at `limit + 1` would not give the first `<n>` sorted matches without walking the whole tree. `walkFiles` in `src/file-navigator/search.ts` isn't reusable: it isn't exported, collects every file, and can't prune.
- The walk never descends into, tests, or lists an entry named `.git` at any depth, whatever its type (a submodule or worktree has a `.git` file), even with `--hidden`.
- Without `--hidden` it prunes any entry whose name starts with `.`, any entry named `node_modules` (at any depth, any type), and any entry whose root-relative path is in the ignored set. An ignored directory is pruned without being entered. With `--hidden` nothing but `.git` is pruned.
- A symbolic link is classified with one `stat`. A link to a file counts as a file unless its resolved target is a secret file, lies outside the workspace, or cannot be resolved (the link target check that drops those was added later by `file-glob-walker-link-target-check.md`). A link to a directory is never entered and never listed, not even under `--dirs`, so cycles cannot happen. A broken link is skipped.
- Each candidate's path relative to the start directory is tested against the pattern (anchoring: `*.ts` from `src` matches `src/a.ts` but not `src/x/b.ts`). A pattern with no `/` is not widened to any depth.
- In file mode (the default), regular files and links to files are tested; directories are only traversed. In `--dirs` mode, directories are tested instead, empty ones included, and the start directory itself is never tested or listed. Pruning rules apply identically in both modes.
- Matches are recorded root-relative with forward slashes, so a narrowed search still prints paths that `file read` accepts. In `--dirs` mode the recorded path ends in `/`; the pattern is matched against the path without the slash.
- A match whose root-relative path `checkLexicalPath` (`src/file-read/policy.ts`) classifies as `Secret file` is dropped before it counts toward the limit. The check runs only on matches, never on every walked entry, because it calls `realpathSync` for its home-directory test. The same check covers directories under `--dirs`, so `.aws/` is never listed.
- The walk stops once it holds `limit + 1` matches (truncated) or when the deadline has passed (timed out). The deadline is checked before each directory read. When it stops for the limit it returns the first `limit` matches and `truncated: true`; it never counts the rest.
- Deliberate ceiling: the walk runs on the main event loop. Each `readdir` await yields, but matching one very large directory runs in one turn. If that shows up as lag, the walk moves behind the worker pattern in `src/search/matching-worker.ts`; that is not part of this series.

Decisions this subplan makes:

- **One matcher per search.** `walkGlob` calls `createGlobMatcher(options.pattern, options.hidden)` once at the start and calls the returned predicate once per candidate. Never compile per candidate (subplan 2 measured that as about ten times slower), and never reintroduce `path.matchesGlob` or a leading-dot mask: the `--hidden` dot rule is already the matcher's `dot` option. The predicate gets a forward-slash path relative to `start`, with no leading `./` and no trailing `/`, which is the input contract `createGlobMatcher` documents. A pattern minimatch rejects yields a matcher that answers `false`, so the walk runs and returns no paths; the walker adds no handling of its own.
- **Code-unit sort, not `localeCompare`.** `unicorn/require-array-sort-compare` (an error in `eslint.config.mjs`) forbids a bare `sort()`, and every comparator in this codebase uses `localeCompare` (`listProjectFiles` in `src/file-navigator/search.ts`, `sortedEntries` in `src/file-navigator/index.ts`). Do not copy them: `localeCompare` is locale-aware and puts `a.ts` before `B.ts`. Sort each directory's `Dirent`s by `name` with a comparator that returns `-1`, `1`, or `0` from the `<` and `>` operators on the two names, which is the code-unit order a default `sort()` gives.
- **Never re-sort the result.** Matches are appended in walk order, which is already the required order. In `--dirs` mode a directory is recorded before its contents are walked (pre-order), so `a/` precedes `a/b/`. A final whole-list sort would break the order: `-` (U+002D) sorts below `/` (U+002F), so a string sort puts `a-b/` before `a/` and `a-b/x` before `a/x`.
- **Sequential, never parallel.** Directories are read one at a time with `await` in a `for … of` loop over the sorted entries. `Promise.all` over children would break both the order and early stopping.
- **Per-entry order of checks.** For each entry, in this order: skip `.git`; without `hidden`, skip a leading-`.` name, `node_modules`, or an ignored root-relative path; then classify (the `stat` happens only here, so a pruned link is never stat'ed); then test and record; then, for a directory, descend. A `Dirent` that is neither a file, a directory, nor a symbolic link (socket, FIFO, device) is skipped. A link whose target is neither a file nor a directory is skipped too.
- **Ignored set only without `--hidden`.** The walker does not consult `ignored` when `hidden` is true, so "nothing but `.git` is pruned" holds whatever the caller passes. Subplan 4 still skips the git call under `--hidden` and passes an empty set. The set's entries are `loadIgnoredPaths`'s shape: root-relative, forward slashes, no trailing `/`, compared with `ignored.has(rootRelative)` for files and directories alike.
- **`start` is a lexical path under `root`.** `start` is `root` itself or `path.resolve(root, dir)`, never a `realpath`. The walker computes the start's root-relative prefix once with `path.relative(root, start)`, converts `path.sep` to `/`, and builds every candidate's two paths (relative to `start` for the matcher, relative to `root` for the ignored set, the secret check, and the output) by joining names with `/`, like `relPath` in `walkFiles` (`src/file-navigator/search.ts`). Never use `path.join` for these strings: it yields `\` on Windows, which the ignored set and the matcher don't use. A `realpath`'d start would produce a `../` prefix whenever `root` contains a symbolic link (macOS `tmpdir()` is under `/var`, a link to `/private/var`). Subplan 4 must pass the lexical form; its `realpath` is only for its containment check.
- **The start directory is not tested against the pruning rules**, because the walker only receives it after subplan 4 validated it. `--path .github` without `--hidden` therefore lists the contents of `.github`, and `--path dist` with `dist` ignored lists the contents of `dist`, since git collapses an ignored directory to the single entry `dist` and its children are not in the set.
- **Secret check call.** Call `checkLexicalPath(root, rootRelative)` with the root-relative path without the `--dirs` trailing slash. Forward slashes are fine: it runs `path.resolve(root, requested)` first, which normalizes separators. Drop the match only when the result is `'Secret file'`; any other result cannot occur for an entry found under `root`.
- **Stopping.** After recording a match, if the count exceeds `limit`, set `truncated` and stop. The deadline test is `Date.now() >= deadline`, made before every `readdir`, the start directory's included; when it trips, set `timedOut` and stop. Once stopped, the loops return without reading, stat'ing, or testing anything else. `truncated` and `timedOut` are never both true. The result's `paths` is the first `limit` recorded matches (fewer when timed out or exhausted).
- **Read failures.** A `readdir` that rejects (permissions, a directory deleted mid-walk) skips that directory and the walk continues with its siblings, as `walkFiles` does. This applies to the start directory too: a start deleted between validation and walking yields no paths with both flags false. A `stat` that rejects (a broken link, or one deleted mid-walk) skips that entry.

## What already exists (reuse, don't rebuild)

| Piece | Where | Use |
| --- | --- | --- |
| `createGlobMatcher(pattern, hidden)` and the `GlobMatcher` type | `src/file-glob/match.ts` (subplan 2) | Build once per walk; call the predicate per candidate. Handles case sensitivity, the `--hidden` dot rule, and invalid patterns. |
| `loadIgnoredPaths(root)` return shape | `src/file-glob/ignored.ts` (subplan 2) | Defines `ignored`: a `ReadonlySet<string>` of root-relative, forward-slash paths without a trailing `/`. The walker never calls it; subplan 4 does. |
| `checkLexicalPath` | `src/file-read/policy.ts` | The `Secret file` classification `file read` uses, applied to each match's root-relative path. |
| `walkFiles` | `src/file-navigator/search.ts` | Shape to follow for the `readdir` call in `try`/`catch` and its `relPath` building (the parent's relative path, a `/`, then the entry name; the bare name at the top). Not its `localeCompare` sort. |
| `GlobResultFlags`, `formatGlobResult` | `src/file-glob/command.ts` (subplan 1) | Not imported here; `GlobWalkResult`'s `truncated` and `timedOut` use the same names so subplan 4 passes them straight through. |
| `write` test helper and temp-dir lifecycle | `src/file-glob/ignored.test.ts` | Copy the `write(root, relative)` helper and the `mkdtempSync(path.join(tmpdir(), …))` / `rmSync(root, { recursive: true, force: true })` pair. |

## Proposed changes

Create `src/file-glob/walk.ts` (about 110 lines, well under the 200-line limit) exporting:

- `GlobWalkOptions`: `root` (absolute root), `start` (absolute start directory, lexically inside the root, see Decisions), `pattern`, `hidden`, `dirs`, `limit`, `deadline` (an epoch millisecond time, compared with `Date.now()`), and `ignored` (`ReadonlySet<string>`, the set from subplan 2).
- `GlobWalkResult`: `paths` (`string[]`, at most `limit` root-relative strings, in walk order), `truncated`, and `timedOut`.
- `walkGlob(options)`, an async function returning `GlobWalkResult`. It builds the matcher, keeps the collected matches and the stop state in a closure, and recurses one directory at a time. Local, unexported helpers keep `sonarjs/cognitive-complexity` under 15: one sorts a directory's entries by code unit, one decides pruning from the entry name and its root-relative path, one classifies one `Dirent` as file, directory, or skip (doing the single `stat` for a symbolic link; the link target check added later by `file-glob-walker-link-target-check.md` gives a link to a file its own `'link'` kind and drops it when its resolved target is a secret file, lies outside the workspace, or cannot be resolved), and one tests a candidate, runs the secret check, and records it.

Its relative imports are `./match.js` and `../file-read/policy.js`, both with the `.js` extension.

## Tests

`src/file-glob/walk.test.ts`, against `mkdtempSync(path.join(tmpdir(), 'file-glob-walk-'))`, removed in `afterEach`. Symbolic links are made with `symlinkSync`. Unless a test is about the deadline, pass `deadline: Date.now() + 60_000`; unless it is about ignoring, pass an empty set.

- Sorted depth-first order across nested directories, including `a/x` before `a-b/x`, and `B.ts` before `a.ts` (the case that fails under `localeCompare`).
- `--dirs` order: `a/`, `a/b/`, `a-b/` in that order.
- Anchoring: with `start` at `root/src`, `*.ts` gives `src/a.ts` and not `src/x/b.ts`; output paths are relative to `root`.
- Dotfiles, dot-directories, and `node_modules` (nested too) pruned without `hidden` and listed with it; `**/*` under `hidden` lists `.env.example` and a file under `.github/`.
- A path in `ignored` (a file and a directory) is pruned; the directory's contents are not visited (a file under it that matches is absent).
- Under `hidden`, a non-empty `ignored` set is not consulted.
- A start directory that is itself a dot-directory, or is in `ignored`, still has its contents listed without `hidden`.
- `.git` never listed, with or without `hidden`, in either mode, whether it is a directory or a file.
- Secret files (`.env`, `.env.local`, a file under `.aws/`) omitted under `hidden`, and not counted toward the limit (with `limit: 1`, one ordinary match after `.env` gives that match and `truncated: false`); `.aws/` omitted under `dirs` and `hidden`.
- The limit: `limit + 1` candidates gives `limit` paths and `truncated: true`; exactly `limit` gives `truncated: false`.
- A symbolic link to a parent directory (a cycle) terminates and is not listed in either mode; a symbolic link to an in-workspace, non-secret file is listed (a link to a secret or out-of-workspace target is omitted by the link target check added later by `file-glob-walker-link-target-check.md`); a broken link is skipped.
- `dirs`: directories listed with a trailing `/`, an empty directory included, the start directory excluded, and files not listed.
- An already-passed deadline returns no paths, `timedOut: true`, `truncated: false`.
- A deadline that passes mid-walk (spy on `Date.now` with `vi.spyOn` so it passes after the first directory read) keeps the matches found so far, `timedOut: true`.
- An unreadable subdirectory (`chmodSync(dir, 0o000)`, restored before cleanup) is skipped and its later siblings are still listed. Skip this test when `process.getuid?.() === 0`, since root reads it anyway.

Case sensitivity and invalid patterns are covered by `src/file-glob/match.test.ts` and end to end by subplan 4; the walker adds no logic of its own for them, so they are not repeated here.

## Verification

- `$janissary/scripts/run.mjs check-diff` (lint, typecheck, and `walk.test.ts`).
- Nothing calls `walkGlob` until subplan 4, so there is no manual end-to-end check here.

## Out of scope

`--path` validation, the git call, the 30-second timeout constant, and output formatting are subplan 4. Following symbolic links into directories and a total match count are out of scope for the whole feature. Changing the `localeCompare` sorts in `src/file-navigator/` is out of scope.
