# Hosted write tool 3 — keep autonomous agent `file` grants read-only

**Complexity: 3/10** — ~10 added lines across 2 files, 3 requirements, 11 scenarios (p=4.46).

Source plan: `./product/plans/complete/janissary-hosted-agent-write-tool.md`. Run order: 3 of 15 in the hosted write tool series. Depends on plan 2b (`./product/plans/complete/janissary-hosted-agent-write-tool-2b-recognition-and-primer.md`, already landed on this branch) for `isFileMutationCommandLine` in `src/file-write/command.ts`. No other dependency; plans 4–15 do not need to land first.

An autonomous `agent` run is granted whole canonical commands, and a skill that grants `file` today gets `file read` only because `file read` is the only form that exists. Once plan 11 makes `file write` and `file edit` real typed commands, that same grant would quietly widen to writes. This plan closes the gap first, so no later subplan ever ships a window where it is open.

## Goal

Both autonomous agent paths refuse `file write` and `file edit` with the existing `Agent: command not permitted: <command>.` result, whether or not the run holds the `file` grant, while `file read` and every other granted command behave as before.

## Design decisions and dependencies

- Source plan decision: keep the autonomous `agent` command's grant model unchanged in this version and explicitly refuse write/edit forms in both agent paths. This is a refusal boundary, not autonomous write integration or a new grant model.
- Path one is the private `gateAgentCommand` in `src/acp/tool-table.ts`, reached through the exported `gateCommand`, whose only production caller is `gatedRunner` in `src/acp/drive-loop.ts`. Today its line `if (!isFileReadCommandLine(input)) return { runsOn: 'caller' };` routes every non-read command to the caller. It must return a refusal decision for a mutation line before that line: `refusal` set to `Agent: command not permitted: <command>.` and no `refused` field, the same shape as its existing no-grant refusal. `gatedRunner` already turns a refusal decision into the tool result without calling `runCaller` or `runWorkspace`, so `drive-loop.ts` does not change. Every loop host (`src/agent/execute.ts`, `src/acp/run-prompt.ts`, `src/remote/serve-acp-loop.ts`, `src/remote/acp-session.ts`, `src/remote/acp-session-run.ts`) goes through `driveToolLoop`, so this one check covers local and remote-hosted agent loops.
- Path two is `runGrantedAgentCommand` in `src/agent/command-tools.ts`, called from the `runCaller` handler in `src/agent/execute.ts`. It resolves the registered command with `commands.find((candidate) => candidate.match(input))` and dispatches through `managers.command.dispatchLineInInvocation`. It must return `Agent: command not permitted: <command>.` for a mutation form immediately after computing `input`, before the `commands.find` lookup. This is defense in depth: with path one in place the gate never routes a mutation here, but the runner must not rely on that.
- Recognition is `isFileMutationCommandLine(input)` from `src/file-write/command.ts`, applied to `input`, the existing `command.trim().replace(/^\//, '')` in both functions. The predicate is prefix-only and case-insensitive (`/^file\s+write(\s|$)/i`, likewise `edit`), so a malformed `file edit {` and a bare `file write` are refused too, while `file writer x` is not a mutation and keeps its current caller routing. Do not call `parseFileMutation` here.
- The refusal text echoes `command` as received (untrimmed, with any leading `/`), matching both functions' existing refusals.
- Import from `../file-write/command.js` in both files (NodeNext `.js` extension). Both files stay far under the 200-line limit (131 and 35 lines today).

## What already exists (reuse, don't rebuild)

| Existing code | Use |
| --- | --- |
| `src/acp/tool-table.ts` `gateAgentCommand` | Existing read routing and refusal wording |
| `src/agent/command-tools.ts` `runGrantedAgentCommand` | Existing grant check and refusal wording |
| `src/acp/drive-loop.ts` `gatedRunner` | Already converts a gate refusal into tool output; unchanged |
| `src/agent/execute.ts` local agent host | Its `runWorkspace` keeps reading through `readWorkspaceCommand`; unchanged |
| `isFileMutationCommandLine` in `src/file-write/command.ts` (plan 2b) | Identifies write/edit forms |

## Proposed changes

1. In `gateAgentCommand`, check for a mutation line before the existing `isFileReadCommandLine` check and return the refusal decision.
2. In `runGrantedAgentCommand`, check for a mutation form before resolving the registered command and return the refusal string. No other agent behavior changes; `agentPrimer` is not changed.
3. Update `product/specs/agent-command.md` beside the existing local `file read` paragraph ("A local run granted `file` can request `janissary file read <path>`…"): a run granted `file` still reads only; `janissary file write …` and `janissary file edit …` return `Agent: command not permitted: <command>.` in this version, with or without the grant. Add the same sentence after the remote `file read` sentence in the remote-host paragraph.

## Tests

- `src/acp/tool-table.test.ts`, alongside the existing agent cases in `describe('gateCommand')` that use the `agent()` helper: an agent snapshot with and without the `file` grant refuses, asserted with `toStrictEqual` on the full refusal decision, `file write {…}`, `file edit {…}`, `/file write {…}` (refusal echoes the slash), `FILE WRITE {…}`, and malformed `file edit {`; `file read a.md` still routes to the workspace with the grant and is refused without it; a non-file command and `file writer x` still route to the caller.
- `src/agent/command-tools.test.ts`: with a snapshot granting `file` and a `vi.fn()` `dispatchLineInInvocation` (as in the existing `denies ungranted commands before invoking the canonical dispatcher` case), write and edit forms return the refusal and never call `dispatchLineInInvocation`; `file read` still dispatches.
- Keep `src/agent/execute.test.ts` and `src/remote/serve-acp-loop.test.ts` agent cases green.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after each step. A manual end-to-end check is not possible yet because no `file write`/`file edit` command exists until plan 11; the unit tests above are the verification here, and plan 15 covers end-to-end.

## Out of scope

- Any autonomous write integration or change to agent grants, skill sidecars, snapshots, or the agent primer.
- Core `ask`/`tell` tool behavior (plans 12 and 13).
