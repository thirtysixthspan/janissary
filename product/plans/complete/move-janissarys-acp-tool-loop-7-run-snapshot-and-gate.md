# ACP tool loop 7 — per-prompt run snapshot and the pure gate

**Complexity: 6/10** — ~55 added lines in 2 files, 13 requirements, 19 test scenarios (p=5.94); above the series' 1–5 target because the core and agent gate rules each need their own refusal and normalisation cases, not because of code size

Run order: 7 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` ("Per-prompt snapshot", "Gate"; decisions 2, 4, 5, 6, and 22). Depends on subplan 6 (`product/plans/complete/move-janissarys-acp-tool-loop-6-file-read-vocabulary.md`, landed) for `file read` in `NATIVE_ACP_COMMANDS` and the `file` owner in `nativeCommandTool`. Subplans 8 and 10–14 build on it.

The loop's gate decides, for each command an agent emits, whether it may run and on which side. Today that is `toolRunner` in `src/acp/tool-table.ts`, which re-reads live settings on every call through `Managers` (`effectiveCommandSetting(managers.nativeCommandSettings?.current(), row.name)`), and the far side cannot load `Managers`. This subplan adds the plain-data snapshot a prompt will carry and a pure `gateCommand` that decides from that snapshot alone. Both are additive: `toolRunner` keeps serving the loop until subplan 8 switches `runCorePrompt` to the gate.

## Design decisions

- **`AcpRunSnapshot`** lives in `src/acp/types.ts`, beside `AcpLoopDeps`. It is a discriminated union on a `kind` field (`'core'` or `'agent'`) of plain JSON-safe data (strings, booleans, arrays, plain objects; no functions, `Map`s, or `undefined`-valued fields), so subplan 14 can validate and send it unchanged. Arrays are typed `readonly`.
  - `core`: `role` (typed `AcpRole`, imported as a type from `./role.js`), `roleName` (the role name `runCorePrompt` passes to `toolRunner` today, `request.roleName`), `grants` (the role's native command grants, `request.commands`), `rows`, and `withoutTools` (boolean).
  - `rows` is an array of the exported row type `AcpRunSnapshotRow`: `{ name, effectiveEnabled, effectiveAgentAccess }`. `name` is the **native vocabulary name** — `file read`, `db sqlite query` — never the command registry name `file` or `db`. Its two booleans mirror `EffectiveCommandSetting` (`src/native-commands/policy.ts:5`) field for field, but `types.ts` does not import that type.
  - `agent`: `grants` (the run's skill grants, `AgentSnapshot.grants` in `src/agent/types.ts`, which hold command registry names such as `file`, `db`, `question`) and `askUser` (boolean: whether a selected skill is named `ask-user`). It carries no primer field. `executeAgentRun` already puts `agentPrimer(run.snapshot)` into the prompt text, and the loop's own primer for an agent run is `MARKDOWN_INSTRUCTION` alone (subplan 12).
  - The two grant vocabularies differ on purpose: a core grant is a native name (`file read`), an agent grant is a registry name (`file`, source decision 22). The gate never translates between them.
- **Every tool has a side** (source decision 2). `AcpTool` gains a required `runsOn: 'caller' | 'workspace'`. The browser, question, and database entries in `createAcpToolTable` are `caller`. The `file` entry, added in subplan 8, is `workspace`. `AcpTool` keeps its `run` field here; subplan 8 removes it. Only `createAcpToolTable` builds `AcpTool` values in production code (no other file constructs one), so the new required field breaks nothing else.
- **`gateCommand(snapshot, tools, command)`** is exported from `src/acp/tool-table.ts`. It takes an `AcpRunSnapshot`, a `readonly AcpTool[]`, and the extracted command string, and is pure: no `Managers`, no notification, no I/O, no mutation of its inputs. It returns the exported union `AcpGateDecision`, which is either `{ runsOn }` naming the side, or `{ refusal, refused? }`, where `refusal` is the exact tool-result text and `refused: 'disabled'` marks a disabled or agent-off refusal. It dispatches on `snapshot.kind` to two module-private helpers, one per kind, so neither function approaches the `sonarjs/cognitive-complexity` limit.
- **Core order** (source decision 6, today's `toolRunner` order at `src/acp/tool-table.ts`, `export function toolRunner`):
  1. A command whose `nativeCommandName(command)` is undefined, or that no entry of `tools` claims with `match(command)` (tested against the command as given, first match wins, as `toolRunner` does), throws `new Error('No ACP tool matched command: <command>')`. It throws rather than refusing, so the loop's catch turns it into the `error` event as today.
  2. The row is `snapshot.rows.find((row) => row.name === native)`. A row with `effectiveEnabled` false or `effectiveAgentAccess` false refuses with `Command is disabled: <native>.` and `refused: 'disabled'`. This is checked before the grant, so a disabled command the role did not grant still reports the disabled refusal.
  3. A native name missing from `snapshot.grants` refuses with `Command not allowed for role "<roleName>": <native>.` and no `refused` field.
  4. Anything else returns `{ runsOn: tool.runsOn }` for the matched tool.

  A native command with no snapshot row is allowed, matching today's "missing settings manager or setting row allows the command" (`effectiveCommandSetting` defaults both fields to true). `withoutTools` is not consulted by the gate: the driver builds an empty tool list for such a snapshot (subplans 8 and 10), and with no tools every command throws at step 1.
- **Why `<native>` is the right row and refusal name.** Today `toolRunner` resolves `resolveApplicationCommand(native)` and uses its `name`. For every native command that row is the native row itself, whose name is its fixed form (`rows.push({ name, kind: 'native', …` in `src/application-commands.ts`); `src/application-commands.test.ts` pins this for `browser goto`, `db sqlite query`, `question ask`, `question approve`, and `file read` (case "lists the file command as a parentless builtin while the native row owns file read input"). So the gate looks rows up by native name straight from the snapshot and refuses with the native name, and the gate's code imports neither `src/native-commands/policy.ts` nor `src/application-commands.ts`, which would drag the command registry into the far side. Those two imports, `Managers`, `dispatch-policy.js`, notifications, and the invocation context stay in `tool-table.ts` only because `toolRunner` and `dispatchNative` still use them; subplan 8 deletes them with `toolRunner`.
- **Notification is the caller's job.** `toolRunner` calls `notify(managers, 'command-disabled', label, message)` on a disabled refusal (directly, or inside `refuseDisabledCommand`). The pure gate cannot; it marks the refusal `refused: 'disabled'` instead, and the caller raises the notification with the refusal text (subplan 8 in `runCorePrompt`, then subplan 11 in the driver's `ranCommand`). One deliberate tightening: today, when `effectiveEnabled` is false but `refuseDisabledCommand` finds no command or row and returns undefined, `toolRunner` falls through to the agent-access and grant checks; the gate always refuses a row with `effectiveEnabled` false. No native command reaches that fall-through today, so nothing observable changes.
- **Agent kind** (source decisions 2 and 22). The gate decides only the side, and ignores `tools` (the agent driver passes an empty list, subplan 12). It never throws.
  - The command is normalised the way `runGrantedAgentCommand` (`src/agent/command-tools.ts`) normalises its `input`: trim, then drop one leading `/`. The normalised text is tested with `isFileReadCommandLine` from `src/file-read/command.ts` (`/^file\s+read(\s|$)/i`: case-insensitive, whole word), which agrees word-for-word with `nativeCommandName`'s `file read` match. Do not write an ad-hoc "first two words" check. So `file read a.md`, `FILE READ a.md`, and `/file read a.md` are the workspace command; `file readme`, `file`, and `files x` are not.
  - A `file read` command when `snapshot.grants` does not include `file` (exact, case-sensitive `includes`, as `runGrantedAgentCommand` checks `snapshot.grants.includes(entry.name)`) refuses with `Agent: command not permitted: <command>.`, where `<command>` is the command exactly as passed in (not the normalised text), matching `runGrantedAgentCommand`'s `` `Agent: command not permitted: ${command}.` ``. No `refused` field.
  - A granted `file read` returns `{ runsOn: 'workspace' }`.
  - Every other command returns `{ runsOn: 'caller' }`, whatever the grants and `askUser`. Its permission checks (registry match, grant, and the `ask-user` requirement for `question`) stay inside `runGrantedAgentCommand` on the local side.
- **The snapshot is the authority** (source decision 4). The gate never reads live settings. Building the snapshot once per prompt is subplan 8's job (core) and subplan 13's (agent).

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Today's gate order and texts | `toolRunner` in `src/acp/tool-table.ts` |
| Native name matching (pure) | `nativeCommandName` in `src/acp/native-commands.ts` (already imported by `tool-table.ts`) |
| `file read` line recogniser (pure, no imports) | `isFileReadCommandLine` in `src/file-read/command.ts` |
| Effective setting shape | `EffectiveCommandSetting` in `src/native-commands/policy.ts` (the row fields mirror it; neither `types.ts` nor the gate imports it) |
| Native row name equals its fixed form | `buildApplicationCommands` in `src/application-commands.ts`; pinned by `src/application-commands.test.ts` |
| Agent normalisation and refusal text | `runGrantedAgentCommand` in `src/agent/command-tools.ts` |
| Agent grant shape | `AgentSnapshot.grants` in `src/agent/types.ts` |
| Role type | `AcpRole` in `src/acp/role.ts` |

## Proposed changes

One commit, additive, green on its own: nothing in production calls `gateCommand` or reads `AcpRunSnapshot` until subplan 8, and the only new required field (`runsOn`) is filled in the one place `AcpTool` values are built. `gateCommand` and the two exported types are consumed only by tests until then, which knip accepts because test files are entry points.

- `src/acp/types.ts` (100 lines today; about 120 after): `AcpRunSnapshot` and `AcpRunSnapshotRow`, plus a type-only import of `AcpRole` from `./role.js`.
- `src/acp/tool-table.ts` (140 lines today; about 180 after, under the 200-line `max-lines` limit counting non-blank, non-comment lines): `runsOn` on `AcpTool` and on the three existing entries; new imports of `isFileReadCommandLine` from `../file-read/command.js` and the `AcpRunSnapshot` type from `./types.js`; the exported `AcpGateDecision` type and `gateCommand` with its two private helpers. `toolRunner`, `createAcpToolTable`'s `managers`/`_role`/`signal` parameters, `dispatchNative`, and `run` stay unchanged. If the file would cross 200 counted lines, move `gateCommand`, its helpers, and `AcpGateDecision` into a new `src/acp/gate.ts` (same pure-import rule) rather than compacting code, and point subplans 8, 10, and 12 at it in their own improvement pass.

## Tests

`src/acp/tool-table.test.ts` (test files are exempt from `max-lines`). Import `gateCommand` beside the existing imports. Build snapshots and a hand-built tool list inline: one `caller` tool whose `match` is `^browser\b`, and one `workspace` tool whose `match` is `^db\b` — the gate only reads `match` and `runsOn`, and each literal also supplies a stub `run` and `isCommandLine` because `AcpTool` still requires them here. Add a `describe('gateCommand')` block:

- `createAcpToolTable` (existing case or one new assertion): the three real entries all report `runsOn: 'caller'`;
- core kind:
  - `select 1` (no native name) and `question ask "x"` (native, but no tool in the list claims it) each throw `No ACP tool matched command: <command>`;
  - a row `{ name: 'db sqlite query', effectiveEnabled: false, effectiveAgentAccess: true }` refuses `Command is disabled: db sqlite query.` with `refused: 'disabled'`;
  - `effectiveAgentAccess` false with `effectiveEnabled` true gives the same refusal and flag;
  - a disabled command missing from `grants` reports the disabled refusal, not the not-allowed one;
  - an enabled `browser goto https://x` missing from `grants`, with `roleName: 'researcher'`, refuses `Command not allowed for role "researcher": browser goto.` with no `refused` key;
  - a granted command with no row is allowed; a granted `browser goto …` returns `{ runsOn: 'caller' }` and a granted `db sqlite query …` returns `{ runsOn: 'workspace' }`, showing the gate returns the matched tool's own side;
- agent kind (empty tool list):
  - `file read a.md` with grants `['file']` is `{ runsOn: 'workspace' }`;
  - with grants `['db']` it refuses `Agent: command not permitted: file read a.md.` with no `refused` key;
  - `FILE READ a.md` and `/file read a.md` are matched as `file read`; the refusal for an ungranted `/file read a.md` quotes `/file read a.md` as given;
  - `file readme x`, `db sqlite list`, and `question ask "x"` are `{ runsOn: 'caller' }` with grants `[]` and `askUser` false;
- purity: calling the gate twice with one deep-frozen snapshot (`Object.freeze` on the snapshot, its arrays, and rows) returns equal results and does not throw.

## Out of scope

Removing `toolRunner` or `run`, building the snapshot in `runCorePrompt`, the `command-disabled` notification for gate refusals, and the `file` tool entry (subplan 8). Default `file read` grants (subplan 9). The driver (subplan 10). Building the agent snapshot and `runWorkspace` (subplan 13). Validating and sending the snapshot over the wire (subplan 14). Whether an agent run's workspace `file read` honours the `file read` disabled setting is not the gate's concern (source plan: the agent gate decides only the side).

## Verification

Run `$janissary/scripts/run.mjs check-diff` (lint, typecheck, and the server tests for `src/acp/`). Confirm `src/acp/tool-table.ts` gained no import of `src/native-commands/policy.ts`, `src/application-commands.ts`, or anything else beyond `../file-read/command.js` and `./types.js`. Nothing user-visible changes, so there is no manual end-to-end check; `ask` with a granted `db sqlite query` on a local tab still runs through `toolRunner` exactly as before.
