# File glob 7.1 — refuse `file glob` in agent runs

**Complexity: 2/10** — ~3 added lines in 1 edited file, 3 requirements, 4 test scenarios (p=3.75)

Run order: piece 1 of 2 of file glob subplan 7, which is 7 of 9 in the file glob series. Subplan 7 is recorded whole in `product/plans/complete/file-glob-7-typed-file-glob-command.md`; the feature's canonical plan is `product/plans/complete/file-glob.md`. Depends on subplan 1 (`isFileGlobCommandLine` in `src/file-glob/command.ts`, already landed). Piece 2 (`product/plans/draft/file-glob-7-typed-file-glob-command-2-typed-entry-help-and-spec.md`) depends on this piece.

This piece closes the one path by which an `agent` run could reach `file glob`, before any change makes a `file glob` line dispatchable. Today `gateAgentCommand` passes a `janissary file glob …` line as `runsOn: 'caller'`, because it is neither a mutation nor a read line, and `runGrantedAgentCommand` in `src/agent/command-tools.ts` would then dispatch it to the caller's `file` command. While `file glob` is not routed, that only prints the read usage line, but once piece 2 routes it the glob would run in the caller's directory instead of the execution workspace. Landing the refusal first means no commit ever has a routable `file glob` that an agent run can reach on the caller side.

## Design decisions

From the source plan:

- Agent runs are not supported in this version. `gateAgentCommand` in `src/acp/tool-table.ts` refuses `isFileGlobCommandLine` input with `Agent: command not permitted: <command>.`, with or without the `file` grant, the way `file write` and `file edit` are refused, so an agent run's glob never falls through to the caller side.
- The third `runWorkspace`, in `src/agent/execute.ts`, is left alone.

Subplan decisions carried by this piece:

- `runGrantedAgentCommand` in `src/agent/command-tools.ts` is left unchanged. Every agent command reaches it only through `gatedRunner` in `src/acp/drive-loop.ts` (`gateCommand` first, `host.runCaller` only when there is no refusal), and the remote agent loop in `src/remote/serve-acp-loop.ts` drives the same `driveToolLoop`, so the one gate covers local and remote agent runs.
- The refusal uses the same normalized `input` the mutation check uses (trimmed, leading `/` removed) and the same refusal text naming the original `command` as given, and it runs before the read check.

## What already exists (reuse, don't rebuild)

| Piece | Where | Use |
| --- | --- | --- |
| `isFileGlobCommandLine` | `src/file-glob/command.ts` | The line test for the gate. |
| `gateAgentCommand` | `src/acp/tool-table.ts` | The existing mutation refusal to extend. |
| The agent-gate block of `src/acp/tool-table.test.ts` (`agent(...)` snapshot helper) | tests | Pattern for the new assertions. |

## Proposed changes

- `src/acp/tool-table.ts`: in `gateAgentCommand`, refuse when `isFileMutationCommandLine(input) || isFileGlobCommandLine(input)`, keeping the existing refusal text `Agent: command not permitted: ${command}.` and its position before the read check. Import `isFileGlobCommandLine` from `../file-glob/command.js`. The file stays at about 141 lines.
- `product/specs/agent-command.md`: in both the local paragraph (the one beginning `A local run granted \`file\` can request`) and the remote paragraph (the one containing `A remote run granted \`file\` runs \`janissary file read <path>\``), after the sentence about `janissary file write …` and `janissary file edit …`, add that `janissary file glob …` also returns `Agent: command not permitted: <command>.` in this version, with or without the grant.

## Tests

`src/acp/tool-table.test.ts`, in the agent-gate block:

- `file glob **/*` is refused with `Agent: command not permitted: file glob **/*.` with grants `['file']` and with none.
- `FILE GLOB x` and `/file glob x` are refused, the refusal naming the command as given.
- `file read a.md` still routes to the workspace with the grant.

## Verification

- `$janissary/scripts/run.mjs check-diff`.

## Out of scope

The typed `file glob` entry, its routing and samples in `src/commands/file.ts`, the `tab-read.ts` exports, `help/file.md`, `help/commands.md`, and the `### File glob` section of `product/specs/acp.md` are piece 2. The ACP vocabulary, role grants, tool table primer and extraction, and the loop `runWorkspace` branches are subplan 8; completion is subplan 9. `file glob` for `agent` runs is out of scope for the whole feature.
