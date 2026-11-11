# ACP tool loop 7.3 — the agent run snapshot and its gate

**Complexity: 4/10** — ~25 added lines in 2 files, 7 requirements, 9 test scenarios (p=5.10)

Run order: piece 3 of 3 of subplan 7 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop-7-run-snapshot-and-gate.md` (decomposed from it; "Per-prompt snapshot", "Gate", agent kind). Canonical plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (decisions 2, 4, and 22). Depends on piece 7.2 (`product/plans/draft/move-janissarys-acp-tool-loop-7-run-snapshot-and-gate-2-core-snapshot-and-gate.md`) for `AcpRunSnapshot`, `AcpGateDecision`, `gateCommand`, and its core helper, and through it on piece 7.1 (`product/plans/draft/move-janissarys-acp-tool-loop-7-run-snapshot-and-gate-1-tool-sides.md`). Subplans 8 and 10–14 build on the finished gate; subplans 12 and 13 use this kind.

An agent run carries the agent's own skill grants rather than a role's native grants, and its only workspace command is `file read`. This piece adds the `agent` member to `AcpRunSnapshot` and teaches `gateCommand` to decide an agent command's side, completing the two-kind snapshot and gate the source plan describes. It stays additive: nothing in production reads the agent kind until subplan 13.

## Design decisions

- **The `agent` member** of `AcpRunSnapshot` in `src/acp/types.ts` (`kind: 'agent'`), plain JSON-safe data with `readonly` arrays like the `core` member: `grants` (the run's skill grants, `AgentSnapshot.grants` in `src/agent/types.ts`, which hold command registry names such as `file`, `db`, `question`) and `askUser` (boolean: whether a selected skill is named `ask-user`). It carries no primer field. `executeAgentRun` already puts `agentPrimer(run.snapshot)` into the prompt text, and the loop's own primer for an agent run is `MARKDOWN_INSTRUCTION` alone (subplan 12).
- The two grant vocabularies differ on purpose: a core grant is a native name (`file read`), an agent grant is a registry name (`file`, source decision 22). The gate never translates between them.
- **Dispatch.** `gateCommand(snapshot, tools, command)` keeps its signature and `AcpGateDecision` return, and now dispatches on `snapshot.kind` to two module-private helpers, the core helper from piece 7.2 and a new agent helper, so neither function approaches the `sonarjs/cognitive-complexity` limit. The core behaviour does not change.
- **Agent kind** (source decisions 2 and 22). The gate decides only the side, and ignores `tools` (the agent driver passes an empty list, subplan 12). It never throws.
  - The command is normalised the way `runGrantedAgentCommand` (`src/agent/command-tools.ts`) normalises its `input`: trim, then drop one leading `/`. The normalised text is tested with `isFileReadCommandLine` from `src/file-read/command.ts` (`/^file\s+read(\s|$)/i`: case-insensitive, whole word), which agrees word-for-word with `nativeCommandName`'s `file read` match. Do not write an ad-hoc "first two words" check. So `file read a.md`, `FILE READ a.md`, and `/file read a.md` are the workspace command; `file readme`, `file`, and `files x` are not.
  - A `file read` command when `snapshot.grants` does not include `file` (exact, case-sensitive `includes`, as `runGrantedAgentCommand` checks `snapshot.grants.includes(entry.name)`) refuses with `Agent: command not permitted: <command>.`, where `<command>` is the command exactly as passed in (not the normalised text), matching `runGrantedAgentCommand`'s `` `Agent: command not permitted: ${command}.` ``. No `refused` field.
  - A granted `file read` returns `{ runsOn: 'workspace' }`.
  - Every other command returns `{ runsOn: 'caller' }`, whatever the grants and `askUser`. Its permission checks (registry match, grant, and the `ask-user` requirement for `question`) stay inside `runGrantedAgentCommand` on the local side.
- **The snapshot is the authority** (source decision 4). The gate never reads live settings. Building the agent snapshot once per prompt is subplan 13's job.
- **Import boundary.** The agent helper's one new import is `isFileReadCommandLine` from `../file-read/command.js`, which is pure and has no imports of its own. Nothing from `src/agent/` is imported; the normalisation and refusal text are reproduced from `runGrantedAgentCommand`, not called.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| `file read` line recogniser (pure, no imports) | `isFileReadCommandLine` in `src/file-read/command.ts` |
| Agent normalisation and refusal text | `runGrantedAgentCommand` in `src/agent/command-tools.ts` |
| Agent grant shape | `AgentSnapshot.grants` in `src/agent/types.ts` |
| Snapshot union, decision type, gate, core helper | `src/acp/types.ts` and `src/acp/tool-table.ts` (piece 7.2) |

## Proposed changes

One commit, additive, green on its own: nothing in production builds an agent snapshot until subplan 13.

- `src/acp/types.ts` (about 115 lines after 7.2; about 120 after): the `agent` member of `AcpRunSnapshot`.
- `src/acp/tool-table.ts` (about 170 lines after 7.2; about 180 after): a new import of `isFileReadCommandLine` from `../file-read/command.js`; the private agent helper; `gateCommand` turned into a dispatch on `snapshot.kind`. The 200-line rule shared with piece 7.2 applies: if the file would cross 200 counted lines, move `gateCommand`, both helpers, and `AcpGateDecision` into a new `src/acp/gate.ts` (same pure-import rule) rather than compacting code, and point subplans 8, 10, and 12 at it in their own improvement pass.

## Tests

`src/acp/tool-table.test.ts`, in the `describe('gateCommand')` block from piece 7.2. Agent snapshots are built inline and passed an empty tool list:

- `file read a.md` with grants `['file']` is `{ runsOn: 'workspace' }`;
- with grants `['db']` it refuses `Agent: command not permitted: file read a.md.` with no `refused` key;
- `FILE READ a.md` and `/file read a.md` are matched as `file read`; the refusal for an ungranted `/file read a.md` quotes `/file read a.md` as given;
- `file readme x`, `db sqlite list`, and `question ask "x"` are `{ runsOn: 'caller' }` with grants `[]` and `askUser` false;
- purity: the frozen-snapshot case from piece 7.2 also runs with a deep-frozen agent snapshot (snapshot and `grants` frozen), returning equal results twice without throwing.

The core cases from piece 7.2 stay green unchanged, showing the dispatch did not alter core behaviour.

## Out of scope

Removing `toolRunner` or `run`, building the core snapshot, the `command-disabled` notification, and the `file` tool entry (subplan 8). Default `file read` grants (subplan 9). The driver (subplan 10). The agent driver kind and its `MARKDOWN_INSTRUCTION` primer (subplan 12). Building the agent snapshot and `runWorkspace` (subplan 13). Validating and sending the snapshot over the wire (subplan 14). Whether an agent run's workspace `file read` honours the `file read` disabled setting is not the gate's concern (source plan: the agent gate decides only the side); that question stays open for subplan 13.

## Verification

Run `$janissary/scripts/run.mjs check-diff` (lint, typecheck, and the server tests for `src/acp/`). Confirm `src/acp/tool-table.ts` gained no import beyond `../file-read/command.js` in this piece (and, across subplan 7 as a whole, nothing beyond `../file-read/command.js` and `./types.js`), and in particular no import of `src/native-commands/policy.ts`, `src/application-commands.ts`, or anything under `src/agent/` for the gate's use. Nothing user-visible changes, so there is no manual end-to-end check; `ask` with a granted `db sqlite query` on a local tab still runs through `toolRunner` exactly as before.
