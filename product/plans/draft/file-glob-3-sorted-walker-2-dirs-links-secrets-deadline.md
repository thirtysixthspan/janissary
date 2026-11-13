# File glob 3.2 — walker `--dirs` mode, symbolic links, secret drop, and deadline

**Complexity: 5/10** — ~40 added lines in 1 edited file, 12 requirements, 11 test scenarios (p=5.42)

Run order: piece 2 of 2 of file glob subplan 3, which is 3 of 9 in the file glob series. Subplan 3 is recorded whole in `product/plans/complete/file-glob-3-sorted-walker.md`; the feature's canonical plan is `product/plans/complete/file-glob.md`. Depends on piece 1 (`product/plans/draft/file-glob-3-sorted-walker-1-core-walk.md`: `walkGlob`, `GlobWalkOptions`, `GlobWalkResult` in `src/file-glob/walk.ts`) and on subplan 2 (`createGlobMatcher`). After this piece, `walkGlob` has the full contract subplan 4 calls.

This piece completes the walker. It adds `--dirs` mode, classifies symbolic links with one `stat` so a link to a file is listed and a link to a directory is never entered, drops secret files before they count toward the limit, and stops at the deadline.

## Design decisions

From the source plan:

- A symbolic link is classified with one `stat`. A link to a file counts as a file. A link to a directory is never entered and never listed, not even under `--dirs`, so cycles cannot happen. A broken link is skipped.
- In `--dirs` mode, directories are tested instead of files, empty ones included, and the start directory itself is never tested or listed. Pruning rules apply identically in both modes. In file mode, links to files are tested alongside regular files.
- In `--dirs` mode the recorded path ends in `/`; the pattern is matched against the path without the slash.
- A match whose root-relative path `checkLexicalPath` (`src/file-read/policy.ts`) classifies as `Secret file` is dropped before it counts toward the limit. The check runs only on matches, never on every walked entry, because it calls `realpathSync` for its home-directory test. The same check covers directories under `--dirs`, so `.aws/` is never listed.
- The walk stops when the deadline has passed (timed out). The deadline is checked before each directory read.

Decisions subplan 3 makes, carried by this piece:

- **Pre-order in `--dirs` mode.** A directory is recorded before its contents are walked, so `a/` precedes `a/b/`. Piece 1's no-re-sort rule still holds: a whole-list string sort would put `a-b/` before `a/`, because `-` (U+002D) sorts below `/` (U+002F).
- **Classification with `stat`.** At piece 1's classify step, a `Dirent` that is a symbolic link gets one `stat` (from `node:fs/promises`) on its absolute path: a file target classifies as a file, and a directory target, a target that is neither a file nor a directory, or a `stat` that rejects (a broken link, or one deleted mid-walk) classifies as skip. The `stat` happens only at this step, after pruning, so a pruned link is never stat'ed. A `Dirent` that is neither a file, a directory, nor a symbolic link (socket, FIFO, device) is still skipped. A skipped link is neither tested, listed, nor entered, in either mode.
- **Secret check call.** Call `checkLexicalPath(root, rootRelative)` with the root-relative path without the `--dirs` trailing slash. Forward slashes are fine: it runs `path.resolve(root, requested)` first, which normalizes separators. Drop the match only when the result is `'Secret file'`; any other result cannot occur for an entry found under `root`. A dropped match is not recorded, so it does not count toward the limit.
- **Stopping at the deadline.** The deadline test is `Date.now() >= deadline`, made before every `readdir`, the start directory's included; when it trips, set `timedOut` and stop. Once stopped, the loops return without reading, stat'ing, or testing anything else. `truncated` and `timedOut` are never both true. `paths` is the matches recorded so far (fewer than `limit` when timed out).
- **Read failures, completed.** Piece 1's rule that a `readdir` rejection skips the directory stands; a start deleted between validation and walking yields no paths with both `truncated` and `timedOut` false.

## What already exists (reuse, don't rebuild)

| Piece | Where | Use |
| --- | --- | --- |
| `walkGlob`, `GlobWalkOptions`, `GlobWalkResult` and the classify and record helpers | `src/file-glob/walk.ts` (piece 1) | Extend in place: add the fields, the `stat` branch in classify, the secret check in record, the `--dirs` branch, and the deadline test before `readdir`. |
| `checkLexicalPath` | `src/file-read/policy.ts` | The `Secret file` classification `file read` uses, applied to each match's root-relative path. |
| `GlobResultFlags`, `formatGlobResult` | `src/file-glob/command.ts` (subplan 1) | Not imported here; `GlobWalkResult`'s `timedOut` uses the same name as `GlobResultFlags` so subplan 4 passes it straight through. |
| `src/file-glob/walk.test.ts` | piece 1 | Extend with the cases below, reusing its temp-dir lifecycle and `write` helper. |

## Proposed changes

Edit `src/file-glob/walk.ts` (about 40 added lines; about 120 in total, under the 200-line limit):

- `GlobWalkOptions` gains `dirs` (boolean) and `deadline` (an epoch millisecond time, compared with `Date.now()`).
- `GlobWalkResult` gains `timedOut`.
- The classify helper becomes async and does the single `stat` for a symbolic link, as above.
- The record helper runs the secret check after the matcher accepts a candidate and before recording it, and appends the trailing `/` for a directory in `dirs` mode.
- The per-entry loop tests directories instead of files when `dirs` is set, recording a matching directory before descending into it; it never tests the start directory. Files are not tested in `dirs` mode.
- The directory-reading function tests the deadline before its `readdir`.

Its relative imports become `./match.js` and `../file-read/policy.js`, both with the `.js` extension. Keep `sonarjs/cognitive-complexity` under 15 by putting the new branches in the helpers rather than the loop.

## Tests

Extend `src/file-glob/walk.test.ts`. Symbolic links are made with `symlinkSync`. Unless a test is about the deadline, pass `deadline: Date.now() + 60_000`, and update piece 1's existing calls to pass it and `dirs: false`.

- `--dirs` order: `a/`, `a/b/`, `a-b/` in that order.
- `dirs`: directories listed with a trailing `/`, an empty directory included, the start directory excluded, and files not listed.
- `.git` never listed under `dirs`, with or without `hidden`, whether it is a directory or a file (completing piece 1's file-mode case).
- A symbolic link to a parent directory (a cycle) terminates and is not listed in either mode; a symbolic link to a file is listed; a broken link is skipped.
- Secret files (`.env`, `.env.local`, `.env.example`, a file under `.aws/`) omitted under `hidden`, and not counted toward the limit (with `limit: 1`, one ordinary match after `.env` gives that match and `truncated: false`); `.aws/` omitted under `dirs` and `hidden`.
- An already-passed deadline returns no paths, `timedOut: true`, `truncated: false`.
- A deadline that passes mid-walk (spy on `Date.now` with `vi.spyOn` so it passes after the first directory read) keeps the matches found so far, `timedOut: true`.

## Verification

- `$janissary/scripts/run.mjs check-diff` (lint, typecheck, and `walk.test.ts`).
- Nothing calls `walkGlob` until subplan 4, so there is no manual end-to-end check here.

## Out of scope

`--path` validation, the git call, the 30-second timeout constant, and output formatting are subplan 4. Following symbolic links into directories and a total match count are out of scope for the whole feature. Changing the `localeCompare` sorts in `src/file-navigator/` is out of scope.
