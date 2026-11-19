# Supplement file command with additional sub commands — 7: dispatcher and completion

**Complexity: 5/10** — ~60 added lines across 2 files, 10 requirements, 12 scenarios (p=5.58)

Decomposed from `./product/plans/complete/supplement-file-command-with-additional-sub-commands.md`, the authoritative feature scope. This is subplan 7 of 9. It depends on subplans 1-3 (`./product/plans/ready/supplement-file-command-with-additional-sub-commands-1-list-stat-local.md`, `...-2-exists-local.md`, `...-3-head-tail-local.md`) for the parsers and executors and on subplan 6 (`./product/plans/ready/supplement-file-command-with-additional-sub-commands-6-remote-port-and-executors.md`) so a typed command is fully working on both tab kinds when it becomes reachable. Subplan 8 adds native command grants and agent integration.

## Goal

Make the four new commands reachable from the typed `file` command line and completable in the command bar, with the same ordered-dispatch and enabled-policy behavior as the existing file subcommands. Native command registration and agent behavior are out of scope here.

## Design decisions

- `fileOutput` in `src/commands/file.ts:12-17` checks one `isFile…CommandLine` predicate per subcommand in a fixed order and falls through to `readFileInTab`. Add the new predicates as siblings in that chain, after the existing glob, grep, and mutation checks and immediately ahead of the `file read` fall-through, so their relative order is unchanged. Do not add branches ahead of the command registry.
- Use these exports from the modules of subplans 1-3: `isFileListCommandLine` (matching both `list` and `ls`) and `listFilesInTab`; `isFileStatCommandLine` and `statFileInTab`; `isFileExistsCommandLine` and `checkFileExistsInTab`; `isFileHeadCommandLine` / `isFileTailCommandLine` and `headOrTailFileInTab`. Each predicate recognizes only its own spelling; `ls` is recognized by the list predicate, not by a separate branch.
- The `list` and `ls` predicates both route to the `file list` executor, and `head` and `tail` each route to the shared executor with its direction. A lookalike subcommand that is not one of the new names must still fall through to `file read` and print its usage line.
- Add one `samples` entry per new operation to the `file` command declaration at `src/commands/file.ts:22-33`.
- Completion follows `src/completion/file-read.ts:8-45`. Add the new subcommand names, including the `ls` alias, to `FILE_SUBCOMMANDS` at line 8, and add a per-subcommand branch for each new argument shape. A path argument completes against `root` through `completeFilePath` exactly as `read` does; an undefined root (a remote tab) offers no paths. Subcommands disabled by `policy` are not offered, via `policy.allows(\`file ${word}\`)` at line 35. The `-n` count of `head` and `tail` takes no file candidates: when `preceding.at(-1)` is `-n`, return `unchanged(cursor)` just as the `--limit` value does at line 42.
- Each dispatched invocation still appends exactly one transcript entry with the exact typed input through `appendCommandOutput` in `src/commands/file.ts:36`.

## What already exists (reuse, don't rebuild)

| Piece | Where |
| --- | --- |
| Ordered `file` dispatcher and fall-through | `src/commands/file.ts:12-17` (`fileOutput`) |
| `samples` list | `src/commands/file.ts:22-33` |
| Transcript append | `appendCommandOutput` at `src/commands/file.ts:36` |
| Subcommand and path completion | `src/completion/file-read.ts:8-45` (`FILE_SUBCOMMANDS`, `completeFileReadCommand`, `completeFilePath`) |
| Completion policy | `src/completion/command-policy.ts` (`policy.allows`) |
| Parser predicates and executors | from subplans 1-3: `isFileListCommandLine` / `listFilesInTab`, `isFileStatCommandLine` / `statFileInTab`, `isFileExistsCommandLine` / `checkFileExistsInTab`, `isFileHeadCommandLine` / `isFileTailCommandLine` / `headOrTailFileInTab` |

## Proposed changes

- Import the new predicates and executors in `src/commands/file.ts` and add their branches to `fileOutput` before the read fall-through. Extend `samples`.
- Extend `FILE_SUBCOMMANDS` and the per-subcommand argument branches in `src/completion/file-read.ts`, including the `ls` alias and the `-n` count rule.

## Tests

- Extend `src/commands/file.test.ts`: each new predicate matches its own line and its alias, a lookalike subcommand falls through to the `file read` usage line, and each command appends one transcript entry containing the exact typed input.
- Extend `src/completion/file-read.test.ts`: each new subcommand appears only when enabled by policy, `ls` completes alongside `list`, path completion follows each new argument shape, an undefined root offers no paths, and a `-n` value gets no file candidates.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after the source changes and again after the tests. By hand in a tab, type each new command and its alias on a local tab to confirm the dispatcher reaches the right executor; native command grants arrive in subplan 8 and the full manual matrix in subplan 9.

## Out of scope

Native command vocabulary, settings rows, role grants, primers, the agent gate, and the workspace runner (subplan 8); remote protocol and executors (subplans 4-6); help, specs, and the full manual matrix (subplan 9). Do not change the behavior of `file read`, `glob`, `grep`, `write`, `edit`, or `patch` beyond adding siblings to the dispatcher.
