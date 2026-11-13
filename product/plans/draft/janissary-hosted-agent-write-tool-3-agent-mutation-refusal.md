# Hosted write tool 3 — keep autonomous agent `file` grants read-only

**Complexity: 3/10** — ~10 added lines across 2 files, 3 requirements, 8 scenarios (p=4.36).

Source plan: `./product/plans/complete/janissary-hosted-agent-write-tool.md`. Run order: 3 of 15 in the hosted write tool series. Depends on plan 2 (`janissary-hosted-agent-write-tool-2-mutation-parser.md`) for the mutation recognition predicate.

An autonomous `agent` run is granted whole canonical commands, and a skill that grants `file` today gets `file read` only because `file read` is the only form that exists. Once plan 11 makes `file write` and `file edit` real typed commands, that same grant would quietly widen to writes. This plan closes the gap first, so no later subplan ever ships a window where it is open.

## Goal

Both autonomous agent paths refuse `file write` and `file edit` with the existing `Agent: command not permitted: <command>.` result, whether or not the run holds the `file` grant, while `file read` and every other granted command behave as before.

## Design decisions and dependencies

- Source plan decision: keep the autonomous `agent` command's grant model unchanged in this version and explicitly refuse write/edit forms in both agent paths. This is a refusal boundary, not autonomous write integration or a new grant model.
- Path one is `gateAgentCommand` in `src/acp/tool-table.ts`, which today routes every non-read command to the caller. It must answer a mutation line with the refusal instead of routing it anywhere, so a remote-hosted agent loop (`src/remote/serve-acp-loop.ts` drives the same gate) never forwards a mutation to the caller either.
- Path two is `runGrantedAgentCommand` in `src/agent/command-tools.ts`, which resolves the registered `file` command and dispatches any input it matches. It must refuse mutation forms before dispatch. Defending both paths matters because the caller-side runner is also reached by commands the gate routed to the caller.
- Recognition uses the plan 2 predicate on the trimmed input with any leading `/` removed, the same normalization both functions already apply, so a malformed `file write {` is refused too rather than reaching the file command.
- The refusal text echoes the command as received, matching both functions' existing refusals.

## What already exists (reuse, don't rebuild)

| Existing code | Use |
| --- | --- |
| `src/acp/tool-table.ts` `gateAgentCommand` | Existing read routing and refusal wording |
| `src/agent/command-tools.ts` `runGrantedAgentCommand` | Existing grant check and refusal wording |
| `src/agent/execute.ts` local agent host | Its `runWorkspace` keeps reading through `readWorkspaceCommand`; unchanged |
| Plan 2 mutation recognition predicate in `src/file-write/command.ts` | Identifies write/edit forms |

## Proposed changes

In `gateAgentCommand`, check for a mutation line before the existing read check and return the refusal decision. In `runGrantedAgentCommand`, check for a mutation form before resolving the registered command and return the refusal string. No other agent behavior changes.

Update `product/specs/agent-command.md` beside the existing `file read` paragraph: a run granted `file` still reads only; `janissary file write …` and `janissary file edit …` return `Agent: command not permitted: <command>.` in this version, with or without the grant.

## Tests

- `src/acp/tool-table.test.ts`: an agent snapshot with and without the `file` grant refuses `file write {…}`, `file edit {…}`, `/file write {…}`, and malformed `file edit {`; `file read a.md` still routes to the workspace with the grant and is refused without it; a non-file command still routes to the caller.
- `src/agent/command-tools.test.ts`: with `file` granted, write and edit forms return the refusal and never call `dispatchLineInInvocation`; `file read` still dispatches.
- Keep `src/agent/execute.test.ts` and `src/remote/serve-acp-loop.test.ts` agent cases green.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

## Out of scope

- Any autonomous write integration or change to agent grants, skill sidecars, or snapshots.
- Core `ask`/`tell` tool behavior (plans 12 and 13).
