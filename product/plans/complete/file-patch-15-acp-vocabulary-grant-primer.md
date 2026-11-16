# File patch 15: native ACP command, `tell` grant, primer, and follow-up naming

**Complexity: 6/10** — 28 test scenarios across primer composition, gate, follow-up, and both loop hosts, plus 12 requirements, drive it; only ~14 added lines in 5 files (p=6.01)

Run order: 15 of 15 in the `file patch` series. Source plan: `./product/plans/complete/file-patch.md`. Depends on `./product/plans/ready/file-patch-9-command-argument-parser.md` (`describePatchCommand`, and `src/file-patch/command.ts`, the module the primer joins) and `./product/plans/ready/file-patch-14-mutation-predicate-and-help.md` (the widened `isFileMutationCommandLine`, which already routes patch lines on both loop hosts), and through them on every earlier subplan (1 to 13). All of them must land first: today there's no `src/file-patch/` folder, so the new imports wouldn't resolve, and without subplan 14 the file tool's `isCommandLine` doesn't recognize a patch line, so adding the vocabulary entry alone would still never extract one. It depends on no later subplan; it is the last.

This subplan makes `file patch` an agent tool. It adds the native command name that the Commands tab, the roles picker, and the ACP gate all read. It grants it to the built-in `tell` role, teaches it in the file tool's primer, and keeps patch content out of the follow-up prompt. It also brings the specs, help pages, and user docs in line with the finished feature.

## Goal

A `tell` session whose role grants `file patch` sees the patch primer, can end a reply with a `file patch {…}` line, has it gated by its native name and run in the workspace of the host running the loop, and gets back a follow-up prompt naming the patched paths without their content.

## Design decisions

From the source plan:

- **Vocabulary.** `'file patch'` joins `NATIVE_ACP_COMMANDS` in `src/plugins/roles/shared.ts` after `'file edit'` (the last entry today). That's the only change needed for:
  - the Commands tab: `buildApplicationCommands` in `src/application-commands.ts` ("`for (const name of NATIVE_ACP_COMMANDS)`") makes a `native` row named `file patch` with parent `file` and `nativeTool: 'file'`;
  - the roles picker: `src/plugins/roles/activate.ts` publishes `nativeCommands: [...NATIVE_ACP_COMMANDS]`, and the picker offers it after `file edit`;
  - `commandRestrictionsFrom` in `src/plugins/roles/command-policy.ts`, which follows a disabled `file` parent into every file command, `file patch` included;
  - `nativeCommandName` and `nativeCommandTool` in `src/acp/native-commands.ts`, which resolve a `file patch {…}` line to `file patch` and tool `file`. Today `nativeCommandName` returns `undefined` for a patch line, so `toolExtractor` never extracts it and `gateCoreCommand` would throw `No ACP tool matched command`; this entry closes both.
  - the per-row snapshot in `coreSnapshot` (`src/acp/run-prompt.ts`, "`NATIVE_ACP_COMMANDS.map((name) =>`"), which gives the gate a `file patch` row. The remote loop gets the same snapshot, and protocol 44 (subplan 11) guarantees the far side runs the same vocabulary.
- **Default grants.** The built-in `tell` role in `DEFAULT_ROLES` (`src/plugins/roles/roles-file.ts`) grants `file patch` after `file edit`. The built-in `ask` role doesn't. Saved roles files aren't changed and keep the grants they list; `readRolesFile` doesn't migrate them, and nothing here adds a migration. The source plan said tell goes to fourteen, but `file grep` (#2005) already took tell to fourteen, so it goes to fifteen: one more than the count when this lands. If another native command lands first, take one past whatever is current and adjust every count below to match.
- **Authorization.** The ACP gate (`gateCoreCommand` in `src/acp/tool-table.ts`) grants or refuses `file patch` by its native name, like `file write` and `file edit`: `Command is disabled: file patch.` for a disabled or agent-inaccessible row, checked before the role, or `Command not allowed for role "<role>": file patch.` when the role doesn't grant it. No code change is needed beyond the vocabulary entry.
- **Where it runs.** In the ACP loop it's part of the `file` tool, which is `runsOn: 'workspace'`: the workspace of the host running the loop. Locally that's `runWorkspace` in `src/acp/run-prompt.ts` calling `mutateFileInTab` (a local tab's workspace or project directory, or the remote clone when a local fallback session runs on a remote tab). On the far side it's `runWorkspace` in `src/remote/serve-acp-loop.ts` calling `runFileMutation(new LocalFileSystemPort(), workspaceDir, normalized)`, reported as a workspace step that carries the `[<host>] ` tag. Subplan 14 already routes both; no code change here.
- **Cancellation.** A patch isn't cancellable once it starts; an ACP cancel suppresses only its late result and the next provider turn, as for write and edit. Locally, `runWorkspace` throws `ACP: prompt cancelled.` when `active()` is false, so a step that hasn't started never runs. On both hosts the loop drops a late result (`if (dependencies.signal?.aborted) return;` after `runCommand` in `src/acp/loop.ts`, and `dropLateRejection` in `src/acp/drive-loop.ts`). The far-side `runWorkspace` has no `aborted()` check of its own; that's existing behavior for write and edit and isn't changed here. No code change.
- **Primer.** `FILE_PATCH_PRIMER` in `src/file-patch/command.ts` is exactly these five lines, joined with `\n`:
  - `To change several files in one step, end your reply with one line:`
  - `file patch {"patchText":"<patch>"}`
  - ``The patch is applied all-or-nothing. Inside it: `*** Add File: <path>` then the new content with every line prefixed by `+`; `*** Delete File: <path>` with no body; `*** Update File: <path>`, optionally `*** Move to: <new path>`, then hunks: an `@@` line (optionally `@@ <a line that comes before the change>`) followed by lines starting with ` ` (unchanged context), `-` (removed), or `+` (added). Give about 3 context lines around each change.``
  - `Example: file patch {"patchText":"*** Begin Patch\n*** Update File: src/a.ts\n@@\n const a = 1;\n-const b = 2;\n+const b = 3;\n*** Delete File: old.txt\n*** End Patch"}`. The `\n` sequences are literal backslash-n characters in the primer, written with `String.raw` as `FILE_MUTATION_PRIMER` (`src/file-write/command.ts`) does for its example line.
  - ``A patch answers `Patched <n> files:` followed by one `A`/`M`/`D`/`R` row per file.``
- **Primer placement.** `filePrimer` in `src/acp/tool-table.ts` appends `FILE_PATCH_PRIMER` as its own block, separated by a blank line, when `file patch` is in `allowed`. It comes after the mutation primer, or after the last of the read, glob, and grep primers when neither write nor edit is granted, and it stands alone when `file patch` is the only file grant. That's the natural result of adding it as the last entry of the list `filePrimer` already builds; the mutation primer's condition (`file write` or `file edit`) is unchanged, so granting only patch doesn't add the write/edit text.
- **Follow-up prompt.** `describeLoopCommand` in `src/file-write/command.ts` delegates to `describePatchCommand` for a patch line, so the prompt that feeds a patch's result back to the agent names it as `file patch <path>, <path>, …` (a Move as `<old> -> <new>`), or bare `file patch` when the JSON or patch text is malformed. `driveToolLoop` in `src/acp/drive-loop.ts` already passes `describeCommand: describeLoopCommand`, on both hosts, since the far side runs `driveToolLoop` too. History, transcripts, and recordings keep the full command. Without the delegation, `describeLoopCommand` returns any line its `extractArgument` doesn't match unchanged, so the whole patch text would be fed back.

Decided here:

- **Delegation shape.** `describeLoopCommand` checks `isFilePatchCommandLine(command)` first and returns `describePatchCommand(command)`. Its existing write and edit behavior is unchanged. In `src/file-write/command.ts` that's one added line, plus `describePatchCommand` added to the existing `../file-patch/command.js` import that subplan 14 introduced. The file is at about 115 counted lines after subplan 14, so there's room. `src/file-patch/command.ts` doesn't import `src/file-write/command.ts`, so no cycle.
- **Primer location and imports.** `FILE_PATCH_PRIMER` is exported from `src/file-patch/command.ts`, next to subplan 9's exports (about 8 lines; the file stays far under 200). `src/acp/tool-table.ts` imports it from `../file-patch/command.js`, as it imports `FILE_MUTATION_PRIMER` from `../file-write/command.js`. `src/file-patch/command.ts` imports nothing from `src/acp/`, so no cycle. `tool-table.ts` is at about 116 counted lines.
- **Grant line.** Append `'file patch'` after `'file edit'` in tell's `commands` array in `DEFAULT_ROLES`. `roles-file.ts` is at about 189 counted lines, so append it to the existing last line of that array (`'file glob', 'file grep', 'file write', 'file edit',`) rather than adding a line; don't reformat the array.
- **Typed command row.** Once `file patch` is a native row, the typed `file patch` resolves to its own row for the disabled check (`disabledApplicationCommand` in `src/native-commands/policy.ts`, used by `disabledCommandMessage` in `src/native-commands/dispatch-policy.ts`), so disabling only `file patch` refuses the typed command with `Command is disabled: file patch.` too, as disabling `file grep` does for typed grep. `file patching x` still resolves to no `file patch` row. Subplan 14 deliberately left this gap for this subplan. No code change; it's covered by a test and the spec.
- **The allow-list sentence.** `toolPrimer` and `corePrimer` (`src/acp/drive-loop.ts`) list allowed commands in vocabulary order, so `file patch` appears last in `Only these commands are allowed: …` when granted, with no extra change.
- **Spec placement.** In `product/specs/acp.md`, add a `### File patch tool` subsection after `### File write and edit tools` and before `## Remote connections`, rather than rewriting the write/edit paragraphs. Elsewhere in `acp.md`, extend the existing file-command lists in place (see Proposed changes).

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Native vocabulary | `NATIVE_ACP_COMMANDS` in `src/plugins/roles/shared.ts` | The new name; every consumer listed under Vocabulary picks it up. |
| Commands-tab rows | `buildApplicationCommands` in `src/application-commands.ts` | Derives the `file patch` row and its `file` parent. |
| Default roles | `DEFAULT_ROLES` (built-in `tell`) in `src/plugins/roles/roles-file.ts` | The new grant. |
| Tool table and gate | `createAcpToolTable`, `filePrimer`, `gateCoreCommand`, `toolExtractor` in `src/acp/tool-table.ts` | Primer composition. The gate and extractor need no change. |
| Mutation primer | `FILE_MUTATION_PRIMER` in `src/file-write/command.ts` | Style model for `FILE_PATCH_PRIMER` (`String.raw` for literal `\n`). |
| Follow-up description | `describeLoopCommand` in `src/file-write/command.ts`; `describePatchCommand`, `isFilePatchCommandLine` in `src/file-patch/command.ts` (subplan 9) | The delegation. |
| Loop hosts | `runWorkspace` in `src/acp/run-prompt.ts` and `src/remote/serve-acp-loop.ts` | Already route patch lines after subplan 14. |
| Test models | "includes mutation primer text only when a mutation is granted" and the gate cases in `describe('file mutation tools')` (`src/acp/tool-table.test.ts`); `describe('runCorePrompt file mutations')` (`src/acp/run-prompt.test.ts`); `describe('startRemoteLoop workspace mutations')` (`src/remote/serve-acp-loop.test.ts`); "names a file write by path in the follow-up but records the full command" (`src/acp/drive-loop.test.ts`); "leaves a saved ask and tell role with the previous default grants untouched on disk" (`src/plugins/roles/roles-file.test.ts`); "disables only file grep when file grep is disabled" (`src/native-commands/policy.test.ts`); the `describe('FILE_MUTATION_PRIMER')` example-parses case (`src/file-write/command.test.ts`) | Shape of every new case below. |

## Proposed changes

Code:

- `src/plugins/roles/shared.ts`: `'file patch'` after `'file edit'`.
- `src/plugins/roles/roles-file.ts`: tell's commands gain `'file patch'` after `'file edit'`.
- `src/file-patch/command.ts`: export `FILE_PATCH_PRIMER`.
- `src/acp/tool-table.ts`: import `FILE_PATCH_PRIMER`; `filePrimer` appends it when `file patch` is in `allowed`.
- `src/file-write/command.ts`: `describeLoopCommand` delegates for patch lines.

Specs:

- `product/specs/acp.md`:
  - `## Autonomous tool loop`: the sentence "The file owner covers `file read`, `file glob`, `file grep`, `file write`, and `file edit`" names `file patch` too; the caller-side paragraph's "A granted `file write` or `file edit` likewise skips the dispatcher" names `file patch`.
  - `### File read`: "tell grants fourteen, including … `file write`, and `file edit`" becomes fifteen, including `file patch`.
  - `### File write and edit tools`: "included when a role grants any of the five" becomes "any of the six" and names `file patch`; the tagging paragraph's list of untagged typed commands gains `file patch`.
  - New `### File patch tool`: a native command after `file edit`, granted by built-in tell (fifteen) and not ask, saved roles unchanged; the primer's exact five lines and their placement, including patch-only grants; gate refusals by native name with both lines and the disabled-before-role order; one patch is one step toward the eight-step cap; runs on the workspace of the host running the loop through the typed command's runner, and a remote-hosted loop runs it on the remote machine as a tagged workspace step that never crosses to the caller; not cancellable once started, late result and next turn suppressed, a step cancelled before it starts changes nothing; follow-up naming `file patch <path>, <old> -> <new>, …` or bare `file patch`, with history, transcripts, and recordings keeping the full command; the autonomous agent path refuses it (as `agent-command.md` already says after subplan 14).
- `product/specs/application-commands.md`: the native rows sentence lists `file patch` after `file edit`, adds that disabling `file patch` refuses the typed `file patch` as well as the agent tool, and "disabling `file` disables all five" becomes "all six".
- `product/specs/roles.md`: "The `tell` role grants all fourteen native commands: those nine plus … `file write`, and `file edit`" becomes fifteen with `file patch`; "hidden when all fourteen native commands are present" becomes fifteen.

Help and user docs (no file paths or function names in user docs, per `ai/guidelines/user-documentation.md`):

- `help/tell.md`: "The default tell role has all fourteen native commands: … and file read, glob, grep, write, and edit." becomes fifteen and "file read, glob, grep, write, edit, and patch".
- `help/roles.md`: the grant bullet's "`tell` also starts with … and writing and editing workspace files" adds applying a multi-file patch. It has no count, so none is added.
- `documentation/user-documentation/advanced-agents/acp-agent.md`: "Tell starts with those same commands plus … and writing and editing workspace files" adds applying a patch that changes several files at once; "Granted `file write` and `file edit` run there too" names `file patch`; "A typed `file read`, `file glob`, `file grep`, `file write`, or `file edit` … carry no tag" names `file patch`. This page has no count.
- `documentation/user-documentation/tab-types/roles.md`: "When all fourteen native commands are granted" becomes fifteen; "**Tell** … can also … write and edit workspace files" adds applying a patch that changes several files at once.

Land it as one change: the vocabulary entry and the count-pinned tests must move together, or `check-diff` goes red.

## Tests

All server cases are in the vitest `server` project; `RolesTab.test.tsx` is in `client`.

New cases:

- `src/file-patch/command.test.ts`, modeled on `describe('FILE_MUTATION_PRIMER')`: `FILE_PATCH_PRIMER.split('\n')` has exactly 5 lines; it contains `file patch {"patchText":"<patch>"}` and ``Patched <n> files:``; the `Example` line's command (from `file patch` on) passes `parseFilePatchCommand`, its `patchText` passes `parsePatchText` as an Update of `src/a.ts` and a Delete of `old.txt`, and `describePatchCommand` gives `file patch src/a.ts, old.txt`.
- `src/file-write/command.test.ts`, in `describe('describeLoopCommand')`: a four-section patch with a Move is described exactly as `describePatchCommand` describes it, with no `+` content; a malformed patch line is bare `file patch`; existing write, edit, and pass-through cases unchanged.
- `src/acp/tool-table.test.ts`, in `describe('file mutation tools')`: `fileTool(['file patch'])` is defined and its primer is exactly `FILE_PATCH_PRIMER`; read, glob, grep, write, edit, and patch together give the five blocks in that order joined by `\n\n`, with `FILE_MUTATION_PRIMER` once; read, glob, grep, and patch give `FILE_GREP_PRIMER` immediately followed by `\n\n${FILE_PATCH_PRIMER}` and no mutation primer; write and edit without patch don't contain `FILE_PATCH_PRIMER`. The gate (through `gateCommand` with the `coreSnapshot` helper there) refuses a `file patch {…}` line with a disabled `file patch` row as `Command is disabled: file patch.` with `refused: 'disabled'`, also when the role doesn't grant it; refuses a role granting only `file read` as `Command not allowed for role "writer": file patch.`; and returns `runsOn: 'workspace'` when granted. `toolExtractor` of a `file patch`-granted table extracts a trailing `file patch {…}` line and a malformed `file patch {` line, and a `file write`-only table doesn't extract a patch line.
- `src/acp/native-commands.test.ts`: `nativeCommandName` of `file patch {"patchText":"x"}` and of `  FILE  PATCH {…}` is `file patch`, and the `it.each` tool table gains `['file patch {"patchText":"x"}', 'file']`.
- `src/plugins/roles/roles-file.test.ts`: a new case like "leaves a saved ask and tell role with the previous default grants untouched on disk", whose saved tell is today's fourteen (no `file patch`), reads back unchanged and byte-for-byte.
- `src/acp/ask-role.test.ts`: tell's commands contain `file patch`; `ASK_COMMANDS` doesn't.
- `src/native-commands/policy.test.ts`, modeled on "disables only file grep when file grep is disabled": disabling `file patch` leaves read, glob, grep, write, and edit enabled, and `disabledApplicationCommand('file patch {"patchText":"x"}', settings)?.name` is `file patch`; a disabled `file` parent disables `file patch`.
- `src/application-commands.test.ts`: the `file patch` row is `{ name: 'file patch', kind: 'native', aliases: [], forms: ['file patch'], parent: 'file', nativeTool: 'file' }`, and `resolveApplicationCommand('file patch {')?.name` is `file patch`.
- `src/acp/drive-loop.test.ts`, beside "names a file write by path in the follow-up but records the full command": with `coreSnapshot('tell', ['file patch'])`, a patch moving `src/x.ts` to `src/y.ts` and updating `src/a.ts` with a `+SECRET LINE` gives a follow-up containing ``Output of `file patch src/x.ts -> src/y.ts, src/a.ts`:`` and not `SECRET LINE`, while the recorded command is the full line; a malformed `file patch {` is named ``Output of `file patch`:``. Also `corePrimer` for `coreSnapshot('tell', ['file write', 'file patch'])` ends its allow-list with `file write, file patch.`.
- `src/acp/run-prompt.test.ts`, in `describe('runCorePrompt file mutations')`, with a patch granted beside write and edit: a granted `file patch` adding `notes/c.md` runs through `mocks.mutateFileInTab` with the raw command, creates the file under the tab's workspace, and returns `Patched 1 file:\nA notes/c.md`; a prompt cancelled before the step throws `ACP: prompt cancelled.` and creates nothing; a disabled `file patch` row returns `Command is disabled: file patch.`, and a role without the grant returns `Command not allowed for role "tell": file patch.`, neither calling `mutateFileInTab`.
- `src/remote/serve-acp-loop.test.ts`, in `describe('startRemoteLoop workspace mutations')`: a granted patch updating `a.md` changes the far-side workspace file and sends one `acp-tool-step` with `result` `Patched 1 file:\nM a.md` and `workspace: true` and no `acp-tool-request`; an ungranted patch is refused with `workspace: false` and changes nothing.

Count and list updates (these fail without them):

- `src/acp/native-commands.test.ts`: "publishes the ordered command vocabulary" gains `'file patch'` after `'file edit'`.
- `src/plugins/roles/roles-file.test.ts`: the built-in tell `toEqual` list (`expect(file['tell']).toEqual(`) gains `'file patch'`, and both tell `toHaveLength(14)` become 15. The saved-file fixtures (`projectTell` and the "leaves a saved … untouched" cases) keep their lists, since saved files don't change.
- `src/acp/ask-role.test.ts`: `expect(tell).toHaveLength(14)` becomes 15.
- `web/src/plugins/roles/RolesTab.test.tsx`: `expect(NATIVE_ACP_COMMANDS).toHaveLength(14)` becomes 15, and the same case also checks it contains `file patch`.
- `src/plugins/roles/command-policy.test.ts`: "follows a disabled file parent into every file command" gains `'file patch': 'application-wide'`.
- `src/acp/tool-table.test.ts`: "keeps the existing table order and appends the canonical allow-list" (which uses every native command) expects the file block to end with `\n\n${FILE_PATCH_PRIMER}`; "selects the file tool for any file grant" adds `'file patch'` to its loop.
- Suites that only spread `NATIVE_ACP_COMMANDS` (`src/application-commands.claims.test.ts`, `src/native-commands/feature.integration.test.ts`, `src/acp/manager.test.ts` and the like) and `web/src/plugins/commands/CommandsTab.test.tsx` (fixture rows only) need no edit; if `check-diff` shows one asserting an exact primer or list, add `file patch` in vocabulary order there.

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- Manual, in the scratch project from subplan 14 (after its run it holds `src/a.ts` with `const b = 3;` and `src/y.ts`), started with `node bin/janus.mjs --no-open <project>`:
  1. Open the Commands tab and confirm a `file patch` row under `file`. Open the Roles tab. If a saved roles file is in effect, its tell role won't have `file patch` (saved files aren't migrated): confirm **Add command** offers `file patch` after `file edit`, add it, and confirm **Add command** disappears once all fifteen are granted.
  2. In a local tab, run `tell rename src/y.ts back to src/x.ts and change const b = 3; to const b = 4; in src/a.ts, using one file patch`. Open the connection tab and confirm one `file patch` tool step answering `Patched 2 files:` with an `M src/a.ts` row and an `R src/y.ts -> src/x.ts` row, in whichever order the agent wrote the sections, and that the files on disk match.
  3. In the Commands tab, turn off Agent access for `file patch` and repeat a similar request. The role still grants it, so the primer still teaches it; confirm the step is refused with `Command is disabled: file patch.`. Turn it back on, remove `file patch` from the tell role, and if the agent emits a patch anyway, confirm `Command not allowed for role "tell": file patch.`.
  4. Turn off Enabled for `file patch` and type `file patch {"patchText":"*** Delete File: old.txt"}` in the command bar; confirm `Command is disabled: file patch.`. Restore the setting.

## Out of scope

- Changing saved roles files (source plan: they keep the grants they list).
- Granting `file patch` to the built-in `ask` role.
- An `aborted()` check in the far-side `runWorkspace` (existing write/edit behavior; unchanged).
- External-directory permissions (source plan, Out of scope: outside-root paths are refused).
- `file patch` in `agent` command runs (source plan, Out of scope; refused since subplan 14).
- `help/file.md`, `help/commands.md`, and `product/specs/agent-command.md` (subplan 14).
