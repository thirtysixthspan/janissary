# File glob 9 — command-bar completion and end-to-end verification

**Complexity: 4/10** — ~25 added lines, 3 files edited, 7 requirements, 9 test scenarios (p=5.21)

Run order: 9 of 9 in the file glob series. Source plan: `product/plans/complete/file-glob.md`. Depends on subplan 7 (the typed command exists to complete) and subplan 8 (the ACP wiring the end-to-end check exercises).

This subplan adds command-bar completion for `file glob`, then runs the source plan's whole verification section once more against the finished feature, so the series ends with one end-to-end check rather than an implied cleanup.

## Design decisions

All from the source plan unless marked:

- Typing in the command bar completes `glob` after `file` (beside `read`), completes the flags `--dirs`, `--hidden`, `--limit`, and `--path` for a `--` token, completes directory names after `--path`, and leaves the token unchanged after `--limit`. The pattern token is not completed.
- Directory-only completion is an optional `directoriesOnly` argument on `completeFilePath` in `src/completion/fs.ts`, which filters entries with the existing `isDir` helper. Existing callers are unchanged.
- Paths complete against the same `fileReadRoot` the read uses, so a remote tab (root `undefined`) completes no directories.
- Subplan decision: `product/specs/tab-completion.md` states today that any argument under a subcommand other than `read` gets no candidates; that sentence changes with this behavior, so the spec section is updated in the same change (architecture principle 10). The source plan doesn't name this file, but leaving it would make the spec wrong.

## What already exists (reuse, don't rebuild)

| Piece | Where | Use |
| --- | --- | --- |
| `completeFileReadCommand`, `FILE_SUBCOMMANDS`, `FILE_READ_FLAGS` | `src/completion/file-read.ts` | The dispatcher to extend. |
| `completeFilePath`, `isDir` | `src/completion/fs.ts`, `src/completion/helpers.ts` | Path completion and the directory test. |
| `completeWord`, `unchanged` | `src/completion/helpers.ts`, `src/completion/candidates.ts` | Word and no-op results. |
| `fileReadRoot` wiring | `src/completion/index.ts` | Unchanged; its doc comment gains `file glob`. |

## Proposed changes

- `src/completion/file-read.ts`: `FILE_SUBCOMMANDS` becomes `['glob', 'read']`. When `preceding[1]` is `glob`, a small local helper handles the arguments: after `--limit`, unchanged; after `--path`, `completeFilePath(cursor, root, { directoriesOnly: true })` when `root` is defined, else unchanged; a `--` token completes from `['--dirs', '--hidden', '--limit', '--path']`; anything else (the pattern) unchanged. The `read` branch is unchanged. The header comment covers both subcommands.
- `src/completion/fs.ts`: the optional `directoriesOnly` argument filters matches to directories before the common-prefix step.
- `src/completion/index.ts`: the doc comment mentions `file glob`.
- `product/specs/tab-completion.md`: the `file read` section becomes a `file` section covering `read` and `glob` with the rules above, including that the pattern and the `--limit` value get no candidates and that a remote tab gets no directory candidates.

## Tests

`src/completion/file-read.test.ts` (and `src/completion/fs.test.ts` if it exists, else beside it):

- The first argument completes `glob` and `read` from a shared prefix and each from its own.
- After `file glob`, a `--` token offers the four flags; `--h` completes `--hidden`.
- After `--path`, only directories are offered, a unique match gets a trailing `/`, and a file with a matching prefix is not offered.
- After `--path` with no root (a remote tab), nothing is offered.
- After `--limit`, the token is unchanged.
- The pattern token is unchanged.
- The existing test that a subcommand other than `read` gets nothing is updated to use an unknown subcommand.
- `completeFilePath` without `directoriesOnly` still offers files.

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- Manual, command bar: type `file g` and Tab to get `file glob`; type `file glob *.ts --p` and Tab to get `--path`; type `src/file-r` after `--path` and Tab to get `src/file-read/`.
- End to end, the source plan's full verification section against the finished series:
  - Local tab: `file glob **/*.test.ts --path src/file-read` prints a sorted list of root-relative test paths under `src/file-read/`; `file glob * --dirs --path src --limit 5` prints five `src/<name>/` lines plus the truncation line; `file glob nothing-matches-this` prints `(no matches)`; `file glob *.ts --path missing` prints `Directory not found: missing.`
  - ACP: an `ask` session asked to list the plan files under `product/plans/complete` whose names mention `editor` emits one `file glob` line and receives the matching paths.
  - Confirm `help file` shows the glob section and the Commands tab shows a `file glob` row.

## Out of scope

Completing the pattern token. Any web UI beyond the command's transcript output.
