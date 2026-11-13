# Hosted write tool 15 — end-to-end verification across hosts

**Complexity: 2/10** — no production lines, 8 requirements, 12 integration scenarios (p=4.07).

Source plan: `./product/plans/complete/janissary-hosted-agent-write-tool.md`. Run order: 15 of 15 in the hosted write tool series. Depends on plans 1 through 14 (`janissary-hosted-agent-write-tool-1-shared-file-policy.md` through `janissary-hosted-agent-write-tool-14-tell-default-grants.md`).

Each earlier subplan proves its own seam. This one proves the whole path where the seams meet: an ACP `tell` prompt and a typed command, on a local tab and on a remote tab, with the harness's own write tool denied. It adds tests and runs the source plan's manual check. It changes no production code; if a test exposes a defect, the fix belongs in the subplan that owns that seam, reopened, not here.

## Goal

Executable evidence that the feature meets the source plan end to end: writes and edits land in the right workspace, a remote mutation never touches the local disk, a disconnected remote never falls back, grants and settings refuse without an approval prompt, uncertain remote outcomes are not retried, and recordings keep working.

## Design decisions and dependencies

- Integration tests reuse the existing server test fixtures for an ACP prompt on a local tab (`src/acp/run-prompt.test.ts` style) and the in-process remote server pairing used by `src/remote/serve-acp-loop.test.ts` and `src/remote/serve-file-navigator.test.ts`. No browser harness is added; UI entries are data-driven and covered in plan 12.
- The no-local-disk assertions target the remote mutation target, temporary file copies, and `.janissary/remote-files/` cache materialization, not ordinary history, transcript, or ACP record persistence, which the user permitted to contain payloads.
- Colocate the new tests as `src/file-write/end-to-end.test.ts` so they run with `npm run test:diff:server`.

## What already exists (reuse, don't rebuild)

| Existing code | Use |
| --- | --- |
| `src/remote/serve-acp-loop.test.ts`, `src/remote/serve-file-navigator.test.ts` | Far-side loop and filesystem fixtures |
| `src/acp/run-prompt.test.ts` | Local core prompt fixture |
| `src/file-navigator/remote/port.test.ts` | Fake channel for disconnect and timeout |

## Proposed changes

Add `src/file-write/end-to-end.test.ts` covering the scenarios below. Change no production code and no spec; spec and help updates already landed in plans 3, 8, 9, 10, 11, 12, 13, and 14.

## Tests

- Local `tell` prompt under the default role: the agent's final line `file write {…}` creates a nested file in the workspace clone, a following `file edit {…}` changes it, and both one-line results reach the transcript; no question is opened.
- Local tab without a workspace clone: a typed write lands under the launch directory.
- Remote-hosted `tell` loop: the same write and edit change only the far-side workspace; a same-named local sentinel file is unchanged; no local remote-file cache entry or temporary file exists afterward; no `acp-tool-request` frame carried the mutation.
- Remote typed command: write and edit change the far-side file; with the channel disconnected the command prints `Remote connection unavailable.` and the local sentinel stays unchanged.
- An outside-workspace path and a `.env` path are refused on both hosts with no folder created.
- A role without the grant and a disabled `file write` row each refuse with their existing messages and no approval question.
- A remote edit whose reply times out reports the timeout reason once and is not resent.
- The default `ask` role cannot write; an autonomous agent run granted `file` is refused for `file write`.
- An ACP record and the tab transcript still record the mutation command after a successful write.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then the source plan's manual check: with a harness whose internal write tool is denied, create and edit a file in a local workspace, then repeat in a remote workspace with a same-named local sentinel file. Confirm the remote result and the unchanged local sentinel, reject an outside-workspace path, and verify a disconnected remote never falls back to local writing. Verify that allowed mutations run without an approval prompt and that role grants and command settings still refuse unauthorized mutations.

Leave `npm run check` for the human, once, after the series.

## Out of scope

- Production fixes; a failing scenario reopens the owning subplan.
- New features beyond the source plan.
