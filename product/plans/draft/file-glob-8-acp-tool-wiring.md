# File glob 8 — `file glob` as a native ACP command for `ask` and `tell`

**Complexity: 5/10** — ~12 added lines, 5 files edited, 10 requirements, 14 test scenarios (p=5.60)

Run order: 8 of 9 in the file glob series. Source plan: `product/plans/complete/file-glob.md`. Depends on subplan 1 (`FILE_GLOB_PRIMER`, `isFileGlobCommandLine`), subplan 4 (`globWorkspaceCommand`), and subplan 7 (`globFilesInTab` and the agent-run refusal).

This subplan lets an autonomous ACP agent use `file glob`. The vocabulary entry, the default grants, the tool table, and the two loop `runWorkspace` branches land together, because the vocabulary entry alone would let the gate pass a glob that the loop then hands to the read fallback.

## Design decisions

All from the source plan:

- `file glob` is a native ACP command, added to `NATIVE_ACP_COMMANDS` right after `file read`. The built-in `ask` and `tell` command lists in `src/plugins/roles/roles-file.ts` add `file glob` right after `file read`, so ask grants eight commands and tell grants thirteen. Saved roles files are not changed. `ROLES_PAYLOAD_SCHEMA_VERSION` stays at 4, because the payload's shape doesn't change, only the vocabulary's contents.
- Authorization is by native command name, exactly like `file read`: the gate grants or refuses `file glob` with the existing disabled and role refusals. There is no per-pattern rule and no new resource field; the pattern is visible in the full command text that the tool transcript entry and the connection record's `tool` activity lines already carry.
- No change in `src/acp/native-commands.ts`: `nativeCommandTool` already maps any `file ` name to the `file` owner. The Commands tab gains a `file glob` row with no edit, because `buildApplicationCommands` in `src/application-commands.ts` adds one native row per vocabulary entry, with parent `file`.
- `src/acp/tool-table.ts`: the `file` tool's `isCommandLine` also accepts `isFileGlobCommandLine`, so the extractor recognizes a trailing `file glob` line; `filePrimer` inserts `FILE_GLOB_PRIMER` after the read primer and before the mutation primer when `file glob` is granted, each part separated by a blank line. A role granting only `file glob` gets the file tool with only the glob primer.
- The loop runs it on the workspace (`runsOn: 'workspace'`), against the workspace of the host running the loop. `runWorkspace` in `src/acp/run-prompt.ts` (mutation → `mutateFileInTab`, else `readFileInTab`) gains a glob branch to `globFilesInTab` ahead of the read fallback. `runWorkspace` in `src/remote/serve-acp-loop.ts` (mutation → `runFileMutation`, else `readWorkspaceCommand`) gains a glob branch to `globWorkspaceCommand(workspaceDir, normalized)`. Both test the normalized line (trimmed, leading `/` removed), as the mutation test does.
- In a remote ACP loop, the workspace step is tagged `[<host>] ` like every other workspace step; this needs no new code, because `tagged` in `run-prompt.ts` already tags every workspace step.

## What already exists (reuse, don't rebuild)

| Piece | Where | Use |
| --- | --- | --- |
| `NATIVE_ACP_COMMANDS` | `src/plugins/roles/shared.ts` | The vocabulary. |
| Default `ask` and `tell` roles | `src/plugins/roles/roles-file.ts` | The grant lists. |
| `createAcpToolTable`, `filePrimer` | `src/acp/tool-table.ts` | The file tool entry and its composed primer. |
| `runCorePrompt` host | `src/acp/run-prompt.ts` | Local loop's workspace runner. |
| `startRemoteLoop` host | `src/remote/serve-acp-loop.ts` | Far-side loop's workspace runner. |
| `buildApplicationCommands` | `src/application-commands.ts` | Adds the row automatically. |

## Proposed changes

- `src/plugins/roles/shared.ts`: insert `'file glob'` after `'file read'`.
- `src/plugins/roles/roles-file.ts`: insert `'file glob'` after `'file read'` in the `ask` and `tell` lists.
- `src/acp/tool-table.ts`: extend the file entry's `isCommandLine` and `filePrimer` as above.
- `src/acp/run-prompt.ts` and `src/remote/serve-acp-loop.ts`: the glob branches.
- `product/specs/acp.md`: in `### File glob`, add the exact primer text, its placement after the read primer and before the mutation primer, the authorization rule, the remote-loop tag, and that the workspace step runs on the host running the loop. Update the default-grant sentence (ask eight, tell thirteen), the File write and edit paragraph that lists the file tool's commands and its primer composition, and the paragraph that names `readFileInTab` and `readWorkspaceCommand` as the workspace routes so it also names `globFilesInTab` and `globWorkspaceCommand`.
- `product/specs/roles.md`: add `file glob` to the `ask` and `tell` default grants, change "all twelve native commands" to thirteen in both places, and keep the note that an existing roles file is unchanged.
- `product/specs/application-commands.md`: the native `file` rows become `file read`, `file glob`, `file write`, and `file edit`, and disabling `file` disables all four.

## Tests

- `src/acp/native-commands.test.ts`: the published vocabulary has `file glob` right after `file read`; `file glob **/*.ts` maps to the `file` tool.
- `src/plugins/roles/roles-file.test.ts` and `src/acp/ask-role.test.ts`: the default `ask` has eight commands and `tell` thirteen, each with `file glob` right after `file read` (the `toHaveLength(12)` pin becomes 13); a saved role without `file glob` is left untouched.
- `src/application-commands.test.ts`: a `file glob` native row with parent `file` and tool `file`; `resolveApplicationCommand('file glob *.ts')` resolves to `file glob`.
- `src/acp/tool-table.test.ts`: the glob primer appears after the read primer and before the mutation primer when all are granted, alone when only `file glob` is granted, and is absent when not granted; the file tool is selected for a `file glob` grant; the extractor finds a trailing `file glob` line; the core gate refuses an ungranted glob with the role refusal and a disabled one with the disabled refusal, and routes a granted one to the workspace.
- `src/acp/run-prompt.test.ts`: a granted `file glob` step runs through `globFilesInTab` against the tab's root and its result is fed back; a remote session's step is tagged.
- `src/remote/serve-acp-loop.test.ts`: a granted `file glob` step runs `globWorkspaceCommand` against the far-side workspace and is sent as a workspace `acp-tool-step`.

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- Manual, ACP: open an `ask` session, ask it to list the plan files under `product/plans/complete` whose names mention `editor`, and confirm it emits one `file glob` line and receives the matching paths.

## Out of scope

Completion (subplan 9). `file glob` for `agent` runs stays refused (subplan 7). Per-pattern authorization, a resource field, and the backlog's "pattern as resource identifier" idea.
