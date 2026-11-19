# Supplement file command with additional sub commands — 1: local `file list` and `file stat`

**Complexity: 5/10** — ~180 added lines, 12 requirements, 17 scenarios (p=5.62)

Decomposed from `./product/plans/complete/supplement-file-command-with-additional-sub-commands.md`, the authoritative feature scope. This is subplan 1 of 9 and depends on no earlier subplan. Subplans 2 and 3 reuse the one-word failure helper introduced here; subplans 4 and 5 reuse the shared row formatter for remote output.

## Goal

Make `file list <path>` (alias `file ls <path>`) and `file stat <path>` work on a local tab: a detailed directory listing and one detailed stat row, using the terse result vocabulary the new commands share. Remote channel behavior, dispatcher wiring, completion, native command registration, and docs belong to later subplans.

## Design decisions

- The two list spellings are one operation. One pure parser recognizes both `list` and `ls`, returns the same typed argument, and the same executor runs for both; the alias prints the `list` usage line.
- `file stat` works on both a file and a directory and prints exactly one row in the same format a `file list` row uses. One shared pure formatter serves both commands.
- A row is fixed tokens in this order, separated by single spaces: type word, rwx permission string, byte size, ISO UTC mtime, then the name, for example `file -rw-r--r-- 1234 2026-11-19T13:50:00Z notes.md`. The mtime is the standard library `Date(...).toISOString()` applied to the `modified` value of a `RowStat`. The type word and rwx string are a few lines of bit checks on `mode`. Do not humanize sizes, pad columns, or use a locale-sensitive date, and do not add a helper layer around the bit checks.
- `file list` asks the tab's filesystem port for a sorted directory listing and the stat rows of those entries, filters entry names through `isSecretPath` before rendering, and prints one row per entry. The local port already sorts through `readDirSortedStrict` at `src/file-navigator/filesystem-port.ts:132`; do not sort again. `isSecretPath` at `src/file-read/policy.ts:24` denies only `.env`, `.env.*`, and the `SECRET_DENY_PATHS` segment runs, which is exactly why dotfiles and `node_modules` stay visible and no hidden-file skipping is adopted. An empty directory prints `(empty directory)`. If `statRows` returns `null` for an entry (it vanished between the listing and the stat), render it through the same formatter with a zero-valued `RowStat` (`size: 0`, `modified: 0`, `mode: 0`) so the row shape stays fixed; keep this identical locally and remotely.
- The new commands share a one-word result vocabulary instead of the older commands' verbose refusal lines: `missing` for an absent path, `forbidden` for a path outside the workspace or a secret file, and `notdir` when `file list` is pointed at a file. These are normal answers, not error lines. Translate `FilePolicyFailure` as follows: `File not found` becomes `missing`; `Is a directory` becomes `notdir`; `Outside the workspace` and `Secret file` become `forbidden`. `Not a text file` and `File too large (>5 MB)` keep their existing verbose lines, since they describe the file rather than an access decision and the one-word set does not cover them. Put this translation in one pure helper module that subplans 2 and 3 also use. The union at `src/file-read/policy.ts:11` also contains `Protected file`, but `checkProtectedPath` at `src/file-read/policy.ts:90` is mutation-only and the reader never calls it (see the comment at lines 88-89), so no read-only command here can produce it; do not add a fourth one-word token for it.
- A local tab resolves a path against its workspace directory, or the launch/project directory when it has none. Reuse `localReadRoot` in `src/file-read/tab-read.ts` (the `tab?.workspaceDir ?? managers.tab.launchDir` rule) rather than writing another root resolver.
- Each subcommand follows the existing per-subcommand shape: a pure parser checks the literal `file <subcommand>` prefix and scans arguments into a typed value or a usage error, and a tab executor takes `Managers`, the tab label, and the raw line, resolves the root, and returns the output string the dispatcher will append. Malformed arguments print one canonical usage line: `Usage: file list <path>` (also for `ls`) and `Usage: file stat <path>`.

## What already exists (reuse, don't rebuild)

| Piece | Where |
| --- | --- |
| `FileSystemPort.readDirectory` / `statRows` | `src/file-navigator/filesystem-port.ts` (`readDirectory` near line 73, `statRows` near line 74, local implementations near 130-135) |
| `RowStat` (`size`, `modified`, `mode`) | `src/file-navigator/stats.ts:6`; `readRowStat` at `src/file-navigator/stats.ts:17` |
| Secret rule and failure union | `isSecretPath` at `src/file-read/policy.ts:24`; `FilePolicyFailure` at `src/file-read/policy.ts:11` |
| Local root rule | `localReadRoot` at `src/file-read/tab-read.ts:7` |
| Parser and executor precedent | `src/file-read/command.ts` (`parseFileRead`, `FILE_READ_USAGE`, `isFileReadCommandLine`) and `src/file-read/tab-read.ts` (`readFileInTab`) |
| Sibling feature-module layout | `src/file-read/`, `src/file-glob/`, `src/file-grep/` |

## Proposed changes

- Add `src/file-list/` with a pure parser (`file list` / `file ls`, a single path argument, the canonical usage error) and a tab executor that resolves the local root, calls the port's `readDirectory` and `statRows`, filters secret names, and renders one row per entry or `(empty directory)`.
- Add `src/file-stat/` with a pure parser and a tab executor that resolves one `RowStat` for the path and renders it through the shared formatter; a directory target renders normally.
- Add one shared pure row-formatting module used by both executors, and by the far side in subplan 5. It owns the fixed-token row layout, the `Date(...).toISOString()` mtime, and the `mode` bit checks.
- Add the pure one-word failure translation helper described above and use it in both executors.

## Tests

- Colocated parser tests beside each new module, following `src/file-read/command.test.ts` and `src/file-glob/command.test.ts`: valid `list` and `ls` forms, valid `stat` forms, missing and repeated arguments, and the exact usage line in each case.
- A formatter test: fixed-token row order, ISO UTC mtime, rwx and type words for representative `mode` values, and no size humanization or column padding.
- Executor tests with a temporary directory for the local root: rows for a mixed directory, secret names filtered out, dotfiles and `node_modules` present, `(empty directory)`, `stat` on a file and on a directory, `notdir` when `list` targets a file, `missing` for an absent path, `forbidden` for an out-of-workspace path and a secret path, and the root choice for a tab with a workspace and one without.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after the source changes and again after the tests. No dispatcher entry exists until subplan 7, so verify parsers and executors through their colocated tests here.

## Out of scope

Remote tabs and the five remote operations (subplans 4-6); `file exists`, `file head`, and `file tail` (subplans 2-3); the ordered dispatcher chain and completion (subplan 7); native command vocabulary, settings rows, roles, primers, the agent gate, and the workspace runner (subplan 8); help, specs, and the manual end-to-end pass (subplan 9).
