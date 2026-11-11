# ACP tool loop 6 — `file read` in the native vocabulary

**Complexity: 3/10** — ~4 added lines across 3 edited files, 4 requirements, 6 scenarios (p=4.38)

Run order: 6 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (decision 12's "`file` is a new native tool owner; `file read` joins the native vocabulary after `question approve`"; the first, second, and fourth bullets of "Vocabulary and roles"). Depends on subplan 5 (`move-janissarys-acp-tool-loop-5-typed-file-command.md`), whose `file` command is the parent row the native `file read` row hangs under. Subplans 7 and 8 rely on it.

Native ACP commands are a fixed vocabulary. The roles tab grants from it, the commands tab lists a setting row for each entry, and the tool loop recognizes and gates against it. This subplan adds `file read` to that vocabulary and gives it its own tool owner, `file`. It does not make the loop run it (subplan 8) or grant it to any default role (subplan 9).

## Design decisions

- `NATIVE_ACP_COMMANDS` (`src/plugins/roles/shared.ts`) gains `file read` immediately after `question approve`. The order is the vocabulary order every allow-list line and role listing uses.
- `APPLICATION_COMMAND_NATIVE_TOOLS` (`src/shared/application-commands.ts`) gains `file`, so `ApplicationCommandNativeTool` admits it. The commands-tab payload check (`NATIVE_TOOLS` in `src/plugins/commands/shared.ts`) derives from that constant and needs no edit.
- `nativeCommandTool` (`src/acp/native-commands.ts`) maps a native name starting `file ` to `file`. Today it falls through to `question` for any name that is not `db …` or `browser …`, so the new branch must come before that fall-through. Otherwise `file read` would be owned by `question`, and granting it would wrongly put the question tool in the table.
- The native row is built by the existing loop in `buildApplicationCommands` (`src/application-commands.ts`). It gets name `file read`, parent `file` (the builtin row from subplan 5), and `nativeTool: 'file'` with no edit there. The commands tab and the roles tab list `file read` automatically from the vocabulary, so no web change is needed.
- **Transitional state until subplan 8.** The tool table has no `file` entry yet, so a role that grants `file read` gets it in the allow-list line and nothing extracts it. No default role grants it until subplan 9, so only a hand-edited role sees this, and only between commits of one pull request.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Native vocabulary | `NATIVE_ACP_COMMANDS` in `src/plugins/roles/shared.ts` |
| Tool owners | `APPLICATION_COMMAND_NATIVE_TOOLS` in `src/shared/application-commands.ts` |
| Name and owner mapping | `nativeCommandName`, `nativeCommandTool` in `src/acp/native-commands.ts` |
| Native rows, roles validation, and tab listings that read the vocabulary | `buildApplicationCommands` in `src/application-commands.ts`; `src/plugins/roles/command-policy.ts`; `src/plugins/roles/activate.ts` |

## Proposed changes

- `src/plugins/roles/shared.ts`: add `file read` after `question approve`.
- `src/shared/application-commands.ts`: add `file` to `APPLICATION_COMMAND_NATIVE_TOOLS`.
- `src/acp/native-commands.ts`: the `file ` branch before the question fall-through.

## Tests

- `src/acp/native-commands.test.ts`:
  - `nativeCommandName('file read notes/a.md')` is `file read`, and `nativeCommandTool` of it is `file`;
  - `question ask` still maps to `question`;
  - `files x` maps to nothing.
- `src/application-commands.test.ts`: a native `file read` row with parent `file` and `nativeTool: 'file'`, sorted with the rest.
- The roles tests that enumerate or count the native vocabulary (`src/plugins/roles/*.test.ts`): updated for the tenth command, and a role naming `file read` validates.
- `src/plugins/commands/payload.test.ts`: a row with `nativeTool: 'file'` is accepted.

## Out of scope

The tool-table `file` entry (subplan 8). Default grants (subplan 9). The roles spec's command count (subplan 26).

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then, by hand:
- open the commands tab and confirm a `file read` row with an Agent access checkbox under `file`;
- open the roles tab and confirm **Add command** offers `file read`.
