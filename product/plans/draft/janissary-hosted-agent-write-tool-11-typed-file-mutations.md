# Hosted write tool 11 — typed `file write` and `file edit` in local and remote tabs

**Complexity: 5/10** — ~110 added lines, 1 edited file plus the tab executor, 10 requirements, 14 scenarios (p=5.62).

Source plan: `./product/plans/complete/janissary-hosted-agent-write-tool.md`. Run order: 11 of 15 in the hosted write tool series. Depends on plan 2 (`janissary-hosted-agent-write-tool-2-mutation-parser.md`), plan 3 (`janissary-hosted-agent-write-tool-3-agent-mutation-refusal.md`, which must land first so autonomous `file` grants never gain writes), plan 8 (`janissary-hosted-agent-write-tool-8-remote-write-policy.md`, which also brings in plan 7's local write policy), and plan 10 (`janissary-hosted-agent-write-tool-10-port-edit-contract.md`).

This is where a person can first type the new commands. The registered `file` command keeps its single definition and delegates: reads to the existing reader, mutations to a new tab executor that picks the root and the filesystem port the same way `file read` does. The executor is also what the ACP routes in plans 12 and 13 call.

## Goal

`file write <JSON>` and `file edit <JSON>` work as typed commands. A local tab writes under its workspace clone, or the launch/project directory when it has none. A remote tab writes only in its remote workspace through a scoped remote port, and prints the existing remote unavailable line instead of ever falling back to the local disk. Output is exactly one line.

## Design decisions and dependencies

- Source plan decision: tab-root and port routing live in `src/file-write/tab-write.ts`, and `src/commands/file.ts` delegates to the owning modules. Preserve `file read` usage and behavior; bare `file` and unknown subcommands keep printing the read usage line.
- Export two functions from `tab-write.ts`. The shared executor takes a `FileSystemPort`, a root, and the command input, parses with plan 2, calls `writeFile` with `policy: 'tool-text'` (text encoded as UTF-8 bytes) or `editFile`, and formats the one-line outcome. The tab runner chooses the root and port for a tab label and calls the executor. Plan 13 calls the shared executor directly from the remote-hosted ACP loop with that machine's `LocalFileSystemPort`; no second forwarding runner module is added.
- Root selection reuses `localReadRoot` from `src/file-read/tab-read.ts`: workspace directory when present, otherwise `managers.tab.launchDir`; a remote tab has no local root. Paths are relative to that root, never the tab's current directory.
- Remote routing mirrors `readRemoteFile`: require the channel, readiness, and workspace from `managers.remote`, otherwise print `Remote connection unavailable.`; create a `RemoteFileSystemPort` with a unique session id and dispose it in a `finally`, following the file-read lifecycle. Nothing goes through the remote file cache.
- Message mapping, one line each, using the path as the caller typed it with control characters escaped by plan 2's helper: success lines from plan 2; `OUTSIDE_ROOT_REASON` and the policy word become `Outside the workspace: <path>.`; the other policy words become `<word>: <path>.` (`Secret file`, `File not found`, `Is a directory`, `Not a text file`, `File too large (>5 MB)`); match failures use plan 2's lines; the remote unavailable, ended, closed, and timeout reasons print as they are; `SAVE_CONFLICT_ERROR` and `fileOperationReason` text print as `<reason>: <path>.`. A rejected port promise is caught and reported as its message, never as success. File content never appears in output.
- Typed commands use ordinary enabled-command dispatch through `CommandManager`; no ACP role grant is consulted. History and transcript recording stay as they are, including mutation payloads in the command text, per the user's review decision.
- Keep `tab-write.ts` under 200 counted lines; if the message mapping crowds it, move the mapping into `src/file-write/messages.ts` (or extend that module if plan 2 created it).

## What already exists (reuse, don't rebuild)

| Existing code | Use |
| --- | --- |
| `src/commands/file.ts` | The one registered `file` command; `appendCommandOutput` |
| `src/file-read/tab-read.ts` `localReadRoot`, `readRemoteFile`, `rejectionLine` | Root choice, remote port lifecycle, rejection wording |
| `src/file-navigator/remote/port.ts` `RemoteFileSystemPort` | Scoped remote port |
| `src/file-navigator/filesystem-port.ts` `FileSystemPort`, `LocalFileSystemPort` | Port contract (plans 7, 8, and 10) |
| `src/file-write/command.ts` (plan 2) | Parser, formatters, path escaping |

## Proposed changes

Create `src/file-write/tab-write.ts` with the shared executor and the tab runner described above. In `src/commands/file.ts`, route input recognized by plan 2's mutation predicate to the tab runner and everything else to `readFileInTab`, and add one write and one edit example to `samples`.

Update `help/file.md`: describe `file write <JSON>` and `file edit <JSON>` with their fields, root selection, remote behavior, parent folder creation, exact-text matching and `replaceAll`, the 5 MiB limit, UTF-8-only text, the success lines, every error line, and examples including a path with spaces and multiline content. Update the existing `file` row in `help/commands.md` in place (no new row, no duplicate page) to mention write and edit. Keep the row in alphabetical order.

## Tests

- Add `src/file-write/tab-write.test.ts`: local tab with a workspace clone writes there; local tab without one writes under the launch directory; a nested create; an edit with its count; every failure line from the mapping, including a path with a newline; a remote tab without a channel prints `Remote connection unavailable.` and leaves a same-named local file untouched; a remote tab with a fake channel sends `write-file` with `policy` and `edit-file` and disposes the port after success, failure, and rejection.
- Extend `src/commands/file.test.ts`: typed write and edit append one output line; usage errors for malformed JSON and unknown fields produce no file or folder; `file read` and bare `file` behave as before.
- Keep `src/commands.test.ts` green, which reads the `help/commands.md` table and command pages.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

## Out of scope

- ACP tools and the native command vocabulary (plans 12 and 13).
- Built-in role grants (plan 14).
- Tab completion for the new subcommands.
- Redacting mutation payloads from history or transcripts.
