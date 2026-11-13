# Hosted write tool 13 — run ACP file mutations on the remote workspace machine

**Complexity: 3/10** — ~6 added lines in 1 file, but 5 requirements and 8 test scenarios across core and agent snapshots (p=4.37).

Source plan: `./product/plans/complete/janissary-hosted-agent-write-tool.md`. Run order: 13 of 15 in the hosted write tool series. Depends on plan 11 (`janissary-hosted-agent-write-tool-11-typed-file-mutations.md`) for the shared executor and plan 12 (`janissary-hosted-agent-write-tool-12-acp-file-mutation-tools.md`) for the vocabulary and tool recognition; both are complete on this branch. Plans 14 (built-in grants) and 15 (end-to-end) follow.

Since protocol version 40, a remote ACP session's tool loop runs on the far side, next to the agent and the workspace. Workspace tools run there directly and only browser, database, and question tools travel back to the caller. Today the far-side `host.runWorkspace` sends every workspace line to `readWorkspaceCommand`, so a granted `file write` / `file edit` gets the read usage line and writes nothing. This plan makes that runner execute writes and edits on its own machine, through its own local port.

## Goal

In `src/remote/serve-acp-loop.ts`, a granted `file write` or `file edit` runs through plan 11's `runFileMutation` with a `LocalFileSystemPort` and the loop's `workspaceDir`, is reported as an `acp-tool-step` with `workspace: true`, and is never forwarded to the caller as an `acp-tool-request`.

## Design decisions and dependencies

- Source plan decision: preserve the existing remote ACP workspace-tool route. The remote-hosted loop executes writes and edits directly through `LocalFileSystemPort` on its own workspace machine. Do not forward remote ACP workspace mutations through the caller and then back to the remote, and do not call `mutateFileInTab` (it needs `Managers` and a tab label, which the far side does not have, and its remote branch would route back over a channel).
- Routing mirrors the local loop's `runWorkspace` at `src/acp/run-prompt.ts:91` (`if (isFileMutationCommandLine(command.trim().replace(/^\//, ''))) return mutateFileInTab(...)`): in the far-side `host.runWorkspace` (`src/remote/serve-acp-loop.ts:38`), compute the normalized line once (trim, strip one leading `/`), and when `isFileMutationCommandLine` (from `src/file-write/command.ts`) matches it, return `runFileMutation(new LocalFileSystemPort(), workspaceDir, normalized)`; otherwise keep `readWorkspaceCommand(workspaceDir, normalized)` unchanged.
- Port lifetime: create a fresh `LocalFileSystemPort` per mutation call, as `mutateFileInTab` does in `src/file-write/tab-write.ts`. It holds no resources and its `dispose()` is a no-op (`src/file-navigator/filesystem-port.ts`, `class LocalFileSystemPort`), and `startRemoteLoop` has no teardown hook that runs on normal completion (only `abort` / `cancel`), so no loop-owned port and no dispose call are added.
- The executor returns `Promise<string>`; `AcpToolHost.runWorkspace` already accepts a string or a promise, and `driveToolLoop` wraps it in `dropLateRejection` (`src/acp/drive-loop.ts:55`).
- Gate is unchanged and runs before the host: a core snapshot refuses an ungranted mutation with `Command not allowed for role "<role>": <command>.` and a disabled row with `Command is disabled: <command>.` (`src/acp/tool-table.ts`, `gateCoreCommand` path); an agent snapshot refuses every mutation with `Agent: command not permitted: <command>.` (`gateAgentCommand`, `tool-table.ts:130`). So remote autonomous agent runs (which also go through `startRemoteLoop` from `src/remote/serve-acp.ts:107`) still never mutate.
- Results are the executor's one-line output verbatim (`Wrote <path>.`, `Edited <path> (<n> replacements).`, failure lines, or `Usage: file write <JSON>` / `Usage: file edit <JSON>` for malformed JSON). The caller already prefixes workspace steps with `[<host>] ` via `tagged` in `src/acp/run-prompt.ts`; nothing changes there.
- Browser, database, and question tools keep their caller-side route through `acp-tool-request`. Cancellation and abort keep their current behavior: a committed mutation stays committed, `ranCommand` already suppresses frames once `aborted()`, and nothing retries.
- No protocol change: the loop already receives the per-prompt snapshot with grants and rows, and plan 12's tool table is shared by both hosts.
- `serve-acp-loop.ts` is 104 lines; the change adds about six and needs no extraction. Imports use `.js` extensions: `../file-write/tab-write.js`, `../file-write/command.js`, `../file-navigator/filesystem-port.js`.

## What already exists (reuse, don't rebuild)

| Existing code | Use |
| --- | --- |
| `src/remote/serve-acp-loop.ts` `startRemoteLoop`, `host.runWorkspace` | Far-side loop host; the only production edit |
| `src/acp/drive-loop.ts` `driveToolLoop` | Shared driver, gate, and `workspace` step flag |
| `src/acp/tool-table.ts` gate functions | Grant / disabled / agent refusals (unchanged) |
| `src/file-write/tab-write.ts` `runFileMutation(port, root, input)` | Shared executor (parse, apply, one-line result) |
| `src/file-write/command.ts` `isFileMutationCommandLine` | Mutation recognition, same as `run-prompt.ts` |
| `src/file-navigator/filesystem-port.ts` `LocalFileSystemPort` | Far-side port |
| `src/acp/run-prompt.ts:91` local `runWorkspace` | Pattern to mirror |

## Proposed changes

1. `src/remote/serve-acp-loop.ts`: route mutation lines in `host.runWorkspace` as described above.
2. `product/specs/acp.md`: replace the sentence in the mutation paragraph "A remote-hosted loop does not yet run mutations: its reader answers with the read usage line and writes nothing." with: a granted mutation in a remote-hosted loop runs on the remote machine against its workspace through its local filesystem, is reported as a workspace step (so it carries the `[<host>] ` tag), and never crosses to the caller; the autonomous agent path still refuses every mutation. Also extend line ~99's "The loop's workspace tool reads that same root…" to say writes and edits use the same far-side root via `runFileMutation`.
3. `product/specs/remote-server.md`: in the core ACP agent paragraph ("The **autonomous tool loop** runs beside the agent in the clone, so workspace commands resolve there"), state that workspace reads, writes, and edits all resolve in the clone on the remote machine.

## Tests

Add to `src/remote/serve-acp-loop.test.ts` (max-lines is off for tests), using the existing `start`, `coreSnapshot`, and `agentSnapshot` helpers and the temp `workspaceDir` fixture; build the write/edit lines with `JSON.stringify` so the JSON stays on one line:

- A granted `file write` (`coreSnapshot('tell', ['file write'])`) creates the file under `workspaceDir` with the given content, emits one `acp-tool-step` with `result: 'Wrote <path>.'` and `workspace: true`, and sends no `acp-tool-request`.
- A granted `file edit` changes the existing file and reports `Edited <path> (1 replacements).` as a workspace step.
- A leading `/` (`/file write {...}`) still writes.
- Malformed JSON returns `Usage: file write <JSON>` as a workspace step and writes nothing.
- An ungranted mutation is refused with `Command not allowed for role "tell": file write ….`, `workspace: false`, and the file is not created.
- An agent snapshot with `['file']` refuses `janissary file write {...}` with `Agent: command not permitted: …` and writes nothing.
- A `db` command after a write in the same run still sends an `acp-tool-request` (request 1).
- Aborting after the write step suppresses all later frames and leaves the written file in place.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Manually: on a remote shell tab, grant `file write` to `tell`, ask it to create a file, confirm the file appears in the remote clone (not locally) and the transcript step is tagged `[<host>] Wrote <path>.`.

## Out of scope

- Built-in grants (plan 14) and end-to-end coverage (plan 15).
- Typed command routing on remote tabs, which already uses the remote port (plan 11).
- Allowing mutations on the autonomous agent path.
- Any protocol frame change.
