# ACP tool loop 7.3 — the agent run snapshot and its gate

**Complexity: 4/10** — ~25 added lines in 2 files, 7 requirements, 10 test scenarios (p=5.13)

Run order: piece 3 of 3 of subplan 7 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop-7-run-snapshot-and-gate.md` (decomposed from it; "Per-prompt snapshot", "Gate", agent kind; its decisions are authoritative). Canonical plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (decisions 2, 4, and 22). Depends on piece 7.2 (`product/plans/complete/move-janissarys-acp-tool-loop-7-run-snapshot-and-gate-2-core-snapshot-and-gate.md`, implemented) for `AcpRunSnapshot`, `AcpGateDecision`, `gateCommand`, and the private `gateCoreCommand`, and through it on piece 7.1 (`product/plans/complete/move-janissarys-acp-tool-loop-7-run-snapshot-and-gate-1-tool-sides.md`, implemented), which added `AcpTool.runsOn`. Both are already on this branch, so this piece can start immediately. Subplans 8 and 10–14 build on the finished gate; subplans 12 and 13 use this kind.

An agent run carries the agent's own skill grants rather than a role's native grants, and its only workspace command is `file read`. This piece adds the `agent` member to `AcpRunSnapshot` and teaches `gateCommand` to decide an agent command's side, completing the two-kind snapshot and gate the source plan describes. It stays additive: nothing in production reads the agent kind until subplan 13.

## Design decisions

- **The `agent` member** of `AcpRunSnapshot` in `src/acp/types.ts` (`kind: 'agent'`), plain JSON-safe data with `readonly` arrays like the `core` member: `grants` (`readonly string[]`, the run's skill grants, `AgentSnapshot.grants` in `src/agent/types.ts`, which hold command registry names such as `file`, `db`, `question`) and `askUser` (boolean: whether a selected skill is named `ask-user`, i.e. `AgentSnapshot.skills` has an entry with `name === 'ask-user'`). Exactly these three fields: no primer field, no role. `executeAgentRun` (`src/agent/execute.ts`, `taskPrompt(agentPrimer(run.snapshot), parameters)`) already puts `agentPrimer` into the prompt text, and the loop's own primer for an agent run is `MARKDOWN_INSTRUCTION` (`src/acp/launch.ts`) alone (subplan 12). Subplans 12, 13, and 14 already use the names `grants` and `askUser`; do not rename them.
  - **Shape.** `AcpRunSnapshot` is today a one-member union in leading-`|` style (`export type AcpRunSnapshot =` followed by `| { kind: 'core'; … }`). Append one `| { kind: 'agent'; … }` inline object member after the core member and touch nothing else in the type. Do not export a separate named agent-member type (knip flags unused exports); where `tool-table.ts` needs the agent member alone it writes `Extract<AcpRunSnapshot, { kind: 'agent' }>`, mirroring `gateCoreCommand`'s `Extract<AcpRunSnapshot, { kind: 'core' }>`.
- The two grant vocabularies differ on purpose: a core grant is a native name (`file read`), an agent grant is a registry name (`file`, source decision 22). The gate never translates between them.
- **Dispatch.** `gateCommand(snapshot, tools, command)` keeps its signature and `AcpGateDecision` return. Today its body is a single `return gateCoreCommand(snapshot, tools, command);` (which only typechecks because the union has one member). It becomes a dispatch on `snapshot.kind`: `'agent'` goes to a new module-private `gateAgentCommand(snapshot, command)`, otherwise `gateCoreCommand(snapshot, tools, command)`. `gateAgentCommand` takes no `tools` parameter. Adding the agent member breaks the existing direct call at typecheck, so the type change and the dispatch land in the same commit. `gateCoreCommand` and its behaviour do not change. Both helpers stay small, well under the `sonarjs/cognitive-complexity` limit.
- **Agent kind** (source decisions 2 and 22). The gate decides only the side, and ignores `tools` (the agent driver passes an empty list, subplan 12; a non-empty list must not change the answer). It never throws — unlike `gateCoreCommand`, which throws `No ACP tool matched command:` for an unclaimed command.
  - The command is normalised exactly the way `runGrantedAgentCommand` (`src/agent/command-tools.ts`, `const input = command.trim().replace(/^\//, '')`) normalises its `input`: trim, then drop one leading `/` (no second trim, so `/ file read a.md` is not a `file read`). The normalised text is tested with `isFileReadCommandLine` from `src/file-read/command.ts` (`/^file\s+read(\s|$)/i`: case-insensitive, whole word), which agrees with `nativeCommandName`'s (`src/acp/native-commands.ts`) `file read` match on trimmed text. Do not write an ad-hoc "first two words" check. So `file read a.md`, `FILE READ a.md`, `  file read a.md`, and `/file read a.md` are the workspace command; `file readme`, `file`, and `files x` are not.
  - A `file read` command when `snapshot.grants` does not include `file` (exact, case-sensitive `includes`, as `runGrantedAgentCommand` checks `snapshot.grants.includes(entry.name)`) refuses with `Agent: command not permitted: <command>.`, where `<command>` is the command exactly as passed in (not the normalised text), matching `runGrantedAgentCommand`'s `` `Agent: command not permitted: ${command}.` ``. No `refused` field (`refused: 'disabled'` is for the core disabled refusal only).
  - A granted `file read` returns `{ runsOn: 'workspace' }`.
  - Every other command returns `{ runsOn: 'caller' }`, whatever the grants and `askUser` — including a command no registry entry matches, and `file readme x`, which the registry's `file` entry (`src/commands/file.ts`, `/^file\b/i`) would claim. Its permission checks (registry match, grant, and the `ask-user` requirement for `question`) stay inside `runGrantedAgentCommand` on the local side.
- **The snapshot is the authority** (source decision 4). The gate never reads live settings. Building the agent snapshot once per prompt is subplan 13's job.
- **Import boundary.** The agent helper's one new import is `isFileReadCommandLine` from `../file-read/command.js`, which is pure and has no imports of its own. Nothing from `src/agent/` is imported; the normalisation and refusal text are reproduced from `runGrantedAgentCommand`, not called.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| `file read` line recogniser (pure, no imports) | `isFileReadCommandLine` in `src/file-read/command.ts` |
| Agent normalisation and refusal text | `runGrantedAgentCommand` in `src/agent/command-tools.ts` |
| Agent grant shape | `AgentSnapshot.grants` (and `skills[].name` for `askUser`) in `src/agent/types.ts` |
| Snapshot union (leading-`|` style, core member inline) and row type | `AcpRunSnapshot`, `AcpRunSnapshotRow` in `src/acp/types.ts` (piece 7.2) |
| Decision type, gate, core helper | `AcpGateDecision`, `gateCommand`, private `gateCoreCommand` in `src/acp/tool-table.ts` (piece 7.2) |
| Gate tests, `core(...)` snapshot builder, deep-frozen case | `describe('gateCommand')` in `src/acp/tool-table.test.ts` |

## Proposed changes

One commit, additive, green on its own: nothing in production builds an agent snapshot until subplan 13.

- `src/acp/types.ts` (67 counted lines today; about 72 after): the `agent` member of `AcpRunSnapshot`.
- `src/acp/tool-table.ts` (175 physical, 145 counted lines today — `max-lines` counts with `skipBlankLines`/`skipComments`; about 160 counted after): a new import of `isFileReadCommandLine` from `../file-read/command.js`; the private `gateAgentCommand`, placed after `gateCoreCommand`; `gateCommand` turned into the dispatch above. This stays under 200, so no extraction is planned. Only if the file would cross 200 counted lines: move `gateCommand`, both helpers, and `AcpGateDecision` into a new `src/acp/gate.ts` (same pure-import rule) rather than compacting code, and point subplans 8, 10, and 12 at it in their own improvement pass.

## Tests

`src/acp/tool-table.test.ts`, in the existing `describe('gateCommand')` block. Agent snapshots are built inline (an `agent(...)` helper beside the existing `core(...)`, defaulting to grants `[]` and `askUser` false) and passed an empty tool list unless stated:

- `file read a.md` with grants `['file']` is `{ runsOn: 'workspace' }`;
- with grants `['db']` it refuses `Agent: command not permitted: file read a.md.` with no `refused` key (`toStrictEqual`);
- `FILE READ a.md` and `/file read a.md` are matched as `file read`; the refusal for an ungranted `/file read a.md` quotes `/file read a.md` as given;
- `file readme x`, `db sqlite list`, and `question ask "x"` are `{ runsOn: 'caller' }` with grants `[]` and `askUser` false;
- tools are ignored: passing the block's existing `gateTools` (whose `db` entry is `runsOn: 'workspace'`) with an agent snapshot still gives `{ runsOn: 'caller' }` for `db sqlite query select 1`, and an unclaimed command does not throw;
- purity: the deep-frozen case from piece 7.2 gains a deep-frozen agent snapshot (snapshot and `grants` frozen), returning equal results twice without throwing.

The core cases from piece 7.2 stay green unchanged, showing the dispatch did not alter core behaviour.

## Out of scope

Removing `toolRunner` or `run`, building the core snapshot, the `command-disabled` notification, and the `file` tool entry (subplan 8). Default `file read` grants (subplan 9). The driver (subplan 10). The agent driver kind and its `MARKDOWN_INSTRUCTION` primer (subplan 12). Building the agent snapshot and `runWorkspace` (subplan 13). Validating and sending the snapshot over the wire (subplan 14).

**Open for subplan 13:** should an agent run's workspace `file read` honour a disabled `file read` setting? The agent gate decides only the side (source plan), and the agent snapshot carries no setting rows, so this piece does not answer it; subplan 13 must.

## Verification

Run `$janissary/scripts/run.mjs check-diff` (lint, typecheck, and the server tests for `src/acp/`). Confirm `src/acp/tool-table.ts` gained no import beyond `../file-read/command.js` in this piece (subplan 7 as a whole added only that and `./types.js`; the file's other imports predate it and serve `createAcpToolTable` and `toolRunner`), and in particular no new import of `src/native-commands/policy.ts`, `src/application-commands.ts`, or anything under `src/agent/` for the gate's use. Nothing user-visible changes, so there is no manual end-to-end check; `ask` with a granted `db sqlite query` on a local tab still runs through `toolRunner` exactly as before.
