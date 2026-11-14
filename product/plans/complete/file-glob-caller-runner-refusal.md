# Refuse file glob on the agent run's caller-side runner

**Complexity: 2/10** — ~2 added production lines in 1 edited file, 2 requirements, 4 test scenarios (p=3.48)

`gateAgentCommand` in `src/acp/tool-table.ts` refuses an agent run's `file glob` line before it is routed, so the honest path never reaches the caller. The caller-side runner, `runGrantedAgentCommand` in `src/agent/command-tools.ts`, refuses only mutation lines. A remote far side sends caller commands back as `acp-tool-request` messages, and the local runner executes those through `runGrantedAgentCommand` without re-running the gate. A modified or misbehaving far side could therefore send `file glob **/*` and, with the `file` grant, have it dispatched in the caller tab, listing the caller's local file names.

## Goal

`runGrantedAgentCommand` refuses every `file glob` line, with or without the `file` grant, the same way it already refuses `file write` and `file edit`, so an agent's glob never falls through to the caller's directory even when the gate is skipped.

## Approach

1. **`src/agent/command-tools.ts`.** Import `isFileGlobCommandLine` from `../file-glob/command.js` and extend the existing early refusal so it returns `Agent: command not permitted: <command>.` when the slash-stripped, trimmed input is a mutation line or a glob line. The refusal names the command as given, matching the mutation refusal and `gateAgentCommand`.

## Tests

- `src/agent/command-tools.test.ts`: beside the mutation-refusal test, `file glob **/*`, bare `file glob`, and `/file glob x` are refused with the `file` grant and without it, and nothing is dispatched; `file read a.md` with the `file` grant still dispatches; `file globs x` is not a glob line and is not caught by this refusal (it falls to the existing grant check).

## Docs and specs

- `product/plans/complete/file-glob.md`: the agent-runs decision no longer says `runGrantedAgentCommand` is unchanged; it says the caller-side runner refuses glob lines too, as defense in depth.
- `product/specs/agent-command.md`: already states the glob refusal without naming a component; add that a glob line arriving on the caller side from a remote run is refused as well.

## Out of scope

- The `runWorkspace` path in `src/agent/execute.ts` and `gateAgentCommand` itself, which already refuse the glob.
- The second backlog entry (git-ignored lookup under a linked `--path`).
