# File patch 14: widen the mutation predicate, refuse patches in agent runs, and document the command

**Complexity: 4/10** — 8 requirements and 11 test scenarios across the routing, refusal, and sample rules drive it, with ~4 added lines in 2 files (p=4.87)

Run order: 14 of 15 in the `file patch` series. Source plan: `./product/plans/complete/file-patch.md`. Depends on `./product/plans/ready/file-patch-13-patch-runner-branch.md` (the patch branch in `runFileMutation` and `mutateFileInTab`) and `./product/plans/ready/file-patch-9-command-argument-parser.md` (`isFilePatchCommandLine` in `src/file-patch/command.ts`), and through them on every earlier subplan (1 to 13). All of them must land first: today there's no `src/file-patch/` folder, so the one new import wouldn't resolve, and without subplan 13's branch a widened predicate would send patch lines into `parseFileMutation`, which answers `Usage: file write <JSON>`. It depends on no later subplan.

This subplan is where `file patch` becomes a working typed command. One widened predicate makes every place that already treats `file write` and `file edit` as a mutation pick up patch lines too: the typed `file` command, both ACP loop hosts, and both agent-run refusals. It also documents the command in `help/file.md`, `help/commands.md`, and `product/specs/agent-command.md`. The ACP vocabulary, grant, and primer, which let an agent actually emit the command, come in subplan 15.

## Goal

Typing `file patch {"patchText":"…"}` in a local tab applies the patch to the tab's workspace or project directory. In a remote tab it applies to the remote clone only. Either way it prints the runner's output, and an `agent` run refuses the line.

## Design decisions

From the source plan:

- **One widened predicate.** `isFileMutationCommandLine` in `src/file-write/command.ts` (line 26, "`export function isFileMutationCommandLine(`") also returns true for `isFilePatchCommandLine`. That's how these six call sites recognize a patch as a mutation with no edit of their own:
  - `fileOutput` in `src/commands/file.ts` ("`if (isFileMutationCommandLine(line)) return mutateFileInTab(`"), the typed command.
  - The `file` tool's `isCommandLine` in `createAcpToolTable`, `src/acp/tool-table.ts` ("`|| isFileGrepCommandLine(line) || isFileMutationCommandLine(line)`").
  - `gateAgentCommand` in `src/acp/tool-table.ts` ("`if (isFileMutationCommandLine(input) || isFileGlobCommandLine(input)`").
  - `runGrantedAgentCommand` in `src/agent/command-tools.ts` (same condition).
  - `runWorkspace` in `src/acp/run-prompt.ts` ("`if (isFileMutationCommandLine(normalized)) return mutateFileInTab(`").
  - `runWorkspace` in `src/remote/serve-acp-loop.ts` ("`return runFileMutation(new LocalFileSystemPort(), workspaceDir, normalized)`").

  `parseFileMutation` is unchanged and never sees patch lines, because subplan 13's branch in `runFileMutation` and `mutateFileInTab` runs first.
- **Agent runs.** Not in this version. `gateAgentCommand` refuses any `file patch` line with `Agent: command not permitted: <command>.`, with or without the `file` grant, as it refuses `file write`, `file edit`, `file glob`, and `file grep`. `runGrantedAgentCommand` refuses the same lines with the same text as defense in depth, so a patch never runs in the caller's directory. Both follow from the widened predicate with no edit to either file. Both strip one leading `/` and trim before testing, so `/file patch …` and `  FILE PATCH …` are refused too.
- **Typed sample.** `src/commands/file.ts` gains a `file patch …` entry in `samples`. It needs no new branch.
- **Completion.** Command-bar completion doesn't offer `patch`, as it offers neither `write` nor `edit`. `FILE_SUBCOMMANDS` in `src/completion/file-read.ts` is unchanged.
- **Documentation.** `help/file.md` documents the exact marker format and hunk syntax so an agent or a person can write a patch on the first try.

Decided here:

- **`file-write/command.ts` edits.** It's at about 114 counted lines, so the source plan's 196-line worry no longer applies. Still keep this edit to one import (`isFilePatchCommandLine` from `../file-patch/command.js`) and the widened predicate's one return line. The `describeLoopCommand` delegation lands in subplan 15 with the rest of the ACP surface. `src/file-patch/command.ts` doesn't import `src/file-write/command.ts` (subplan 9 imports only `parse.ts`, `file-write/messages.ts`, `file-read/policy.ts`, and `value-guards.ts`), so the new import closes no cycle.
- **Not a patch line.** `isFilePatchCommandLine` matches `/^file\s+patch(\s|$)/i`, so `file patching x` stays a non-mutation: the typed command sends it to `readFileInTab` (which prints `FILE_READ_USAGE`), and `gateAgentCommand` routes it to the caller, as `file writer x` and `file greps x` are today.
- **The sample.** Add exactly `file patch {"patchText":"*** Delete File: old.txt"}` after the `file edit` sample. It has no `\n`, so it needs no `String.raw`. It must still pass the `src/commands.test.ts` sample checks (each sample routes to the `file` command), which it does because `match` is `/^file\b/i`.
- **Intermediate state.** After this subplan, an ACP agent still can't emit `file patch`: `nativeCommandName` (`src/acp/native-commands.ts`) doesn't know it until subplan 15 adds it to `NATIVE_ACP_COMMANDS`, so `toolExtractor` never extracts the line. That's why the follow-up description can wait. Likewise there's no `file patch` row in the Commands tab yet, so a typed `file patch` is refused as disabled only when the parent `file` row is disabled (`disabledApplicationCommand` in `src/native-commands/policy.ts` resolves it to that row); its own row arrives in subplan 15. Don't add anything to bridge either gap here.
- **Help structure.** In `help/file.md`, add `` `file patch <JSON>` `` as its own usage line after `` `file edit <JSON>` `` (line 15), extend the opening sentence (line 3, "or write or edit a text file there") to also mention applying a patch that changes several files, extend the usage paragraph's last sentence (line 17, "`file write` and `file edit` are under **Writing and editing**.") with "`file patch` is under **Patching several files**.", and add the **Patching several files** section at the end of the page, after **Writing and editing**. Follow the house style of the page: bold-run-in heading, prose paragraphs, bullet lists of exact output lines, and an example list at the end. No `<img>` tag (command help pages get their sprite from the docs build, per `ai/guidelines/documentation.md`).
- **Help content.** The section must describe the final behavior decided in subplans 1 to 9 and 13, not the source plan's shorthand. It states each of these:
  - **Argument** (subplan 9). One JSON object with exactly one key, `patchText`, a string, kept on one line with newlines written as `\n`. Any other key, a missing key, a non-string value, or bad JSON prints `Usage: file patch <JSON>`. An argument over 5 MB (its UTF-8 bytes as typed) prints `Patch too large (>5 MB). No files were changed.`; a malformed oversized one prints the usage line.
  - **Root** (subplan 13). The same root as `file write`: the tab's workspace or the project directory; a remote tab applies only in its remote workspace, never on the local disk. Paths are relative to that root.
  - **Envelope and markers** (subplan 1). `*** Begin Patch` as the first line and `*** End Patch` as the last are optional. Markers are `*** Add File: <path>`, `*** Delete File: <path>`, `*** Update File: <path>`, `*** Move to: <path>`, spelled exactly, in that case; the path is trimmed. A CRLF-typed patch parses like an LF one.
  - **Add** (subplans 1, 5). Every content line starts with `+`; an Add with none creates an empty file. The file is written with LF endings and a final newline, no BOM, and default permissions, and missing folders are created. Adding a path that exists fails `File already exists`, unless an earlier section deleted it or moved it away, which is how a patch overwrites a file.
  - **Delete** (subplans 1, 5, 7). No body. A missing path fails `File not found`. A symbolic link is removed, never its target. A folder left empty stays.
  - **Update and hunks** (subplans 2, 3). Hunks start at `@@`, optionally `@@ <line>` to move the search to the next line equal to it; the first hunk may omit `@@`. Hunk lines start with a space (context), `-` (removed), or `+` (added); an empty context line is a single space, and a blank line is an error. `*** End of File` ends a hunk that must match at the end of the file. Hunks are searched in order, each after the previous match, first match wins; a match is tried exactly, then ignoring trailing whitespace. A hunk with only `+` lines inserts at the current search position. The file keeps its line ending (judged from its first line), its final-newline state, its BOM, and its permissions, and an Update through an in-root link changes the link's target. There's no `\ No newline at end of file` marker.
  - **Move** (subplan 6). `*** Move to: <new>` directly after `*** Update File: <old>` renames the file (a link stays a link), with optional hunks. The new path follows the Add rule.
  - **Order and atomicity** (subplans 5, 7). Sections apply in order, and a later section sees what earlier ones did, so one path may appear in several sections. Every check runs before anything is written; any failure leaves every file as it was.
  - **Output** (subplans 5, 6, 8). `Patched <n> files:` (`Patched 1 file:` for one, `Patched 0 files:` when the sections cancel out) and one row per path in order of first appearance: `A <path>`, `M <path>`, `D <path>`, `R <old> -> <new>`, each path once with its net change, as typed, with control characters escaped. File content never appears.
  - **Errors** (subplans 1, 2, 4 to 8, 13), each as a bullet:
    - `Malformed patch at line <n>: <problem>. No files were changed.`, with `<problem>` one of `unknown marker "<line>"`, `missing path`, `no file sections`, `Add File lines must start with "+"`, `Move to must follow Update File`, `hunk lines must start with " ", "-", or "+"`, and `Update File needs a hunk or Move to`.
    - `Patch failed at section <k> (<marker>): <reason>. No files were changed.`, where `<k>` counts sections from 1 and `<marker>` is `Add File: <path>`, `Delete File: <path>`, or `Update File: <path>` (a Move section names its Update marker). The reasons, as the runner prints them: `Outside the workspace`, `Protected file` (`.git` and `.janissary`, as for `file write`), `Secret file`, `Is a directory`, `Not a text file` (also for a dangling link, a link whose target an earlier section deleted, and a result holding NUL or an unpaired surrogate), `File too large (>5 MB)` (a file read or a result over 5 MB), `File not found`, `File already exists`, `No matching text for hunk starting "<line>"` (the hunk's first context or `-` line, or its `@@` anchor text when the anchor isn't found), and `Filesystem error ENOTDIR; check the item and destination, then try again` for a path under a file.
    - `Patch failed while applying: <reason>: <path>. No files were changed.` when a disk write fails and everything is put back, and the same with `Some files may have been changed.` when putting it back fails too.
    - On a remote tab, `Remote connection unavailable.`, `The remote connection ended.`, or `The remote machine did not answer in time.`, and `Patch failed: <reason>.` for any other remote failure, which makes no promise about the remote files.
  - **Examples.** Two or three, including one four-section patch with the envelope and its output, and one failure line.
- **`help/commands.md` row.** The `file` row (line 21) gains `; `file patch <JSON>` applies a multi-file patch` after its `file edit <JSON>` clause. The row's name is unchanged, so it stays in alphabetical place (the rule in `ai/guidelines/documentation.md` that `src/commands.test.ts` enforces).
- **Spec.** `product/specs/agent-command.md` has two paragraphs that list the refused file commands: the local-run one ("A local run granted `file` can request `janissary file read <path>`") and the remote-run one ("A remote run granted `file` runs `janissary file read <path>`"). In both, the sentence "`janissary file write …` and `janissary file edit …` return `Agent: command not permitted: <command>.`" names `janissary file patch …` too. In the remote paragraph, "The local side refuses a glob or grep line on its own as well" becomes "a glob, grep, or patch line", since `runGrantedAgentCommand` refuses it locally. No other spec changes here; `acp.md`, `application-commands.md`, and `roles.md` are subplan 15's.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| `file` command | `fileOutput` and `samples` in `src/commands/file.ts` | Already routes every `isFileMutationCommandLine` line to `mutateFileInTab`; gains one sample. |
| Mutation predicate | `isFileMutationCommandLine` in `src/file-write/command.ts` | The one widened line test. |
| Agent-run refusals | `gateAgentCommand` in `src/acp/tool-table.ts`, `runGrantedAgentCommand` in `src/agent/command-tools.ts` | Pick up patch lines through the predicate. |
| Loop hosts | `runWorkspace` in `src/acp/run-prompt.ts` and `src/remote/serve-acp-loop.ts` | Route patch lines to the runners through the predicate; not reachable by an agent until subplan 15. |
| Patch line test | `isFilePatchCommandLine` in `src/file-patch/command.ts` (subplan 9) | Joined into the predicate. |
| Runner branch | `runFilePatch` in `src/file-patch/tab-patch.ts`, called from `runFileMutation` and `mutateFileInTab` in `src/file-write/tab-write.ts` (subplan 13) | Handles the lines the predicate now routes. |
| Output lines | `src/file-patch/messages.ts` (subplans 8, 13) | The exact strings the help section quotes. |
| Help page style | **Writing and editing** in `help/file.md` | Model for the new section's prose and bullet lists. |
| Refusal test forms | `GREP_FORMS` and the "refuses agent file mutations" cases in `src/acp/tool-table.test.ts` and `src/agent/command-tools.test.ts` | Model for the patch-line refusal cases. |

## Proposed changes

- `src/file-write/command.ts`: import `isFilePatchCommandLine` and widen `isFileMutationCommandLine`.
- `src/commands/file.ts`: add the `file patch {"patchText":"*** Delete File: old.txt"}` sample.
- `help/file.md`: the usage line, the two sentence extensions, and the **Patching several files** section, as under Help structure and Help content.
- `help/commands.md`: the `file` row clause.
- `product/specs/agent-command.md`: the two paragraphs, as under Spec.

Land it as one change. Every checkpoint stays green because subplans 9 and 13 are already in.

## Tests

All in the vitest `server` project.

- `src/file-write/command.test.ts`: `isFileMutationCommandLine` accepts `file patch {…}`, `FILE PATCH {…}`, and bare `file patch`, and rejects `file patching x` and `/file patch {}` (the predicate doesn't strip the slash, like the existing `/file write {}` case). Existing write and edit predicate and `parseFileMutation` cases stay unchanged and green.
- `src/commands/file.test.ts`, in `describe('file command run')` beside "writes and edits a file with one output line each": on a local tab, ``String.raw`file patch {"patchText":"*** Add File: a.md\n+x"}` `` prints exactly `Patched 1 file:\nA a.md` and creates `a.md` under the root; `file patch {"patchText":1}` prints exactly `Usage: file patch <JSON>` and creates nothing; `file patching x` prints `FILE_READ_USAGE`. The sample list contains the new patch sample, and `parseFilePatchCommand` returns `{ patchText: '*** Delete File: old.txt' }` for it (as "declares grep samples that parse as intended" does for grep).
- `src/acp/tool-table.test.ts`: `gateAgentCommand` (through `gateCommand` with an agent snapshot) refuses `file patch {"patchText":"x"}`, bare `file patch`, `FILE PATCH {`, and `/file patch {}` with `Agent: command not permitted: <command>.`, with the `file` grant and without it; `file patching x` routes to the caller.
- `src/agent/command-tools.test.ts`: `runGrantedAgentCommand` refuses the same forms with the same text, with and without the `file` grant, and never calls `dispatchLineInInvocation`.
- `src/commands.test.ts`: `help file` contains `**Patching several files**` and `` `file patch <JSON>` ``, and the existing table-order check still passes with the edited `file` row.

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- Manual, in a scratch git project started with `node bin/janus.mjs --no-open <project>` holding `src/a.ts` (`const a = 1;` / `const b = 2;`), `old.txt`, and `src/x.ts`, typed in a local tab's command bar:
  1. Run `file patch {"patchText":"*** Begin Patch\n*** Add File: notes/new/todo.md\n+# Todo\n*** Update File: src/a.ts\n@@\n const a = 1;\n-const b = 2;\n+const b = 3;\n*** Update File: src/x.ts\n*** Move to: src/y.ts\n*** Delete File: old.txt\n*** End Patch"}`. Expect `Patched 4 files:`, `A notes/new/todo.md`, `M src/a.ts`, `R src/x.ts -> src/y.ts`, `D old.txt` in that order, and the tree to match.
  2. Run `file patch {"patchText":"*** Add File: z.md\n+z\n*** Update File: src/a.ts\n@@\n const a = 1;\n-const b = 99;\n+const b = 4;"}`. Expect `Patch failed at section 2 (Update File: src/a.ts): No matching text for hunk starting "const a = 1;". No files were changed.` and no `z.md`.
  3. Run `file patch {"patchText":"*** Delete File: ../outside.txt"}`. Expect `Patch failed at section 1 (Delete File: ../outside.txt): Outside the workspace. No files were changed.`
  4. Run `help file` and confirm the **Patching several files** section, and `help commands` and confirm the `file` row's `file patch <JSON>` clause.

## Out of scope

- The native ACP command name, the Commands-tab row, the `tell` grant, the primer, the follow-up description, and the `acp.md`, `application-commands.md`, `roles.md`, `help/tell.md`, `help/roles.md`, and user-docs updates (subplan 15).
- `file patch` in `agent` command runs (source plan, Out of scope).
- Command-bar completion of `patch` (source plan, from precedent).
