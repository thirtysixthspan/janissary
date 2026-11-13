# Hosted write tool 13 — run ACP file mutations on the remote workspace machine

**Complexity: 2/10** — ~10 added lines in 1 file, 4 requirements, 6 scenarios (p=4.25).

Source plan: `./product/plans/complete/janissary-hosted-agent-write-tool.md`. Run order: 13 of 15 in the hosted write tool series. Depends on plan 11 (`janissary-hosted-agent-write-tool-11-typed-file-mutations.md`) for the shared executor and plan 12 (`janissary-hosted-agent-write-tool-12-acp-file-mutation-tools.md`) for the vocabulary and tool recognition.

Since protocol version 40, a remote ACP session's tool loop runs on the far side, next to the agent and the workspace. Workspace tools run there directly and only browser, database, and question tools travel back to the caller. This plan makes that loop's workspace runner execute writes and edits on its own machine, through its own local port, instead of answering them with the read usage line.

## Goal

In `src/remote/serve-acp-loop.ts`, a granted `file write` or `file edit` runs through plan 11's shared executor with a `LocalFileSystemPort` and the loop's `workspaceDir`, is reported as a workspace step, and is never forwarded to the caller.

## Design decisions and dependencies

- Source plan decision: preserve the existing remote ACP workspace-tool route. The remote-hosted loop executes writes and edits directly through `LocalFileSystemPort` on its own workspace machine. Do not forward remote ACP workspace mutations through the caller and then back to the remote.
- `host.runWorkspace` sends mutation lines (after the existing trim and leading `/` removal) to the shared executor and keeps `readWorkspaceCommand` for reads. One `LocalFileSystemPort` per loop is enough; it holds no resources, and its `dispose` is a no-op, but call it from the loop's existing teardown anyway so the acquire and release stay together.
- The executor's result is a string or a promise of one; the loop driver already accepts both.
- Browser, database, and question tools keep their caller-side route through `acp-tool-request`. Cancellation and abort keep their current behavior: a committed mutation stays committed, late results are suppressed, and nothing retries.
- No protocol change: the loop already receives the per-prompt snapshot with grants and rows from the caller, and plan 12's tool table is the same on both hosts.

## What already exists (reuse, don't rebuild)

| Existing code | Use |
| --- | --- |
| `src/remote/serve-acp-loop.ts` `startRemoteLoop` | Far-side loop host |
| `src/acp/drive-loop.ts` `driveToolLoop` | Shared driver and gate |
| `src/file-write/tab-write.ts` (plan 11) | Shared executor |
| `src/file-navigator/filesystem-port.ts` `LocalFileSystemPort` | Far-side port |

## Proposed changes

Route mutation lines in the far-side `runWorkspace` to the shared executor with a loop-owned `LocalFileSystemPort` and `workspaceDir`, disposing the port in the loop's teardown.

Update the ACP-loop section of `product/specs/remote-server.md` and the remote paragraph of `product/specs/acp.md`: workspace writes and edits on a remote tab run on the remote machine through its local port, are tagged as workspace steps, and never cross to the caller.

## Tests

- `src/remote/serve-acp-loop.test.ts`: a granted write and edit change files under the far-side `workspaceDir`; no `acp-tool-request` frame is sent for them; each produces an `acp-tool-step` with `workspace: true`; an ungranted mutation is refused with the role refusal; a database command in the same run still forwards to the caller; an abort during a run suppresses later frames.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

## Out of scope

- Built-in grants (plan 14).
- Typed command routing on remote tabs, which already uses the remote port (plan 11).
- Any protocol frame change.
