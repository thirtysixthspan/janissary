# File glob 8 — `file glob` as a native ACP command for `ask` and `tell`

**Complexity: 6/10** — ~12 added lines across 5 files, but 12 requirements and 20 test scenarios, several of them existing pins that the vocabulary change breaks (p=5.84)

Run order: 8 of 9 in the file glob series. Source plan: `product/plans/complete/file-glob.md`. Depends on subplan 1 (`FILE_GLOB_PRIMER`, `isFileGlobCommandLine` in `src/file-glob/command.ts`), subplan 4 (`globWorkspaceCommand` in `src/file-glob/glob.ts`), and subplan 7 (`globFilesInTab` in `src/file-glob/tab-glob.ts`, and the agent-run refusal already in `gateAgentCommand` in `src/acp/tool-table.ts`). All three have landed on this branch. Subplan 9 (completion) does not depend on this one and is out of scope.

This subplan lets an autonomous ACP agent use `file glob`. The vocabulary entry, the default grants, the tool table, and the two loop `runWorkspace` branches land together in one change, because the vocabulary entry alone would let the gate pass a glob that the loop then hands to the read fallback (`readFileInTab` would answer `Usage: file read …`).

## Design decisions

All from the source plan, plus the subplan decisions marked as such:

- `file glob` is a native ACP command, added to `NATIVE_ACP_COMMANDS` in `src/plugins/roles/shared.ts` right after `'file read'`. The built-in `ask` and `tell` command lists in `src/plugins/roles/roles-file.ts` (the `commands:` arrays of the `name: 'ask'` and `name: 'tell'` entries) add `'file glob'` right after `'file read'`, so ask grants eight commands (seven today) and tell grants thirteen (twelve today). Saved roles files are not changed. `ROLES_PAYLOAD_SCHEMA_VERSION` stays at 4, because the payload's shape doesn't change, only the vocabulary's contents.
- Authorization is by native command name, exactly like `file read`: `gateCoreCommand` in `src/acp/tool-table.ts` grants or refuses `file glob` with the existing `Command is disabled: file glob.` and `Command not allowed for role "<role>": file glob.` refusals, with no code change there — today `nativeCommandName('file glob …')` returns `undefined` and the gate throws; once the vocabulary entry exists it returns `'file glob'`. There is no per-pattern rule and no new resource field; the pattern is visible in the full command text that the tool transcript entry and the connection record's `tool` activity lines already carry.
- `gateAgentCommand` already refuses `isFileGlobCommandLine` input (subplan 7.1). Do not touch it.
- No change in `src/acp/native-commands.ts`: `nativeCommandTool` already maps any `file ` name to the `file` owner. No change in `src/file-write/command.ts`: `describeLoopCommand` returns a glob command unchanged because its `extractArgument` only matches `write|edit`, so the follow-up reads ``Output of `file glob <pattern> …`:``.
- The Commands tab gains a `file glob` row with no edit, because `buildApplicationCommands` in `src/application-commands.ts` (the `for (const name of NATIVE_ACP_COMMANDS)` loop) adds one native row per vocabulary entry, with parent `file` and `nativeTool: 'file'`. Consequence (subplan decision, stated so the spec matches): a typed `file glob …` now resolves to that native row through `resolveApplicationCommand`, so `disabledApplicationCommand` in `src/native-commands/policy.ts` refuses a typed `file glob` when the `file glob` row is disabled, exactly as it already does for `file read`; disabling `file` still disables it through the parent. `commandRestrictionsFrom` in `src/plugins/roles/command-policy.ts` picks it up from `NATIVE_ACP_COMMANDS` with no edit.
- `src/acp/tool-table.ts`: the `file` entry's `isCommandLine` becomes read-or-glob-or-mutation (add `isFileGlobCommandLine(line)` to the existing `isFileReadCommandLine(line) || isFileMutationCommandLine(line)`; `isFileGlobCommandLine` is already imported for the agent gate). `filePrimer(allowed)` gains a middle element: `FILE_GLOB_PRIMER` when `allowed.includes('file glob')`, placed after the read element and before the mutation element, so the existing `join('\n\n')` gives the blank-line separation. Add `FILE_GLOB_PRIMER` to the existing `../file-glob/command.js` import. A role granting only `file glob` gets the file tool (its owner filter already passes any `file ` grant) with only the glob primer.
- The loop runs it on the workspace (`runsOn: 'workspace'`, unchanged), against the workspace of the host running the loop.
  - `src/acp/run-prompt.ts` `runWorkspace` (today: `if (isFileMutationCommandLine(command.trim().replace(/^\//, ''))) return mutateFileInTab(…)`, else `readFileInTab(managers, label, command)`): hoist the normalized line into a local `const normalized = command.trim().replace(/^\//, '')` as `serve-acp-loop.ts` already does, test both the mutation and the new glob branch against `normalized`, and put the glob branch after the mutation branch and before the read fallback: `isFileGlobCommandLine(normalized)` → `globFilesInTab(managers, label, command)`. Pass the original `command` to the runner, as the two neighbors do (the core gate never lets a `/`-led line through, because `nativeCommandName` does not strip the slash). Import `globFilesInTab` from `../file-glob/tab-glob.js` and `isFileGlobCommandLine` from `../file-glob/command.js`.
  - `src/remote/serve-acp-loop.ts` `runWorkspace` (today: mutation → `runFileMutation(new LocalFileSystemPort(), workspaceDir, normalized)`, else `readWorkspaceCommand(workspaceDir, normalized)`): add `isFileGlobCommandLine(normalized)` → `globWorkspaceCommand(workspaceDir, normalized)` after the mutation branch and before the read fallback. Import `globWorkspaceCommand` from `../file-glob/glob.js` and `isFileGlobCommandLine` from `../file-glob/command.js`.
  - The third `runWorkspace`, in `src/agent/execute.ts`, is left alone: `gateAgentCommand` refuses an agent's glob before it reaches the host.
- In a remote ACP loop, the workspace step is tagged `[<host>] ` like every other workspace step; this needs no new code, because `tagged` in `run-prompt.ts` already tags every step reported with `workspace: true` in a remote session. A remote session never calls `globFilesInTab` locally: the far side's `runWorkspace` runs it.

## What already exists (reuse, don't rebuild)

| Piece | Where | Use |
| --- | --- | --- |
| `NATIVE_ACP_COMMANDS` | `src/plugins/roles/shared.ts` | The vocabulary. |
| Default `ask` and `tell` roles | `src/plugins/roles/roles-file.ts` | The grant lists. |
| `createAcpToolTable`, `filePrimer` | `src/acp/tool-table.ts` | The file tool entry and its composed primer. |
| `FILE_GLOB_PRIMER`, `isFileGlobCommandLine` | `src/file-glob/command.ts` | Primer text and the line predicate. |
| `globFilesInTab(managers, label, input)` | `src/file-glob/tab-glob.ts` | Local loop's glob runner: tab root, or the remote tab port. |
| `globWorkspaceCommand(root, input)` | `src/file-glob/glob.ts` | Far-side loop's glob runner. |
| `runCorePrompt` host | `src/acp/run-prompt.ts` | Local loop's workspace runner. |
| `startRemoteLoop` host | `src/remote/serve-acp-loop.ts` | Far-side loop's workspace runner. |
| `buildApplicationCommands` | `src/application-commands.ts` | Adds the row automatically. |
| `tagged` | `src/acp/run-prompt.ts` | Remote workspace-step tag. |

## Proposed changes

Production code (lint-counted sizes today, all stay well under 200: `shared.ts` 144, `roles-file.ts` 189, `tool-table.ts` 112, `run-prompt.ts` 131, `serve-acp-loop.ts` 104; no extraction needed):

- `src/plugins/roles/shared.ts`: insert `'file glob'` after `'file read'`.
- `src/plugins/roles/roles-file.ts`: insert `'file glob'` after `'file read'` in the `ask` and `tell` lists. At 189 lines, add at most one line (wrap the tell list onto its existing third line if it gets long); do not restructure the file.
- `src/acp/tool-table.ts`: extend the file entry's `isCommandLine` and `filePrimer` as above.
- `src/acp/run-prompt.ts` and `src/remote/serve-acp-loop.ts`: the glob branches as above.

Specs (architecture principle 10 — same change):

- `product/specs/acp.md`:
  - `### File glob`: replace the sentence "In this version it is typed-only: an agent run's `janissary file glob …` is refused rather than run." with: it is also a native ACP command a role can grant, granted by default to `ask` and `tell`; an agent run's `janissary file glob …` is still refused. Add the exact primer text (the four lines of `FILE_GLOB_PRIMER` in `src/file-glob/command.ts`, quoted in a fenced block like the read primer under `### File read`), its placement after the read primer and before the mutation primer, the authorization rule (by command name, with the disabled and role refusals; no per-pattern rule), that the loop's workspace step runs against the workspace of the host running the loop (`globFilesInTab` locally, `globWorkspaceCommand` on the far side), and that a remote loop's step is tagged `[<host>] ` while a typed glob stays untagged (the existing last sentence).
  - The `### File read` default-grant sentence ("ask grants seven commands and tell grants twelve, including `file write` and `file edit`") becomes eight and thirteen, including `file glob`, `file write`, and `file edit`.
  - The `### File read` sentence introducing the read primer ("the full primer, which adds the mutation primer when a write or edit is granted") also names the glob primer.
  - The File write and edit tools paragraph ("`file write` and `file edit` are native commands, listed after `file read`…"): they are now listed after `file glob`; the file tool is included when a role grants any of the four; the composition is read primer, then glob primer, then mutation primer, each separated by a blank line.
  - The routing paragraph that names `readFileInTab` and `readWorkspaceCommand` as the workspace routes (the "`browser …`, `question …`, and `db sqlite …` commands are caller-side" paragraph) also names `file glob` going to `globFilesInTab` locally and `globWorkspaceCommand` on the far side.
- `product/specs/roles.md`: add `file glob` after `file read` in the `ask` grant list; "all twelve native commands: those seven plus …" becomes "all thirteen native commands: those eight plus …"; "hidden when all twelve native commands are present" becomes thirteen; keep the note that an existing roles file is unchanged.
- `product/specs/application-commands.md`: the native `file` rows become `file read`, `file glob`, `file write`, and `file edit`; disabling `file` disables all four; disabling `file glob` refuses the typed `file glob` as well as the agent tool, like `file write`.

User docs (subplan decision — the source plan names only specs, but these pages state the counts and grants this change alters):

- `help/tell.md`: "all twelve native commands" becomes thirteen, and the file list reads "file read, glob, write, and edit".
- `help/ask.md`: the default ask role's capabilities add finding workspace files by path.
- `documentation/user-documentation/tab-types/roles.md`: Ask's default capabilities add finding files by path; "When all twelve native commands are granted" becomes thirteen.
- `documentation/user-documentation/advanced-agents/acp-agent.md` ("In a workspace or on another host"): `file glob` searches the same workspace as `file read` on the host running the agent, and a typed `file glob` carries no tag like the other typed file commands.

## Tests

New behavior:

- `src/acp/native-commands.test.ts`: the `publishes the ordered command vocabulary` expectation has `'file glob'` right after `'file read'`; add `['file glob **/*.ts', 'file']` to the tool-mapping `it.each`.
- `src/plugins/roles/roles-file.test.ts`: the default `ask` and `tell` list expectations (the `'question ask', 'question approve', 'file read',` lines) gain `'file glob'` after `'file read'`; add a case that a saved `ask`/`tell` role without `file glob` is left untouched on disk, beside `leaves an existing ask and tell role without file read untouched on disk`.
- `src/acp/ask-role.test.ts`: `ASK_COMMANDS` gains `'file glob'` after `'file read'`; `expect(tell).toHaveLength(12)` becomes 13 and the `arrayContaining` check includes `'file glob'`.
- `src/application-commands.test.ts`: a `file glob` native row with `parent: 'file'` and `nativeTool: 'file'`, beside the `file read`/`file edit` assertions; `resolveApplicationCommand('file glob *.ts')?.name` is `file glob`.
- `src/native-commands/policy.test.ts`: a disabled `file glob` row refuses `disabledApplicationCommand('file glob *.ts', …)` without disabling bare `file`, mirroring `refuses a disabled file read row without disabling bare file`.
- `src/plugins/roles/command-policy.test.ts`: `follows a disabled file parent into every file command` now expects `'file glob': 'application-wide'` too.
- `src/acp/tool-table.test.ts`:
  - `keeps the existing table order and appends the canonical allow-list` (full vocabulary) expects the file element as read, glob, and mutation primers joined by blank lines; import `FILE_GLOB_PRIMER` from `../file-glob/command.js`.
  - Beside `includes mutation primer text only when a mutation is granted`: `fileTool(['file glob'])!.primer` is exactly `FILE_GLOB_PRIMER`; `['file read', 'file glob', 'file edit']` gives read, glob, mutation in that order; `['file read']` contains no glob text.
  - `selects the file tool for any file grant` adds `'file glob'` to its grant loop.
  - The extractor finds a trailing `file glob **/*.ts` line on a table granted `file glob`, and returns null on a table without the file entry.
  - The core gate refuses an ungranted `file glob x` with the role refusal and no `refused` key, refuses a disabled one with the disabled refusal and `refused: 'disabled'`, and returns `{ runsOn: 'workspace' }` for a granted one — mirroring `refuses an ungranted mutation`, `refuses a disabled file write…`, and `routes a granted mutation to the workspace`. The existing agent-glob refusal tests stay as they are.
- `src/acp/run-prompt.test.ts`: add `globFilesInTab` to the `vi.hoisted` mocks and `vi.mock('../file-glob/tab-glob.js', …)` wrapping the actual function, as `readFileInTab` is wrapped at the top of the file. A granted `file glob *.txt` step on a local tab whose workspace is a temporary directory calls `globFilesInTab(expect.anything(), 'shell', <command>)`, returns the matching path, and does not call `readFileInTab` or `mutateFileInTab` (mirror `runs a granted file write through the tab runner…`). In a remote session, a `file glob` step reported with `workspace: true` is tagged `[far] ` on the transcript and record lines and `globFilesInTab` is not called locally (mirror `tags a remote tab's workspace step…`).
- `src/remote/serve-acp-loop.test.ts`: a granted `file glob *.md` step, with `coreSnapshot('tell', ['file glob'])` and a file written into the temporary `workspace`, is sent as `{ type: 'acp-tool-step', command: 'file glob *.md', result: 'a.md', workspace: true }`. The glob is asynchronous (it walks the tree and asks git for ignored paths, which fails soft outside a repository), so await the step frame with the file's existing `flush` helper rather than asserting synchronously as the file-read test does.

## Verification

- `$janissary/scripts/run.mjs check-diff` after the change; it covers the server tests above. No web test hard-codes the vocabulary: `RolesTab.test.tsx` and `roles-dnd.test.tsx` spread `NATIVE_ACP_COMMANDS`, and `CommandsTab.test.tsx` builds its own rows.
- Manual, ACP: open an `ask` session, ask it to list the plan files under `product/plans/complete` whose names mention `editor`, and confirm it emits one `file glob` line and receives the matching paths. Then open the Commands tab, confirm a `file glob` row under `file`, disable it, and confirm a typed `file glob *.md` is refused and the next ask prompt's glob gets `Command is disabled: file glob.`.

## Out of scope

Completion (subplan 9). `file glob` for `agent` runs stays refused (subplan 7.1; `gateAgentCommand` is not touched). Per-pattern authorization, a resource field, and the backlog's "pattern as resource identifier" idea. Migrating saved roles files.
