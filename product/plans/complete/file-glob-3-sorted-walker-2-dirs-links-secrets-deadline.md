# File glob 3.2 — walker `--dirs` mode, symbolic links, secret drop, and deadline

**Complexity: 5/10** — ~40 added lines in 1 edited file, 13 requirements, 13 test scenarios (p=5.54)

Run order: piece 2 of 2 of file glob subplan 3, which is 3 of 9 in the file glob series. Subplan 3 is recorded whole in `product/plans/complete/file-glob-3-sorted-walker.md`; the feature's canonical plan is `product/plans/complete/file-glob.md`. Depends on piece 1 (`product/plans/complete/file-glob-3-sorted-walker-1-core-walk.md`, already landed: `walkGlob`, `GlobWalkOptions`, `GlobWalkResult` in `src/file-glob/walk.ts`) and on subplan 2 (`createGlobMatcher` in `src/file-glob/match.ts`, also landed). After this piece, `walkGlob` has the full contract subplan 4 (`product/plans/draft/file-glob-4-workspace-entry.md`) calls: `walkGlob({ root, start, pattern, hidden, dirs, limit, deadline, ignored })` returning `{ paths, truncated, timedOut }`.

This piece completes the walker. It adds `--dirs` mode, classifies symbolic links with one `stat` so a link to a file is listed and a link to a directory is never entered, drops secret files before they count toward the limit, and stops at the deadline.

## Design decisions

From the source plan:

- A symbolic link is classified with one `stat`. A link to a file counts as a file. A link to a directory is never entered and never listed, not even under `--dirs`, so cycles cannot happen. A broken link is skipped.
- In `--dirs` mode, directories are tested instead of files, empty ones included, and the start directory itself is never tested or listed. Pruning rules apply identically in both modes, so a pruned directory (`.git`, a dot-directory or `node_modules` without `hidden`, an ignored path without `hidden`) is neither listed nor entered. In file mode, links to files are tested alongside regular files.
- In `--dirs` mode the recorded path ends in `/`; the pattern is matched against the path without the slash.
- A match whose root-relative path `checkLexicalPath` (`src/file-read/policy.ts`) classifies as `Secret file` is dropped before it counts toward the limit. The check runs only on matches, never on every walked entry, because it calls `realpathSync` for its home-directory test. The same check covers directories under `--dirs`, so `.aws/` is never listed.
- The walk stops when the deadline has passed (timed out). The deadline is checked before each directory read.

Decisions subplan 3 makes, carried by this piece:

- **Pre-order in `--dirs` mode.** A directory is recorded before its contents are walked, so `a/` precedes `a/b/`. Piece 1's no-re-sort rule still holds: a whole-list string sort would put `a-b/` before `a/`, because `-` (U+002D) sorts below `/` (U+002F).
- **Descent does not depend on the match.** In both modes a directory that survives pruning is descended into whether or not it matched and whether or not the secret check dropped it; only a stop (limit or deadline) prevents the descent. So under `--dirs` and `hidden`, `.aws/` is dropped but the walk still enters it (its subdirectories are dropped by the same check, since `isSecretPath` matches the `.aws` segment anywhere in the path).
- **Classification with `stat`.** At piece 1's `classify` step (`src/file-glob/walk.ts`, `function classify(entry: Dirent): EntryKind`), a `Dirent` whose `isSymbolicLink()` is true gets one `stat` (imported from `node:fs/promises` next to the existing `readdir`) on `path.join(absDir, entry.name)` — an OS path, so `path.join` is correct here, unlike the forward-slash relative strings. A file target classifies as `'file'`; a directory target, a target that is neither, or a `stat` that rejects (a broken link, or one deleted mid-walk) classifies as `'skip'`. `classify` becomes async and takes the absolute directory as a second argument. The `stat` happens only at this step, which already runs after `isPruned`, so a pruned link is never stat'ed. A `Dirent` that is neither a file, a directory, nor a symbolic link (socket, FIFO, device) is still `'skip'` with no `stat`. A skipped entry is neither tested, listed, nor entered, in either mode.
- **Secret check call.** Call `checkLexicalPath(options.root, rootRelative)` with the root-relative path without the `--dirs` trailing slash. Forward slashes are fine: it runs `path.resolve(root, requested)` first, which normalizes separators, and `isSecretPath` then splits `path.relative` output on `path.sep`. Drop the match only when the result is `'Secret file'`; any other result cannot occur for an entry found under `root`. The order inside `record` is: matcher on the start-relative path, then the secret check, then push and the limit test. A dropped match is not pushed, so it does not count toward the limit. `.env.example` is a secret file (`isSecretPath` treats any `.env.`-prefixed name as secret) and is omitted even under `hidden`; this is settled, do not special-case it.
- **Stopping, one place.** `WalkState` gains `timedOut: boolean`. At the top of `walkDirectory`, before `readSorted`, return at once if `state.stopped`; otherwise, if `Date.now() >= state.options.deadline`, set both `state.timedOut` and `state.stopped` and return. This one check covers every `readdir`, the start directory's included, and also prevents the extra `readdir` that would otherwise happen when recording a `--dirs` match hits `limit + 1` just before descending into that same directory. `Date.now()` is called nowhere else in `walk.ts`, so a test spy sees exactly one call per directory about to be read. The existing in-loop `if (state.stopped) return;` stays, so once stopped nothing else is read, stat'ed, or tested.
- **Result flags.** `walkGlob` returns `truncated: state.paths.length > options.limit` (no longer `state.stopped`, which now also means timed out) and `timedOut: state.timedOut`. They are never both true: a deadline stop records nothing more, and a limit stop reads no further directory, so the deadline is never tested again. `paths` stays `state.paths.slice(0, options.limit)` — fewer than `limit` when timed out.
- **Read failures, completed.** Piece 1's rule that a `readdir` rejection skips the directory stands (`readSorted` returns `[]`); a start deleted between validation and walking yields no paths with both `truncated` and `timedOut` false.

## What already exists (reuse, don't rebuild)

| Piece | Where | Use |
| --- | --- | --- |
| `walkGlob`, `GlobWalkOptions`, `GlobWalkResult`, `WalkState`, `readSorted`, `isPruned`, `classify`, `record`, `joinRelative`, `walkDirectory` | `src/file-glob/walk.ts` (piece 1, 92 lines) | Extend in place: add the fields, the `stat` branch in `classify`, the secret check and `dirs` suffix in `record`, the `--dirs` branch, and the stop/deadline check at the top of `walkDirectory`. `readSorted`, `isPruned`, and `joinRelative` stay unchanged. |
| `checkLexicalPath` | `src/file-read/policy.ts` (`export function checkLexicalPath(root: string, requested: string)`) | The `Secret file` classification `file read` uses, applied to each match's root-relative path. `isSecretPath` is not exported; do not export it — go through `checkLexicalPath` so the home-directory test is included. |
| `GlobResultFlags`, `formatGlobResult` | `src/file-glob/command.ts` (subplan 1) | Not imported here; `GlobWalkResult`'s `timedOut` uses the same name as `GlobResultFlags.timedOut` so subplan 4 passes it straight through. |
| `src/file-glob/walk.test.ts` | piece 1 (about 120 lint-counted lines) | Keep its existing cases; only update their options and expected results (see Tests). Its `vi.mock('node:fs/promises', …)` spreads the real module and wraps only `readdir`, so the new `stat` import stays real under that mock. |

## Proposed changes

Edit `src/file-glob/walk.ts` (about 40 added lines; about 130 in total, under the 200-line limit):

- `GlobWalkOptions` gains `dirs: boolean` and `deadline: number` (an epoch millisecond time, compared with `Date.now()`).
- `GlobWalkResult` gains `timedOut: boolean`. `WalkState` gains `timedOut: boolean`, initialized `false`.
- `classify` becomes async and does the single `stat` for a symbolic link, as above.
- `record` gains the secret check between the matcher and the push, and a parameter saying whether the candidate is a `--dirs` directory, in which case it pushes `rootRelative + '/'` (matcher and secret check still use the slash-free strings).
- The per-entry dispatch moves out of the `walkDirectory` loop into a new local helper (name it `visitEntry`), so the loop stays: stop test, build `rootRelative`, `isPruned`, then `await visitEntry(...)`. `visitEntry` awaits `classify`; for `'file'` it calls `record` only when `dirs` is false; for `'directory'` it calls `record` (as a directory) only when `dirs` is true, then always recurses with `walkDirectory`; for `'skip'` it does nothing. The start directory is never passed to `record` because `walkGlob` calls `walkDirectory` on it directly.
- `walkDirectory` gets the stop/deadline check at its top, as above.
- `walkGlob` initializes `timedOut` and returns the flags as above.

Imports: add `stat` to the existing `node:fs/promises` import and import `checkLexicalPath` from `../file-read/policy.js` — relative imports keep the `.js` extension. Keep `sonarjs/cognitive-complexity` under 15 by keeping the mode branches in `visitEntry` and `record`, not in the loop.

## Tests

`walk.test.ts` stays under 200 lint-counted lines by taking only the updates to its existing cases; every new case goes into a new file, `src/file-glob/walk-modes.test.ts`.

Updates to `src/file-glob/walk.test.ts`:

- The `walk` helper's default options gain `dirs: false` and `deadline: Date.now() + 60_000`.
- Every assertion that compares a whole result with `toEqual` (`{ paths, truncated }`, in the sorted-order, `truncates at limit + 1`, `does not truncate at exactly limit`, `stops reading directories`, and `does not exist` cases) gains `timedOut: false`; without it they fail once `timedOut` exists.

New `src/file-glob/walk-modes.test.ts`, with its own `mkdtempSync(path.join(tmpdir(), 'file-glob-walk-'))` root removed in `afterEach`, its own copy of the small `write` helper and `walk` helper (same defaults as above), and `vi.restoreAllMocks()` in `afterEach` to undo the `Date.now` spy. It does not mock `node:fs/promises`. Test files are excluded from jscpd (`.jscpd.json` ignores `**/*.test.ts`), so the duplicated helpers are fine; do not create a shared fixture module for them. Symbolic links are made with `symlinkSync` from `node:fs`.

- `--dirs` order: directories `a/b`, `a-b` give `['a/', 'a/b/', 'a-b/']` in that order.
- `dirs`: directories listed with a trailing `/`, an empty directory included, the start directory excluded (also with `start` set to a subdirectory: that subdirectory is not listed, its child directories are, root-relative), and files not listed.
- `.git` never listed under `dirs`, with or without `hidden`, whether it is a directory or a file (completing piece 1's file-mode case).
- A symbolic link to a parent directory (a cycle) terminates and is not listed, in file mode and in `dirs` mode; a symbolic link to a file is listed in file mode and not in `dirs` mode; a broken link is skipped in both modes.
- Secret files (`.env`, `.env.local`, `.env.example`, a file under `.aws/`) omitted under `hidden`, and not counted toward the limit (with `hidden`, `limit: 1`, and only `.env` plus one ordinary file `a`, the result is `{ paths: ['a'], truncated: false, timedOut: false }`); `.aws/` omitted under `dirs` and `hidden`.
- An already-passed deadline (`deadline: 0`) returns `{ paths: [], truncated: false, timedOut: true }`.
- A deadline that passes mid-walk: files `a` and `b/x`, `deadline: 1`, and a `vi.spyOn` spy on `Date.now` that returns `0` on its first call and `2` on every later call, so the start directory's check passes and `b`'s trips; the result is `{ paths: ['a'], truncated: false, timedOut: true }`. This test calls `walkGlob` directly with a literal options object, not the `walk` helper, and installs the spy just before that call: the helper's default `Date.now() + 60_000` would otherwise consume the first mocked value and trip the start directory's check.

## Verification

- `$janissary/scripts/run.mjs check-diff` (lint, typecheck, `walk.test.ts`, and `walk-modes.test.ts`).
- Nothing calls `walkGlob` until subplan 4, so there is no manual end-to-end check here.

## Out of scope

`--path` validation, the git call, the 30-second timeout constant, and output formatting are subplan 4. Subplans 4–9 (`product/plans/draft/file-glob-4..9-*.md`) are not touched. Following symbolic links into directories and a total match count are out of scope for the whole feature. Changing the `localeCompare` sorts in `src/file-navigator/` is out of scope. Exporting `isSecretPath` or changing `src/file-read/policy.ts` is out of scope.
