# Supplement file command with additional sub commands — 3: local `file head` and `file tail`

**Complexity: 5/10** — ~120 added lines across 1 new module and `read.ts`, 10 requirements, 15 scenarios (p=5.66)

Decomposed from `./product/plans/complete/supplement-file-command-with-additional-sub-commands.md`, the authoritative feature scope. This is subplan 3 of 9. It depends on subplan 1 (`./product/plans/ready/supplement-file-command-with-additional-sub-commands-1-list-stat-local.md`) for the one-word failure helper used by the directory case; subplan 4 mirrors the numbering in the `head-lines` and `tail-lines` remote operations.

## Goal

Make `file head <path> [-n <lines>]` and `file tail <path> [-n <lines>]` print the first or last N numbered lines of a file on a local tab, with `file read`'s numbering and truncation rules rather than the one-word vocabulary. No remote channel behavior, dispatcher wiring, completion, native command registration, or docs are part of this subplan.

## Design decisions

- `head` and `tail` are one operation with two directions. One pure parser recognizes both spellings, scans the path and the optional count, and both directions use one tab executor parameterized by direction. The alias pair here is `head`/`tail`, distinct from the `list`/`ls` pair of subplan 1.
- The count follows the path on a single-dash `-n` flag, as written in the backlog. It is optional and defaults to 10. Validate it with `positiveInteger` at `src/positive-integer.ts:1` plus a 2000 upper bound. A missing path, a repeated `-n`, a non-numeric or non-positive count (`-n 0`, a negative number), or a count above 2000 prints the command's canonical usage line: `Usage: file head <path> [-n <lines>]` and `Usage: file tail <path> [-n <lines>]`, each naming its own subcommand.
- Both directions print numbered lines exactly as `file read` does, through `formatFileLines` at `src/file-read/format.ts:20`. Head numbers from line 1 by calling `readWorkspaceLines` at `src/file-read/read.ts:39` with offset 1 and limit N. Tail reads the file once, counts its lines, and numbers the last N with their true absolute positions by calling `formatFileLines` with `offset = total - N + 1` and `limit = N`. Because N is at most 2000, this reuses the existing numbering, per-line truncation, and `(empty file)` rules without hitting the read cap. `readWorkspaceLines` cannot supply that full text (it caps at `FILE_READ_MAX_LIMIT`, `src/file-read/command.ts:9`), so extend `src/file-read/read.ts` with a function that returns the whole decoded file after the same `checkLexicalPath`, `canonicalPath`, `checkRealTarget`, `classifyStats`, size-cap, and UTF-8 decode path that `readWorkspaceLines` uses, and call it from tail. Do not duplicate those checks in the new module.
- An empty file prints `(empty file)`. A count larger than the file prints every line. `head` and `tail` keep `file read`'s verbose failure lines (`Not a text file`, `File too large (>5 MB)`, an out-of-workspace or missing path) rather than the one-word vocabulary. `classifyStats` at `src/file-read/policy.ts:94` would produce a verbose `Is a directory` line from `readWorkspaceLines`, so before the read, use `readRowStat` at `src/file-navigator/stats.ts:17` and its `mode` bits (`S_IFDIR`) to detect a directory target and return `notdir` through the one-word helper from subplan 1. That is the only case where these two commands use the one-word vocabulary.
- A local tab resolves the path against its workspace directory, or the launch/project directory when it has none, using `localReadRoot` at `src/file-read/tab-read.ts:7`. The executor returns the output string the dispatcher will append.

## What already exists (reuse, don't rebuild)

| Piece | Where |
| --- | --- |
| `readWorkspaceLines` | `src/file-read/read.ts:39` (policy checks, size cap, UTF-8 decode, numbered-line formatting); this subplan extends the same module with a full-text read for tail |
| `readRowStat` | `src/file-navigator/stats.ts:17` (directory detection for `notdir`) |
| `formatFileLines` | `src/file-read/format.ts:20` (`offset`, `limit`, absolute line numbers, `(empty file)`, 2000-char line truncation) |
| `positiveInteger` | `src/positive-integer.ts:1` |
| `FILE_READ_MAX_LIMIT` and `FileReadArgs` | `src/file-read/command.ts:3-9` |
| Local root rule | `localReadRoot` at `src/file-read/tab-read.ts:7` |
| One-word failure helper | introduced by subplan 1 |
| Parser and executor precedent | `src/file-read/command.ts` and `src/file-read/tab-read.ts` |

## Proposed changes

- Add `src/file-head-tail/` with a pure parser for `file head` and `file tail` and one tab executor parameterized by direction. The parser returns the path and the resolved count (default 10) or a canonical usage error; the executor resolves the local root and returns the rendered lines.
- Implement head through `readWorkspaceLines` with limit N. Implement tail with a single read of the whole file, a line count, and a call to `formatFileLines` with `offset = total - N + 1` and `limit = N`; keep `file read`'s policy and decode behavior on that path.
- Use the one-word helper from subplan 1 only for the directory case (`notdir`).

## Tests

- Colocated parser tests beside the new module, following `src/file-read/command.test.ts`: valid `head` and `tail` forms with and without `-n`, the default of 10, a missing path, a repeated `-n`, `-n 0`, a negative count, a non-numeric count, a count above 2000, and the exact usage line for each subcommand.
- Executor tests with a temporary directory for the local root: head from line 1, tail with absolute line numbers on a file longer than the requested count, an empty file printing `(empty file)`, a count larger than the file printing every line, a directory target printing `notdir`, an absent or out-of-workspace path printing `file read`'s verbose line, the root choice for a tab with a workspace and one without, and a check that head and tail use the same numbering as `file read`.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after the source changes and again after the tests. The dispatcher entry arrives in subplan 7, so exercise the parser and executor through colocated tests here.

## Out of scope

Remote tabs and the `head-lines` / `tail-lines` operations (subplans 4-6); `file list`, `file stat`, and `file exists` (subplans 1-2); the dispatcher chain and completion (subplan 7); native command registration and agent integration (subplan 8); help, specs, and manual end-to-end checks (subplan 9). The `-n` flag uses a single dash as specified; do not add `file read`'s `--offset` / `--limit` surface to these commands.
