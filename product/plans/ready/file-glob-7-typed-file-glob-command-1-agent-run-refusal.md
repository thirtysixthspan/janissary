# File glob 7.1 — refuse `file glob` in agent runs

**Complexity: 2/10** — ~2 added lines in 1 edited file, 3 requirements, 6 test scenarios (p=3.81)

Run order: piece 1 of 2 of file glob subplan 7, which is 7 of 9 in the file glob series. Subplan 7 is recorded whole in `product/plans/complete/file-glob-7-typed-file-glob-command.md`; the feature's canonical plan is `product/plans/complete/file-glob.md`. Depends on subplan 1 (`isFileGlobCommandLine` in `src/file-glob/command.ts`, already landed). Piece 2 (`product/plans/draft/file-glob-7-typed-file-glob-command-2-typed-entry-help-and-spec.md`) depends on this piece.

This piece closes the one path by which an `agent` run could reach `file glob`, before any change makes a `file glob` line dispatchable. Today `gateAgentCommand` passes a `janissary file glob …` line as `runsOn: 'caller'`, because it is neither a mutation nor a read line, and `runGrantedAgentCommand` in `src/agent/command-tools.ts` would then dispatch it to the caller's `file` command. While `file glob` is not routed, a run granted `file` gets only the read usage line back (`src/commands/file.ts` sends every non-mutation line to `readFileInTab`, whose `parseFileRead` rejects a `glob` subcommand with `FILE_READ_USAGE`) and an ungranted run is refused by `runGrantedAgentCommand`'s grant check, but once piece 2 routes it the glob would run in the caller's directory instead of the execution workspace. Landing the refusal first means no commit ever has a routable `file glob` that an agent run can reach on the caller side.

## Design decisions

From the source plan:

- Agent runs are not supported in this version. `gateAgentCommand` in `src/acp/tool-table.ts` refuses `isFileGlobCommandLine` input with `Agent: command not permitted: <command>.`, with or without the `file` grant, the way `file write` and `file edit` are refused, so an agent run's glob never falls through to the caller side.
- The third `runWorkspace`, in `src/agent/execute.ts`, is left alone.

Subplan decisions carried by this piece:

- `runGrantedAgentCommand` in `src/agent/command-tools.ts` is left unchanged. Every agent command reaches it only through `gatedRunner` in `src/acp/drive-loop.ts` (`gateCommand` first, `host.runCaller` only when there is no refusal), and the remote agent loop in `src/remote/serve-acp-loop.ts` drives the same `driveToolLoop`, so the one gate covers local and remote agent runs.
- The refusal uses the same normalized `input` the mutation check uses (trimmed, leading `/` removed) and the same refusal text naming the original `command` as given, and it runs before the read check.
- The refusal returns `{ refusal }` with no `refused` key, like the existing mutation refusal; `refused: 'disabled'` belongs to the core gate only.
- Only `isFileGlobCommandLine` lines are refused (`/^file\s+glob(\s|$)/i`), so bare `file glob` with no pattern is refused too, while `file globs x` is not a glob line and keeps today's `runsOn: 'caller'` result, the way `file writer x` does beside the mutation refusal.
- Nothing else in `src/acp/tool-table.ts` changes in this piece: the `file` tool's `isCommandLine`, `filePrimer`, and `gateCoreCommand` are subplan 8.

## What already exists (reuse, don't rebuild)

| Piece | Where | Use |
| --- | --- | --- |
| `isFileGlobCommandLine` | `src/file-glob/command.ts:100` | The line test for the gate. Its boundary cases are already unit-tested in `src/file-glob/command.test.ts` (`describe('isFileGlobCommandLine'`). The module imports only `../positive-integer.js`, so importing it keeps the table free of managers, as the comment above `AcpTool` requires. |
| `gateAgentCommand` | `src/acp/tool-table.ts:126`, the line beginning `if (isFileMutationCommandLine(input)) return { refusal:` | The existing mutation refusal to extend. |
| The agent-gate block of `src/acp/tool-table.test.ts` (inside `describe('gateCommand'`: the `agent(...)` snapshot helper and the test `'refuses agent file mutations when %s'`) | tests | Pattern for the new assertions. |

## Proposed changes

- `src/acp/tool-table.ts`: in `gateAgentCommand`, widen the existing mutation condition to `isFileMutationCommandLine(input) || isFileGlobCommandLine(input)` on the same line, keeping the existing refusal text `Agent: command not permitted: ${command}.` and its position before the read check. Add the import of `isFileGlobCommandLine` from `../file-glob/command.js` beside the existing `../file-read/command.js` and `../file-write/command.js` imports. The file is 140 raw lines and 120 lint-counted lines today and grows by about one line, far under the 200-line `max-lines` limit, so no extraction is needed.
- `src/agent/command-tools.ts`, `src/acp/drive-loop.ts`, `src/agent/execute.ts`, `src/acp/run-prompt.ts`, and `src/remote/serve-acp-loop.ts` are not edited.
- `product/specs/agent-command.md`: in both the local paragraph (the one beginning `A local run granted \`file\` can request`) and the remote paragraph (the one containing `A remote run granted \`file\` runs \`janissary file read <path>\``), after the sentence about `janissary file write …` and `janissary file edit …`, add the same sentence to each: ``Likewise, `janissary file glob …` returns `Agent: command not permitted: <command>.` in this version, with or without the grant.`` Change nothing else in the spec.

## Tests

`src/acp/tool-table.test.ts`, in the agent-gate block. Add one new test after `'refuses agent file mutations when %s'`, shaped like it: the same `it.each` over `['granted', ['file']]` and `['ungranted', []]`, looping over commands and asserting with `toStrictEqual` so a stray `refused` key fails.

- `file glob **/*`, bare `file glob`, `FILE GLOB x`, and `/file glob x` are each refused with grants `['file']` and with none, the refusal naming the command as given (for example `Agent: command not permitted: /file glob x.`).

In the existing test `'keeps file read and non-mutation routing beside the mutation refusal'`, add one assertion:

- `file globs x` with grants `['file']` still returns `{ runsOn: 'caller' }`.

`file read a.md` routing to the workspace with the grant is already asserted by `'runs a granted agent file read on the workspace'` and by that same test; leave those unchanged. No existing test asserts that a `file glob` line routes to the caller (none in `src/acp/tool-table.test.ts` or `src/agent/command-tools.test.ts`), so no existing expectation changes, and `src/agent/command-tools.test.ts` and `src/agent/execute.test.ts` are not edited.

## Verification

- `$janissary/scripts/run.mjs check-diff` (lint, typecheck, and the server tests covering `src/acp/tool-table.test.ts`).
- Manual: there is no meaningful end-to-end check before piece 2, because an unrefused `file glob` still only prints the read usage line today. Confirm instead that `product/specs/agent-command.md` carries the new sentence in both paragraphs and that `git diff` touches only `src/acp/tool-table.ts`, `src/acp/tool-table.test.ts`, and that spec.

## Out of scope

The typed `file glob` entry, its routing and samples in `src/commands/file.ts`, the `tab-read.ts` exports, `help/file.md`, `help/commands.md`, and the `### File glob` section of `product/specs/acp.md` are piece 2. The ACP vocabulary, role grants, tool table primer and extraction, and the loop `runWorkspace` branches are subplan 8; completion is subplan 9. `file glob` for `agent` runs is out of scope for the whole feature.
