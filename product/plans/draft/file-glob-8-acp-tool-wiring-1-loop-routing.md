# File glob 8.1 — route `file glob` in both ACP loop workspace runners

**Complexity: 3/10** — ~8 added lines in 2 files, 5 requirements, 6 test scenarios (p=4.51)

Run order: piece 1 of 3 of file glob subplan 8, which is 8 of 9 in the file glob series. Subplan 8 is recorded whole in `product/plans/complete/file-glob-8-acp-tool-wiring.md`; the feature's canonical plan is `product/plans/complete/file-glob.md`. Depends on subplan 4 (`globWorkspaceCommand` in `src/file-glob/glob.ts`), subplan 7 (`globFilesInTab` in `src/file-glob/tab-glob.ts`), and subplan 1 (`isFileGlobCommandLine` in `src/file-glob/command.ts`), all landed on this branch. Pieces 2 (`product/plans/draft/file-glob-8-acp-tool-wiring-2-vocabulary-and-file-tool.md`) and 3 (`product/plans/draft/file-glob-8-acp-tool-wiring-3-default-grants-and-docs.md`) depend on this one.

This piece makes the two ACP loop hosts able to run a glob before anything can hand them one. Today no granted command line can reach `runWorkspace` as a glob: `nativeCommandName('file glob …')` returns `undefined` because `file glob` is not in `NATIVE_ACP_COMMANDS`, so `toolExtractor` in `src/acp/tool-table.ts` never extracts the line and `gateCoreCommand` throws `No ACP tool matched command` for it. Piece 2 adds the vocabulary entry; if it landed first, the gate would pass a glob that `runWorkspace` then hands to the read fallback (`readFileInTab` answers `Usage: file read …`). Landing the routing first means no commit ever advertises `file glob` to an ACP agent before the loop can run it.

## Design decisions

From the source plan:

- The loop runs a glob on the workspace (`runsOn: 'workspace'`, unchanged), against the workspace of the host running the loop.
- `src/acp/run-prompt.ts` `runWorkspace`: hoist the normalized line into a local `const normalized = command.trim().replace(/^\//, '')`, as `serve-acp-loop.ts` already does, and test both the mutation branch and the new glob branch against `normalized`. The glob branch goes after the mutation branch and before the read fallback: `isFileGlobCommandLine(normalized)` → `globFilesInTab(managers, label, command)`. Pass the original `command` to the runner, as the mutation and read neighbors do (the core gate never lets a `/`-led line through, because `nativeCommandName` does not strip the slash). The existing `active()` cancellation check stays first.
- `src/remote/serve-acp-loop.ts` `runWorkspace`: add `isFileGlobCommandLine(normalized)` → `globWorkspaceCommand(workspaceDir, normalized)` after the mutation branch and before the read fallback.
- The third `runWorkspace`, in `src/agent/execute.ts`, is left alone: `gateAgentCommand` already refuses an agent's glob (subplan 7.1) before it reaches the host.
- In a remote ACP loop, the workspace step is tagged `[<host>] ` like every other workspace step. This needs no new code: `tagged` in `run-prompt.ts` already tags every step reported with `workspace: true` in a remote session. A remote session never calls `globFilesInTab` locally; the far side's `runWorkspace` runs it.

Subplan decisions carried by this piece:

- Because no granted line can reach these branches until piece 2, this piece's tests drive each host's `runWorkspace` directly by capturing the `AcpToolHost` the loop is started with, rather than through a gated agent reply. Piece 2 rewrites the two local-run tests into the source plan's granted-path form and drops the capture.
- Nothing in `src/acp/tool-table.ts`, `src/plugins/roles/`, or any spec or doc changes in this piece; the behavior is not user-visible yet.

## What already exists (reuse, don't rebuild)

| Piece | Where | Use |
| --- | --- | --- |
| `isFileGlobCommandLine` | `src/file-glob/command.ts` | The line predicate for both branches. |
| `globFilesInTab(managers, label, input)` | `src/file-glob/tab-glob.ts` | Local loop's glob runner: the tab's root, or the remote tab port. |
| `globWorkspaceCommand(root, input)` | `src/file-glob/glob.ts` | Far-side loop's glob runner. |
| `runCorePrompt` host | `src/acp/run-prompt.ts`, the `runWorkspace:` entry of `const host: AcpToolHost` | Local loop's workspace runner. |
| `startRemoteLoop` host | `src/remote/serve-acp-loop.ts`, the `runWorkspace:` entry of `const host: AcpToolHost` | Far-side loop's workspace runner. |
| `runToolLoop` / `driveToolLoop` | `src/acp/drive-loop.ts` | Receive the host as their fourth argument; the tests capture it from there. |
| `tagged` | `src/acp/run-prompt.ts` | Remote workspace-step tag. |
| The `vi.hoisted` mocks wrapping `readFileInTab` and `mutateFileInTab` at the top of `src/acp/run-prompt.test.ts` | tests | Pattern for wrapping `globFilesInTab`. |
| `flush` in `src/remote/serve-acp-loop.test.ts` | tests | Awaiting the asynchronous glob. |

## Proposed changes

Lint-counted sizes today: `run-prompt.ts` 131, `serve-acp-loop.ts` 104; each grows by about three lines, far under the 200-line limit, so no extraction is needed.

- `src/acp/run-prompt.ts`: in the host's `runWorkspace`, after the `active()` check, introduce `normalized`; change the mutation test to use it; add the glob branch before `return readFileInTab(managers, label, command)`. Import `globFilesInTab` from `../file-glob/tab-glob.js` and `isFileGlobCommandLine` from `../file-glob/command.js`.
- `src/remote/serve-acp-loop.ts`: in the host's `runWorkspace`, add the glob branch between the mutation branch and `return readWorkspaceCommand(workspaceDir, normalized)`. Import `globWorkspaceCommand` from `../file-glob/glob.js` and `isFileGlobCommandLine` from `../file-glob/command.js`.

## Tests

- `src/acp/run-prompt.test.ts`:
  - Add `globFilesInTab` to the `vi.hoisted` mocks and add `vi.mock('../file-glob/tab-glob.js', …)` wrapping the actual function, exactly as `readFileInTab` is wrapped.
  - Capture the host: wrap `runToolLoop` from `./drive-loop.js` the same way (`importOriginal`, a hoisted spy that delegates to the actual function), keeping every other export such as `CORE_MAX_STEPS` intact. Add a small test helper that returns the fourth argument of the spy's last call.
  - Local glob routing, beside `runs a granted file write through the tab runner…`: with `harness({ tab: { workspaceDir: dir } })` on the existing temporary directory (which holds `a.txt`), start a `tell` prompt, take the captured host, and await `host.runWorkspace('file glob *.txt')`. It resolves to the matching path `a.txt`, `globFilesInTab` was called with `(expect.anything(), 'shell', 'file glob *.txt')`, and neither `readFileInTab` nor `mutateFileInTab` was called.
  - Branch order: through the same captured host, `file read a.txt` still reaches `readFileInTab` and not `globFilesInTab`, and a `file write …` line still reaches `mutateFileInTab` and not `globFilesInTab`.
  - Remote tag, mirroring `tags a remote tab's workspace step…`: in a remote session, a `file glob *.md` step reported with `workspace: true` through the remote session's `run` handlers is tagged `[far] ` on the transcript and record lines, and `globFilesInTab` is not called locally. This test stays as written after piece 2.
- `src/remote/serve-acp-loop.test.ts`:
  - Capture the host: add a `vi.mock('../acp/drive-loop.js', …)` that wraps `driveToolLoop` in a hoisted spy delegating to the actual function, and read its fourth argument after `start(…)`.
  - With a file `a.md` written into the temporary `workspace` (and a non-matching `b.txt`), start a core run, then await `host.runWorkspace('file glob *.md')`: it resolves to `a.md`. The glob is asynchronous (it walks the tree and asks git for ignored paths, which fails soft outside a repository), so await the promise rather than asserting synchronously.
  - Branch order: the same host still runs `file read a.md` to the numbered `1\tone…` result.

## Verification

- `$janissary/scripts/run.mjs check-diff`: lint, typecheck, and the server tests above pass.
- Confirm by reading `src/acp/tool-table.ts` that it is untouched, so no extracted or granted command line reaches the new branches yet.

## Out of scope

The vocabulary entry, the file tool's `isCommandLine` and primer, the gate's granted path, the Commands tab row, and their test pins (piece 2). The default `ask` and `tell` grants, and every spec and user-doc edit (pieces 2 and 3). Completion (subplan 9). `src/agent/execute.ts` and `gateAgentCommand`.
