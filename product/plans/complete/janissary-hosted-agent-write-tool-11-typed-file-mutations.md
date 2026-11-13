# Hosted write tool 11 — typed `file write` and `file edit` in local and remote tabs

**Complexity: 5/10** — ~120 added lines in two new modules, 1 edited production file (`src/commands/file.ts`), 10 requirements, 16 scenarios (p=5.69).

Source plan: `./product/plans/complete/janissary-hosted-agent-write-tool.md`. Run order: 11 of 15 in the hosted write tool series. Everything it depends on has already landed on this branch: the mutation parser and messages (plan 2, split into 2a/2b/2c1/2c2), agent refusal (plan 3, so autonomous `file` grants never gain writes), the write policy on both ports (plans 7 and 8), and `editFile` on both ports (plans 9 and 10). Nothing else must land first.

This is where a person can first type the new commands. The registered `file` command keeps its single definition and delegates: reads to the existing reader, mutations to a new tab executor that picks the root and the filesystem port the same way `file read` does. The shared executor is also what the ACP routes in plans 12 and 13 call.

## Goal

`file write <JSON>` and `file edit <JSON>` work as typed commands. A local tab writes under its workspace clone, or the launch/project directory when it has none. A remote tab writes only in its remote workspace through a scoped remote port, and prints the existing remote unavailable line instead of ever falling back to the local disk. Output is exactly one line.

## Design decisions

- Two new modules, both in `src/file-write/`:
  - `outcome.ts` — pure line formatting: `mutationFailureLine(reason, path)` for a `{ ok: false, reason }` result and `mutationRejectionLine(error, path)` for a thrown or rejected error. No I/O, no port types. Keeping this out of `messages.ts` keeps that module free of file-navigator and remote imports.
  - `tab-write.ts` — exports `runFileMutation(port, root, input)` (the shared executor, returns `Promise<string>`) and `mutateFileInTab(managers, label, input)` (the tab runner, returns `Promise<string>`). Plan 13 calls `runFileMutation` with that machine's `new LocalFileSystemPort()`; no second runner module is added.
- `runFileMutation`: call `parseFileMutation(input)` (`src/file-write/command.ts`); on `{ error }` return the error unchanged (it is already a usage line or the `File too large (>5 MB): <path>.` line). For `kind: 'write'`, call `port.writeFile(root, path, <content as UTF-8 bytes>, expectedHash, 'tool-text')`; for `kind: 'edit'`, call `port.editFile(root, path, oldString, newString, replaceAll)`. Put the `await` inside `try/catch` so both a synchronous throw from `LocalFileSystemPort` and a rejected remote promise reach `mutationRejectionLine`. On `ok: true` return `writeSuccessLine(path)` or `editSuccessLine(path, value.replacements)` from `src/file-write/messages.ts`; on `ok: false` return `mutationFailureLine(reason, path)`. `path` is always the parsed request path as typed.
- `mutateFileInTab`: first call `parseFileMutation(input)` and return its usage/size error immediately, so a usage error reads the same on local and remote tabs (same order as `readFileInTab`, which parses before routing). Then `localReadRoot(managers, label)` (exported from `src/file-read/tab-read.ts`). A defined root means a local tab: return `runFileMutation(new LocalFileSystemPort(), root, input)`. An undefined root means a remote tab: mirror `readRemoteFile` in `src/file-read/tab-read.ts` — read `managers.remote?.get(label)`, `readyOf(label)`, `workspaceOf(label)`; if any is missing return `Remote connection unavailable.`; otherwise create a `RemoteFileSystemPort(channel, 'file-write-<n>', ready)` with a module-level counter, return `runFileMutation(port, workspace, input)`, and call `port.dispose()` in a `finally`. `runFileMutation` parses again; that is cheap and keeps the shared executor self-contained for plan 13. Nothing goes through the remote file cache. Paths are relative to the root, never the tab's current directory.
- `mutationFailureLine(reason, path)`, where `<path>` is always `displayPath(path)`:
  - `matchFailureLine(reason, path)` when it returns a line (`No matching text` / `Multiple matches`).
  - `Outside the workspace: <path>.` for the word `'Outside the workspace'` (local policy at `src/file-read/policy.ts`, and the remote port's local refusal in `src/file-navigator/remote/port-reads.ts` `remoteWriteFile`/`remoteEditFile`) and for `OUTSIDE_ROOT_REASON` (a remote host refusal from `src/remote/filesystem/refusal.ts`).
  - Every other reason prints as `<reason>: <path>.`. This covers the remaining policy words (`Secret file`, `File not found`, `Is a directory`, `Not a text file`, `File too large (>5 MB)`), `SAVE_CONFLICT_ERROR` (`src/editor/save-conflict.ts`), and `fileOperationReason` text (`src/file-navigator/file-operation-result.ts`). Escape the reason with `displayPath` too, because a remote reason is untrusted text and must not break the one-line rule.
- `mutationRejectionLine(error, path)`:
  - An `Error` whose message is `Remote connection unavailable.`, `ENDED_REASON`, `TIMED_OUT_REASON`, or `CLOSED_REASON` (`src/file-navigator/remote/port-requests.ts`) prints that message unchanged.
  - An `Error` whose message is `OUTSIDE_ROOT_REASON` prints `Outside the workspace: <path>.`.
  - Any other `Error`, including the decoder's `Invalid remote filesystem operation result.` (thrown by `src/remote/filesystem/result-decoders.ts` for a malformed reply such as `replacements: 0`, which rejects the port promise), prints `<escaped message>: <path>.`. It is never reported as success.
  - A non-`Error` value prints `fileOperationReason(error)` formatted as `<reason>: <path>.`.
- File content, `oldString`, and `newString` never appear in output.
- `src/commands/file.ts` routes with `isFileMutationCommandLine(command_)` from `src/file-write/command.ts`: true → `mutateFileInTab`, otherwise → `readFileInTab` unchanged. Bare `file`, `file read …`, and unknown subcommands keep the read usage line; `file write` / `file edit` with missing or bad JSON print `Usage: file write <JSON>` / `Usage: file edit <JSON>`. Output still goes through the existing `appendCommandOutput` call.
- Typed commands use ordinary enabled-command dispatch through `CommandManager`; no ACP role grant is consulted. History and transcript recording stay as they are, including mutation payloads in the command text, per the user's review decision.
- Size: `tab-write.ts` lands near 60 counted lines and `outcome.ts` near 45; `src/commands/file.ts` grows by about 3 lines. No file approaches 200.

## What already exists (reuse, don't rebuild)

| Existing code | Use |
| --- | --- |
| `src/commands/file.ts` `command` (`name: 'file'`) | The one registered `file` command; keep its `match` and `appendCommandOutput` call |
| `src/file-read/tab-read.ts` `localReadRoot` | Root choice (workspace dir, else `managers.tab.launchDir`, `undefined` for a remote tab) |
| `src/file-read/tab-read.ts` `readRemoteFile` | Pattern for remote channel/ready/workspace checks, session id counter, and `finally` disposal; its private `rejectionLine` is the read-side analogue of `mutationRejectionLine` (do not export or change it) |
| `src/file-navigator/remote/port.ts` `RemoteFileSystemPort` | Scoped remote port; its `writeFile(..., policy)` and `editFile(...)` already refuse absolute and root-escaping paths locally |
| `src/file-navigator/filesystem-port.ts` `FileSystemPort`, `LocalFileSystemPort` | Port contract; local `writeFile` with `'tool-text'` and `editFile` |
| `src/file-navigator/remote/port-requests.ts` `ENDED_REASON`, `TIMED_OUT_REASON`, `CLOSED_REASON` | Remote rejection messages printed unchanged |
| `src/file-navigator/file-operation-result.ts` `OUTSIDE_ROOT_REASON`, `fileOperationReason` | Reason recognition and non-`Error` fallback |
| `src/file-write/command.ts` `parseFileMutation`, `isFileMutationCommandLine` | Parser and routing predicate |
| `src/file-write/messages.ts` `displayPath`, `writeSuccessLine`, `editSuccessLine`, `matchFailureLine` | All path escaping and success/match lines |

## Proposed changes

Land in this order; each step keeps typecheck and tests green.

1. Add `src/file-write/outcome.ts` with `src/file-write/outcome.test.ts`.
2. Add `src/file-write/tab-write.ts` with `src/file-write/tab-write.test.ts`.
3. Route mutations in `src/commands/file.ts`, and add one `file write {...}` and one `file edit {...}` example to `samples` (each must satisfy the existing `match`; `src/commands.test.ts` checks samples via `findCommand`).
4. Update `help/file.md`: keep the read section; describe `file write <JSON>` (`path`, `content`, optional `expectedHash`) and `file edit <JSON>` (`path`, `oldString`, `newString`, optional `replaceAll`), the same root selection and remote behavior as read, parent folder creation, exact-text matching and `replaceAll`, the 5 MB limit, UTF-8-only text, the two success lines, every failure line from the mapping above, the two usage lines, and examples including a path with spaces (allowed here because the path is a JSON string, unlike `file read`) and multiline content written as `\n`. Update the existing `file` row in `help/commands.md` in place to mention write and edit (no new row).

## Tests

- `src/file-write/outcome.test.ts`: each mapping branch — both outside-root reasons, a policy word, `SAVE_CONFLICT_ERROR`, a `fileOperationReason` string, both match failures, a reason containing a newline (escaped), the four remote rejection messages, `Invalid remote filesystem operation result.`, and a non-`Error` rejection.
- `src/file-write/tab-write.test.ts` (temp dirs; managers stubbed like `src/file-read/tab-read.test.ts`): local tab with a workspace clone writes there; local tab without one writes under `launchDir`; nested create; an edit prints its count; a path with a newline is escaped in the output; malformed JSON creates nothing; a remote tab without a channel prints `Remote connection unavailable.` and leaves a same-named local file untouched; a remote tab with a fake channel sends `write-file` with `policy: 'tool-text'` and `edit-file`, and disposes the port after success, a failure result, and a rejection — including a malformed `replacements: 0` reply, which must print the invalid-result line, not success. Reuse the fake-channel setup from `src/file-navigator/remote/port.test.ts`.
- Extend `src/commands/file.test.ts`: typed write and edit append one output line; malformed JSON and unknown fields produce no file or folder; `file read` and bare `file` behave as before.
- Keep `src/commands.test.ts` green (samples and the `help/commands.md` table).

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Manually, in a local tab: `file write {"path":"temp/plan11 test.txt","content":"a\nb\n"}` prints `Wrote temp/plan11 test.txt.`; `file edit {"path":"temp/plan11 test.txt","oldString":"b","newString":"c"}` prints `Edited temp/plan11 test.txt (1 replacements).` and the file on disk now holds `a`, `c`; `file write {"path":"../x","content":""}` prints `Outside the workspace: ../x.`; bare `file` still prints the read usage line.

## Out of scope

- ACP tools and the native command vocabulary (plans 12 and 13).
- Built-in role grants (plan 14).
- Series-wide end-to-end verification (plan 15).
- Tab completion for the new subcommands.
- Redacting mutation payloads from history or transcripts.
