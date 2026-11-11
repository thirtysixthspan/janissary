# ACP tool loop 6 — `file read` in the native vocabulary

**Complexity: 3/10** — ~4 added lines across 3 edited files, 5 requirements, 7 scenarios (p=4.55)

Run order: 6 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (decision 12's "`file` is a new native tool owner; `file read` joins the native vocabulary after `question approve`"; the first, second, and fourth bullets of "Vocabulary and roles"). Depends on subplan 5 (`product/plans/complete/move-janissarys-acp-tool-loop-5-typed-file-command-1-local-command.md` and `...-5-typed-file-command-2-remote-read.md`), whose builtin `file` row is the parent the native `file read` row hangs under. Subplans 7 and 8 rely on it.

Native ACP commands are a fixed vocabulary. The roles tab grants from it, the commands tab lists a setting row for each entry, and the tool loop recognizes and gates against it. This subplan adds `file read` to that vocabulary and gives it its own tool owner, `file`. It does not make the loop run it (subplan 8) or grant it to any default role (subplan 9).

## Design decisions

- `NATIVE_ACP_COMMANDS` (`src/plugins/roles/shared.ts:3`) gains `'file read'` immediately after `'question approve'`, as the tenth and last entry. The order is the vocabulary order every allow-list line and role listing uses.
- `APPLICATION_COMMAND_NATIVE_TOOLS` (`src/shared/application-commands.ts:1`, today `['database', 'browser', 'question'] as const`) gains `'file'` as its last element, so `ApplicationCommandNativeTool` admits it. The commands-tab payload guard (`NATIVE_TOOLS`, built in `src/plugins/commands/shared.ts` from that constant and checked in `src/plugins/commands/payload.ts:18`) and the web `CommandRow` (`web/src/plugins/commands/CommandRow.tsx`, which only tests `nativeTool !== undefined`) need no edit.
- `nativeCommandTool` (`src/acp/native-commands.ts`) gains a branch returning `'file'` when the native name starts with `'file '`, placed with the `db ` and `browser ` branches before the final `return 'question'`. Without it the fall-through makes `question` the owner of `file read`, and granting `file read` would wrongly put the question tool in the table. `nativeCommandName` needs no change: it matches whole words, so `file read notes/a.md` → `file read`, while `file`, `file readme`, and `files x` → `undefined`. That agrees word-for-word with `isFileReadCommandLine` (`src/file-read/command.ts`, `/^file\s+read(\s|$)/i`), which subplans 7 and 8 use for the same command.
- **The native row.** The loop at `src/application-commands.ts:72` (`for (const name of NATIVE_ACP_COMMANDS)`) builds it with no edit there: name `file read`, forms `['file read']`, parent `file` (the first word), `nativeTool: nativeCommandTool(name)` = `'file'`. Do **not** add `file read` to the `file` entry of `BUILTIN_FORMS` (`src/application-commands.ts:16`, `file: { name: 'file', forms: ['file'] }`) — `question` lists its native forms there, but a duplicate `file read` builtin row would collide with the native row and break the name/form uniqueness test in `src/application-commands.test.ts` and the one-native-row-per-name check in `src/application-commands.claims.test.ts`.
- **Typed `file read` changes its policy key.** `resolveApplicationCommand` ranks by longest matching form (`rankCommandRows` in `src/shared/command-matching.ts`), so after this subplan `file read a.md` resolves to the native `file read` row instead of the builtin `file` row. This is intended and matches `question ask`/`browser goto`. Consequences, all through existing code: unchecking **Enabled** on `file read` in the commands tab makes a typed `file read …` print `Command is disabled: file read.` (`disabledApplicationCommand` in `src/native-commands/policy.ts`, via `refuseDisabledCommand`); bare `file` (the usage line) stays governed by the `file` row; unchecking `file` still disables `file read` through the parent chain in `createSnapshot` (`src/native-commands/manager.ts`). An existing `commands.json` entry for `file` keeps its effect. The roles tab reports the row's restriction through `commandRestrictionsFrom` (`src/plugins/roles/command-policy.ts`) automatically because it reads `NATIVE_ACP_COMMANDS`.
- **Transitional state until subplan 8 — advertised, never run.** The tool table (`createAcpToolTable`, `src/acp/tool-table.ts`) has no entry with owner `file` yet, so a granted `file read` selects no tool. Exactly what happens on an ACP prompt whose role grants it:
  - granted alone: the table is empty, `toolPrimer` returns `''`, and `runCorePrompt` (`src/acp/run-prompt.ts`) sends `NO_TOOLS_LINE` ("You have no tools; answer in prose."); nothing is advertised;
  - granted with other commands: the other tools' primer slices appear and the allow-list line (`toolPrimer` filters `NATIVE_ACP_COMMANDS` by the grants) names `file read`, with no file primer slice;
  - if the agent ends a reply with `file read …`, no table entry's `isCommandLine` accepts it (`isBrowserCommandLine`, `isQuestionCommandLine`, `isDatabaseCommandLine` are all prefix-anchored), so `toolExtractor` skips that line; the reply is the final answer unless an earlier line is a recognized command, which is then run as today. `toolRunner` and `dispatchNative` never see a `file read` command, so the database catch-all `match: () => true` cannot claim it.
  - Agent runs (`agent …`, skill grants) and typed `file read` are unaffected by the gap.

  No default role grants `file read` until subplan 9, so only a hand-edited role sees this. Every existing test stays green: tests that pass `[...NATIVE_ACP_COMMANDS]` as grants (`src/acp/manager.test.ts`, `src/acp/record-feed.test.ts`, `src/acp/index.test.ts`, `src/native-commands/feature.integration.test.ts`) build the same table as before, and `src/acp/tool-table.test.ts`'s first case derives its expected allow-list from `NATIVE_ACP_COMMANDS.join(', ')`, so it now expects `file read` in the line with no file slice. Subplan 8 adds the slice and must update that expectation.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Native vocabulary | `NATIVE_ACP_COMMANDS` in `src/plugins/roles/shared.ts` |
| Tool owners and the commands-tab guard derived from them | `APPLICATION_COMMAND_NATIVE_TOOLS` in `src/shared/application-commands.ts`; `NATIVE_TOOLS` in `src/plugins/commands/shared.ts` |
| Name and owner mapping | `nativeCommandName`, `nativeCommandTool` in `src/acp/native-commands.ts` |
| Native rows built from the vocabulary | the `NATIVE_ACP_COMMANDS` loop in `buildApplicationCommands`, `src/application-commands.ts` |
| Parent `file` row | `BUILTIN_FORMS.file` in `src/application-commands.ts` (subplan 5) |
| Effective enable/agent-access with parent chain | `createSnapshot` in `src/native-commands/manager.ts` |
| Roles payload vocabulary and restrictions | `nativeCommands: [...NATIVE_ACP_COMMANDS]` in `src/plugins/roles/activate.ts`; `commandRestrictionsFrom` in `src/plugins/roles/command-policy.ts` |

## Proposed changes

Land all three in one commit so typecheck and tests stay green (the vocabulary entry without the owner branch would map `file read` to `question`).

- `src/plugins/roles/shared.ts`: add `'file read'` after `'question approve'`.
- `src/shared/application-commands.ts`: add `'file'` to `APPLICATION_COMMAND_NATIVE_TOOLS`.
- `src/acp/native-commands.ts`: the `'file '` → `'file'` branch before the question fall-through.

No web source, roles-file, or tool-table change.

## Tests

Existing tests that break and must be updated in the same commit:

- `src/acp/native-commands.test.ts`, "publishes the ordered command vocabulary": append `'file read'` to the expected list.
- `src/application-commands.test.ts`, "lists the file command as a parentless builtin that owns file read input" (line ~78): keep the builtin `file` assertions (forms `['file']`, no parent), but `resolveApplicationCommand('file read a.md')` now matches `{ name: 'file read', kind: 'native', forms: ['file read'] }`; add that `resolveApplicationCommand('file')` is still the builtin `file` row. Rename the case to say the native row owns `file read` input.

New cases:

- `src/acp/native-commands.test.ts`:
  - add `['file read notes/a.md', 'file']` to the `it.each` table (it checks `nativeCommandTool`, `isNativeCommand`, and `nativeCommandName`);
  - in the rejection case: `file`, `file readme x`, and `files x` give `undefined` from `nativeCommandName`.
- `src/application-commands.test.ts`, "keeps native tool and parent relationships explicit": the `file read` row matches `{ kind: 'native', parent: 'file', nativeTool: 'file' }`. Sorting is already covered by the first case.
- `src/native-commands/policy.test.ts`: with a literal snapshot whose `file read` row has `effectiveEnabled: false`, `disabledApplicationCommand('file read a.md', …)` returns the `file read` row and `disabledApplicationCommand('file', …)` returns `undefined`.
- `src/plugins/roles/command-policy.test.ts` (uses a real `NativeCommandSettingsManager` via `snapshotWith`): `{ 'file read': { enabled: false } }` maps to `{ 'file read': 'application-wide' }`, and `{ file: { enabled: false } }` also maps to `{ 'file read': 'application-wide' }` through the parent.
- `web/src/shared/command-availability.parity.test.ts`: add `'file read a.md'` and `'file'` to `INPUTS` so the client matcher agrees with the server on the new row.

No new test is needed for the commands-tab guard: `src/plugins/commands/domains.test.ts` already iterates `APPLICATION_COMMAND_NATIVE_TOOLS` and asserts every tool is accepted. Roles tests need no count update: `src/plugins/roles/activate.test.ts` compares against `NATIVE_ACP_COMMANDS` itself, and role files accept any command string (`decodeRole` in `src/plugins/roles/roles-file.ts`), so there is no vocabulary validation to extend. `src/plugins/roles/roles-file.test.ts`'s default grants stay unchanged until subplan 9.

## Out of scope

The tool-table `file` entry, its primer slice, and the `tool-table.test.ts` expectation change (subplan 8). The agent-kind gate (subplan 7). Default grants (subplan 9). The roles spec's command count and user docs (subplan 26).

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then, by hand:
- open the commands tab and confirm a `file read` row with an Agent access checkbox, nested under `file`;
- uncheck **Enabled** on `file read`, type `file read README.md` in a tab, and confirm `Command is disabled: file read.`; confirm bare `file` still prints the usage line; re-check it;
- open the roles tab and confirm **Add command** offers `file read`, listed last.
