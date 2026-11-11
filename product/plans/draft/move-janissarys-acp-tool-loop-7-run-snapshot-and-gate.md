# ACP tool loop 7 — per-prompt run snapshot and the pure gate

**Complexity: 5/10** — ~55 added lines in 2 files, 10 requirements, 14 scenarios (p=5.65)

Run order: 7 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` ("Per-prompt snapshot", "Gate"; decisions 2, 4, 6, and 22). Depends on subplan 6 (`move-janissarys-acp-tool-loop-6-file-read-vocabulary.md`) for `file read` in the vocabulary. Subplans 8, 10, 12, and 14 build on it.

The loop's gate decides, for each command an agent emits, whether it may run and on which side. Today that is `toolRunner` in `src/acp/tool-table.ts`, which re-reads live settings on every call through `Managers`, and the far side cannot load `Managers`. This subplan adds the plain-data snapshot a prompt will carry and a pure `gateCommand` that decides from that snapshot alone. Both are additive: `toolRunner` keeps serving the loop until subplan 8 switches to the gate.

## Design decisions

- **`AcpRunSnapshot`** lives in `src/acp/types.ts`. It is a discriminated union of plain JSON-safe data, so it can cross the wire in subplan 14:
  - `core`: `role` (`ask` or `tell`), `roleName`, `grants` (the role's native command grants), `rows` (one `{ name, effectiveEnabled, effectiveAgentAccess }` per native command present in the settings snapshot), and `withoutTools`.
  - `agent`: `grants` (the run's command grants) and `askUser` (whether the `ask-user` skill is selected). It carries no primer field. `executeAgentRun` already puts `agentPrimer(run.snapshot)` into the prompt text, and the loop's own primer for an agent run is `MARKDOWN_INSTRUCTION` alone (subplan 12).
- **Every tool has a side** (source decision 2). `AcpTool` gains `runsOn: 'caller' | 'workspace'`. The browser, question, and database entries are `caller`. The `file` entry, added in subplan 8, is `workspace`. In this subplan `AcpTool` keeps its `run` field; subplan 8 removes it.
- **`gateCommand(snapshot, tools, command)`** is pure. It returns either `{ runsOn }`, naming the side to run on, or `{ refusal, refused? }`, where `refusal` is the exact tool-result text and `refused: 'disabled'` marks a disabled or agent-off refusal.
- **Core order** (source decision 6, today's `toolRunner` order):
  1. A command whose `nativeCommandName` is undefined, or that no tool's `match` claims, throws `No ACP tool matched command: <command>`.
  2. A command whose snapshot row has `effectiveEnabled` false or `effectiveAgentAccess` false refuses with `Command is disabled: <native>.` and `refused: 'disabled'`. This is checked before the grant, so a disabled command the role did not grant still reports the disabled refusal.
  3. An ungranted command refuses with `Command not allowed for role "<roleName>": <native>.` and no `refused` flag.
  4. Anything else returns the matched tool's `runsOn`.
  
  A native command with no snapshot row is allowed, matching today's "missing settings manager or setting row allows the command". Rows are looked up by native name straight from the snapshot, because a native row's name is its fixed form (`rows.push({ name, kind: 'native', …` in `src/application-commands.ts`). So the gate imports neither `src/native-commands/policy.ts` nor `src/application-commands.ts`, which would drag the command registry into the far side.
- **Agent kind** (source decisions 2 and 22). The gate decides only the side. A command whose first two words are `file read`, case-insensitively, is the one workspace command. When the run's grants lack `file`, it is refused with today's `Agent: command not permitted: <command>.` (no `refused` flag). Otherwise it runs in the workspace. Every other command is a caller command, and its permission check stays where it is today, inside `runGrantedAgentCommand` on the local side.
- **The snapshot is the authority** (source decision 4). The gate never reads live settings. Building the snapshot once per prompt is subplan 8's job (core) and subplan 13's (agent).

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Today's gate order and texts | `toolRunner` in `src/acp/tool-table.ts` |
| Native name matching (pure) | `nativeCommandName` in `src/acp/native-commands.ts` |
| Effective setting shape | `EffectiveCommandSetting` in `src/native-commands/policy.ts` (the row fields mirror it; the gate does not import it) |
| Agent refusal text | `runGrantedAgentCommand` in `src/agent/command-tools.ts` |
| Role type | `AcpRole` in `src/acp/role.ts` |

## Proposed changes

- `src/acp/types.ts`: `AcpRunSnapshot` and its row type.
- `src/acp/tool-table.ts`: `runsOn` on `AcpTool` and on the three existing entries; new exported `gateCommand`. `toolRunner`, `createAcpToolTable`'s `managers` parameter, and `run` stay for now.

## Tests

`src/acp/tool-table.test.ts`, new `gateCommand` cases over a hand-built tool list that includes one `workspace` tool:

- an unknown command and an unmatched native command each throw `No ACP tool matched command: <command>`;
- a row with `effectiveEnabled` false refuses `Command is disabled: db sqlite query.` with `refused: 'disabled'`;
- `effectiveAgentAccess` false gives the same refusal;
- a disabled and ungranted command reports the disabled refusal, not the not-allowed one;
- an ungranted command refuses `Command not allowed for role "researcher": browser goto.` with no `refused`;
- a granted command with no row is allowed, and a caller tool and a workspace tool return their own `runsOn`;
- agent kind:
  - `file read a.md` with `file` granted is `workspace`;
  - without the grant it refuses `Agent: command not permitted: file read a.md.`;
  - `FILE READ a.md` is matched case-insensitively;
  - `db sqlite list` and `question ask "x"` are `caller` whatever the grants;
- the gate decides from the snapshot passed in, so changing a fake settings source between two calls with one snapshot changes nothing.

## Out of scope

Removing `toolRunner` or `run`, building the snapshot, and the `file` tool entry (subplan 8). The driver (subplan 10). Sending the snapshot over the wire (subplan 14).

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Nothing user-visible changes.
