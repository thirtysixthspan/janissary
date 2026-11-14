# File glob 8.2 — `file glob` in the native vocabulary and the file tool

**Complexity: 4/10** — ~4 added lines in 2 files, but 9 requirements and 18 test scenarios, most of them existing pins the vocabulary change breaks (p=5.11)

Run order: piece 2 of 3 of file glob subplan 8, which is 8 of 9 in the file glob series. Subplan 8 is recorded whole in `product/plans/complete/file-glob-8-acp-tool-wiring.md`; the feature's canonical plan is `product/plans/complete/file-glob.md`. Depends on piece 1 (`product/plans/draft/file-glob-8-acp-tool-wiring-1-loop-routing.md`: both loop `runWorkspace` hosts route a glob line) and on subplan 1 (`FILE_GLOB_PRIMER`, `isFileGlobCommandLine`). Piece 3 (`product/plans/draft/file-glob-8-acp-tool-wiring-3-default-grants-and-docs.md`) depends on this one.

This piece makes `file glob` a native ACP command a role can grant, and makes the file tool recognize and advertise it, in one change. The vocabulary entry and the file tool change must land together: with the vocabulary entry alone, a role granting `file glob` would select the file tool and name `file glob` in the allow-list line while the tool's `isCommandLine` rejects glob lines and the primer says nothing about them; with the tool change alone, nothing could grant it (`createAcpToolTable` and `toolPrimer` filter grants through `NATIVE_ACP_COMMANDS`, and `toolExtractor` requires `nativeCommandName` to recognize the line), so the change would be dead code its tests could not reach. With both, a granting role gets the primer, the extractor finds the line, the gate passes it, and piece 1's routing runs it. The built-in `ask` and `tell` defaults do not grant it until piece 3.

## Design decisions

From the source plan:

- `file glob` is a native ACP command, added to `NATIVE_ACP_COMMANDS` in `src/plugins/roles/shared.ts` right after `'file read'`. `ROLES_PAYLOAD_SCHEMA_VERSION` stays at 4, because the payload's shape doesn't change, only the vocabulary's contents.
- Authorization is by native command name, exactly like `file read`: `gateCoreCommand` in `src/acp/tool-table.ts` grants or refuses `file glob` with the existing `Command is disabled: file glob.` and `Command not allowed for role "<role>": file glob.` refusals, with no code change there: today `nativeCommandName('file glob …')` returns `undefined` and the gate throws; once the vocabulary entry exists it returns `'file glob'`. There is no per-pattern rule and no new resource field; the pattern is visible in the full command text that the tool transcript entry and the connection record's `tool` activity lines already carry.
- `gateAgentCommand` already refuses `isFileGlobCommandLine` input (subplan 7.1). Do not touch it.
- No change in `src/acp/native-commands.ts`: `nativeCommandTool` already maps any `file ` name to the `file` owner. No change in `src/file-write/command.ts`: `describeLoopCommand` returns a glob command unchanged because its `extractArgument` only matches `write|edit`, so the follow-up reads ``Output of `file glob <pattern> …`:``.
- The Commands tab gains a `file glob` row with no edit, because `buildApplicationCommands` in `src/application-commands.ts` (the `for (const name of NATIVE_ACP_COMMANDS)` loop) adds one native row per vocabulary entry, with parent `file` and `nativeTool: 'file'`. Consequence (subplan decision, stated so the spec matches): a typed `file glob …` now resolves to that native row through `resolveApplicationCommand`, so `disabledApplicationCommand` in `src/native-commands/policy.ts` refuses a typed `file glob` when the `file glob` row is disabled, exactly as it already does for `file read`; disabling `file` still disables it through the parent. `commandRestrictionsFrom` in `src/plugins/roles/command-policy.ts` picks it up from `NATIVE_ACP_COMMANDS` with no edit.
- `src/acp/tool-table.ts`: the `file` entry's `isCommandLine` becomes read-or-glob-or-mutation (add `isFileGlobCommandLine(line)` to the existing `isFileReadCommandLine(line) || isFileMutationCommandLine(line)`; `isFileGlobCommandLine` is already imported for the agent gate). `filePrimer(allowed)` gains a middle element: `FILE_GLOB_PRIMER` when `allowed.includes('file glob')`, placed after the read element and before the mutation element, so the existing `join('\n\n')` gives the blank-line separation. Add `FILE_GLOB_PRIMER` to the existing `../file-glob/command.js` import. A role granting only `file glob` gets the file tool (its owner filter already passes any `file ` grant) with only the glob primer.
- In a remote ACP loop the glob step is tagged `[<host>] ` by the existing `tagged`; a typed `file glob` stays untagged.

Subplan decisions carried by this piece:

- The spec and doc sentences that describe a granted glob's behavior, the vocabulary, or the vocabulary's size land here (architecture principle 10); the ones that describe the built-in `ask` and `tell` defaults land with the grant change in piece 3.
- Piece 1's two local-run loop tests drove the captured host directly because no granted line could reach it. Now that one can, they are rewritten into the granted-path form below and the host-capture spies piece 1 added are removed if nothing else uses them.

## What already exists (reuse, don't rebuild)

| Piece | Where | Use |
| --- | --- | --- |
| `NATIVE_ACP_COMMANDS` | `src/plugins/roles/shared.ts` | The vocabulary. |
| `createAcpToolTable`, `filePrimer`, `gateCoreCommand`, `toolExtractor` | `src/acp/tool-table.ts` | The file tool entry, its composed primer, the gate, and the extractor. |
| `FILE_GLOB_PRIMER`, `isFileGlobCommandLine` | `src/file-glob/command.ts` | Primer text and the line predicate. |
| `buildApplicationCommands`, `resolveApplicationCommand` | `src/application-commands.ts` | Adds and resolves the row automatically. |
| `disabledApplicationCommand` | `src/native-commands/policy.ts` | Typed refusal for a disabled row. |
| `commandRestrictionsFrom` | `src/plugins/roles/command-policy.ts` | Picks the new name up from the vocabulary. |
| Piece 1's loop routing | `src/acp/run-prompt.ts`, `src/remote/serve-acp-loop.ts` | Runs the gated glob. |

## Proposed changes

Production code (lint-counted sizes today: `shared.ts` 144, `tool-table.ts` 112; both stay well under 200, no extraction needed):

- `src/plugins/roles/shared.ts`: insert `'file glob'` after `'file read'` in `NATIVE_ACP_COMMANDS`.
- `src/acp/tool-table.ts`: extend the file entry's `isCommandLine` and `filePrimer` as above, and add `FILE_GLOB_PRIMER` to the `../file-glob/command.js` import.

Specs:

- `product/specs/acp.md`:
  - `### File glob`: replace the sentence "In this version it is typed-only: an agent run's `janissary file glob …` is refused rather than run." with: it is also a native ACP command a role can grant; an agent run's `janissary file glob …` is still refused. (Piece 3 adds that the built-in `ask` and `tell` roles grant it by default.) Add the exact primer text (the four lines of `FILE_GLOB_PRIMER` in `src/file-glob/command.ts`, quoted in a fenced block like the read primer under `### File read`), its placement after the read primer and before the mutation primer, the authorization rule (by command name, with the disabled and role refusals; no per-pattern rule), that the loop's workspace step runs against the workspace of the host running the loop (`globFilesInTab` locally, `globWorkspaceCommand` on the far side), and that a remote loop's step is tagged `[<host>] ` while a typed glob stays untagged (the existing last sentence).
  - The `### File read` sentence introducing the read primer ("the full primer, which adds the mutation primer when a write or edit is granted") also names the glob primer.
  - The File write and edit tools paragraph ("`file write` and `file edit` are native commands, listed after `file read`…"): they are now listed after `file glob`; the file tool is included when a role grants any of the four; the composition is read primer, then glob primer, then mutation primer, each separated by a blank line.
  - The routing paragraph that names `readFileInTab` and `readWorkspaceCommand` as the workspace routes (the "`browser …`, `question …`, and `db sqlite …` commands are caller-side" paragraph) also names `file glob` going to `globFilesInTab` locally and `globWorkspaceCommand` on the far side.
- `product/specs/roles.md`: "hidden when all twelve native commands are present" becomes thirteen.
- `product/specs/application-commands.md`: the native `file` rows become `file read`, `file glob`, `file write`, and `file edit`; disabling `file` disables all four; disabling `file glob` refuses the typed `file glob` as well as the agent tool, like `file write`.

User docs (subplan decision of the source plan; these pages state the vocabulary size and the granted glob's behavior):

- `documentation/user-documentation/tab-types/roles.md`: "When all twelve native commands are granted" becomes thirteen.
- `documentation/user-documentation/advanced-agents/acp-agent.md` ("In a workspace or on another host"): `file glob` searches the same workspace as `file read` on the host running the agent, and a typed `file glob` carries no tag like the other typed file commands.

## Tests

Existing pins the vocabulary change breaks, and new vocabulary behavior:

- `src/acp/native-commands.test.ts`: the `publishes the ordered command vocabulary` expectation has `'file glob'` right after `'file read'`; add `['file glob **/*.ts', 'file']` to the tool-mapping `it.each`.
- `src/application-commands.test.ts`: a `file glob` native row with `parent: 'file'` and `nativeTool: 'file'`, beside the `file read`/`file edit` assertions; `resolveApplicationCommand('file glob *.ts')?.name` is `file glob`.
- `src/native-commands/policy.test.ts`: a disabled `file glob` row refuses `disabledApplicationCommand('file glob *.ts', …)` without disabling bare `file`, mirroring `refuses a disabled file read row without disabling bare file`.
- `src/plugins/roles/command-policy.test.ts`: `follows a disabled file parent into every file command` now expects `'file glob': 'application-wide'` too.

File tool, in `src/acp/tool-table.test.ts`:

- `keeps the existing table order and appends the canonical allow-list` (full vocabulary) expects the file element as read, glob, and mutation primers joined by blank lines; import `FILE_GLOB_PRIMER` from `../file-glob/command.js`.
- Beside `includes mutation primer text only when a mutation is granted`: `fileTool(['file glob'])!.primer` is exactly `FILE_GLOB_PRIMER`; `['file read', 'file glob', 'file edit']` gives read, glob, mutation in that order; `['file read']` contains no glob text.
- `selects the file tool for any file grant` adds `'file glob'` to its grant loop.
- The extractor finds a trailing `file glob **/*.ts` line on a table granted `file glob`, and returns null on a table without the file entry.
- The core gate refuses an ungranted `file glob x` with the role refusal and no `refused` key, refuses a disabled one with the disabled refusal and `refused: 'disabled'`, and returns `{ runsOn: 'workspace' }` for a granted one, mirroring `refuses an ungranted mutation`, `refuses a disabled file write…`, and `routes a granted mutation to the workspace`. The existing agent-glob refusal tests stay as they are.

Loop integration (rewrites piece 1's host-capture tests into the granted path):

- `src/acp/run-prompt.test.ts`: a granted `file glob *.txt` step on a local tab whose workspace is the temporary directory, run through `deps.runCommand` from a prompt started with a grant list including `file glob`, calls `globFilesInTab(expect.anything(), 'shell', <command>)`, returns the matching path, and does not call `readFileInTab` or `mutateFileInTab` (mirror `runs a granted file write through the tab runner…`). Keep piece 1's branch-order assertions in this form too. Piece 1's remote-tag test stays as it is.
- `src/remote/serve-acp-loop.test.ts`: a granted `file glob *.md` step, with `coreSnapshot('tell', ['file glob'])` and a file written into the temporary `workspace`, driven by an agent reply `file glob *.md` then `Done.`, is sent as `{ type: 'acp-tool-step', command: 'file glob *.md', result: 'a.md', workspace: true }`. Await the step frame with the file's existing `flush` helper (the glob is asynchronous) rather than asserting synchronously as the file-read test does. Remove the `driveToolLoop` capture piece 1 added once no test uses it.

## Verification

- `$janissary/scripts/run.mjs check-diff` after the change; it covers the server tests above. No web test hard-codes the vocabulary: `RolesTab.test.tsx` and `roles-dnd.test.tsx` spread `NATIVE_ACP_COMMANDS`, and `CommandsTab.test.tsx` builds its own rows.
- Manual, Commands tab: open the Commands tab, confirm a `file glob` row under `file`, disable it, and confirm a typed `file glob *.md` is refused. (The ask-session half of the manual check needs the default grant and is piece 3.)

## Out of scope

The default `ask` and `tell` grant lists in `src/plugins/roles/roles-file.ts`, their tests, and the spec and doc sentences about those defaults (piece 3). Completion (subplan 9). `file glob` for `agent` runs stays refused (`gateAgentCommand` is not touched). Per-pattern authorization, a resource field, and the backlog's "pattern as resource identifier" idea. Migrating saved roles files.
