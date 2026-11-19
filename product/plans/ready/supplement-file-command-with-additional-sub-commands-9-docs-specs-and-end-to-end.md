# Supplement file command with additional sub commands — 9: docs, specs, and end-to-end verification

**Complexity: 2/10** — 5 documentation requirements and 8 verification scenarios, no production code (p=3.65)

Decomposed from `./product/plans/complete/supplement-file-command-with-additional-sub-commands.md`, the authoritative feature scope. This is subplan 9 of 8. It depends on subplans 1-8 (`./product/plans/ready/supplement-file-command-with-additional-sub-commands-1-list-stat-local.md` through `...-8-native-commands-and-agent-integration.md`) and is the final integration and verification slice. No new production code belongs here.

## Goal

Bring the user-facing command reference and the behavior specs in line with the delivered `file` surface, then run the full verification matrix across local, no-workspace, remote, and agent tool paths. This is the point where all earlier subplans meet, so it closes coverage rather than leaving documentation or manual checks as implied cleanup.

## Design decisions

- Update `help/file.md` with all four new commands and their aliases: `file list <path>` / `file ls <path>`, `file stat <path>`, `file exists <path>`, `file head <path> [-n <lines>]` and `file tail <path> [-n <lines>]`. State the exact usage lines and the one-word answers, including `(empty directory)`, `(empty file)`, the type words, `missing`, `forbidden`, and `notdir`, the `-n` default of 10 and 2000 bound, that `file ls` prints the `list` usage line, and that `file stat` works on files and directories.
- Update the `file` row's description in `help/commands.md` (currently at line 21) to mention the new subcommands, and keep the Commands table alphabetical: a row's sort key is the first word inside its first backticks, compared without regard to case. `src/commands.test.ts` reads the table through `help commands` (its table check is around lines 104-125) and fails on an out-of-order row or a missing command page. Do not rename any command.
- Update the behavior specs whose surface changed: `product/specs/acp.md` (file tool predicates, primer, and the agent-run refusal), `product/specs/tab-completion.md` (new subcommands and their argument shapes), `product/specs/application-commands.md` (new native command names and settings rows), `product/specs/roles.md` (`ask` and `tell` grant all four by default), and `product/specs/agent-command.md` (the four commands are refused in an agent run while `file read` remains runnable). Specs state observable behavior and exact messages, not implementation detail; cross-reference related specs with `[[name]]` links as the house style does.
- The built-in roles grant all four by default, so both the typed command reference and the agent primer describe them. Keep the docs and the primers from subplan 8 consistent.

## What already exists (reuse, don't rebuild)

| Piece | Where |
| --- | --- |
| Command reference | `help/file.md` (191 lines), `help/commands.md` (84 lines) |
| Behavior specs | `product/specs/acp.md`, `product/specs/tab-completion.md`, `product/specs/application-commands.md`, `product/specs/roles.md`, `product/specs/agent-command.md` |
| Table-order test | `src/commands.test.ts` reads the Commands table through `help commands` |
| Diff-scoped check | `$janissary/scripts/run.mjs check-diff` |

## Proposed changes

- Edit only the help pages and spec files listed above; record the exact wording, usage lines, and edge cases the earlier subplans implemented. No production code changes in this subplan.

## Tests

- Run `src/commands.test.ts` to confirm the Commands table is still alphabetical and every command has a matching help page.

## Verification

- Run `$janissary/scripts/run.mjs check-diff` after the doc changes and confirm it is clean, then run it once more against the complete feature state (source changes plus all tests) and confirm it is clean again.
- By hand in a tab, run each new command and its alias on a local tab with a workspace, on a local tab without one, and on a remote tab. Confirm the output matches the agreed wording, `-n` counts work, a missing path and a path outside the root print the expected refusal, a directory target prints `notdir`, and the agent tool forms answer the same way. Check both `ask` and `tell` sessions grant the commands and that an autonomous agent run refuses them.

## Out of scope

Any further behavior change, new command, or code change. Out of scope for the whole feature, per the source plan: no subcommands beyond the four named (no `file cp`, `mv`, `rm`, or other mutations), no behavior change to the existing `file` subcommands beyond adding dispatcher siblings, no web UI beyond the existing command bar and transcript, and no change to how role grants are stored or edited beyond listing the new native names.
