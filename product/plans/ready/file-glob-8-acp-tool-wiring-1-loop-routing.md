# File glob 8.1 — route `file glob` in both ACP loop workspace runners

**Complexity: 3/10** — ~8 added lines in 2 files, 5 requirements, 7 test scenarios (p=4.56)

Run order: piece 1 of 3 of file glob subplan 8, which is 8 of 9 in the file glob series. Subplan 8 is recorded whole in `product/plans/complete/file-glob-8-acp-tool-wiring.md`; the feature's canonical plan is `product/plans/complete/file-glob.md`. Depends on subplan 4 (`globWorkspaceCommand` in `src/file-glob/glob.ts`), subplan 7 (`globFilesInTab` in `src/file-glob/tab-glob.ts`), and subplan 1 (`isFileGlobCommandLine` in `src/file-glob/command.ts`), all landed on this branch. Pieces 2 (`product/plans/draft/file-glob-8-acp-tool-wiring-2-vocabulary-and-file-tool.md`) and 3 (`product/plans/draft/file-glob-8-acp-tool-wiring-3-default-grants-and-docs.md`) depend on this one.

This piece makes the two ACP loop hosts able to run a glob before anything can hand them one. Today no granted command line can reach `runWorkspace` as a glob: `nativeCommandName('file glob …')` returns `undefined` because `file glob` is not in `NATIVE_ACP_COMMANDS`, so `toolExtractor` in `src/acp/tool-table.ts` never extracts the line and `gateCoreCommand` throws `No ACP tool matched command` for it. Piece 2 adds the vocabulary entry; if it landed first, the gate would pass a glob that `runWorkspace` then hands to the read fallback (`readFileInTab` answers `Usage: file read …`). Landing the routing first means no commit ever advertises `file glob` to an ACP agent before the loop can run it.

## Design decisions

From the source plan:

- The loop runs a glob on the workspace (`runsOn: 'workspace'`, unchanged), against the workspace of the host running the loop.
- `src/acp/run-prompt.ts` `runWorkspace`: hoist the normalized line into a local `const normalized = command.trim().replace(/^\//, '')`, as `serve-acp-loop.ts` already does, and test both the mutation branch and the new glob branch against `normalized`. The glob branch goes after the mutation branch and before the read fallback: `isFileGlobCommandLine(normalized)` → `globFilesInTab(managers, label, command)`. Pass the original `command` to the runner, as the mutation and read neighbors do (the core gate never lets a `/`-led line through, because `nativeCommandName` does not strip the slash). The existing `active()` cancellation check stays first.
- `src/remote/serve-acp-loop.ts` `runWorkspace`: add `isFileGlobCommandLine(normalized)` → `globWorkspaceCommand(workspaceDir, normalized)` after the mutation branch and before the read fallback.
- The third `runWorkspace`, in `src/agent/execute.ts` (the inline host passed to `runToolLoop`, which calls `readWorkspaceCommand(run.executionDir, …)`), is left alone: `gateAgentCommand` in `src/acp/tool-table.ts` (`if (isFileMutationCommandLine(input) || isFileGlobCommandLine(input)) return { refusal: … }`, subplan 7.1) already refuses an agent's glob before it reaches any host. The same gate covers agent snapshots run through `startRemoteLoop`, so the new `serve-acp-loop.ts` branch is reachable only from core runs; do not add an agent-kind check there.
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
| `runToolLoop` / `driveToolLoop` | `src/acp/drive-loop.ts` | Receive the host as their fourth argument (index 3: `session, prompt, snapshot, host, events, signal`); the tests capture it from there. `runCorePrompt` imports only `runToolLoop` and `startRemoteLoop` imports only `driveToolLoop`, so each test file wraps just that one export. |
| `tagged` | `src/acp/run-prompt.ts` | Remote workspace-step tag. |
| The `vi.hoisted` mocks wrapping `readFileInTab` and `mutateFileInTab` at the top of `src/acp/run-prompt.test.ts` (`vi.mock('../file-read/tab-read.js', async (importOriginal) => …)` with `import type * as TabRead`) | tests | Pattern for wrapping `globFilesInTab`, `runToolLoop`, and `driveToolLoop`: `importOriginal<typeof X>()`, `mockImplementation(actual.fn)` inside the factory, spread `actual`. This shape is already lint-clean under the type-aware rules. |
| The `runCorePrompt file mutations` describe in `src/acp/run-prompt.test.ts` | tests | Shape for the new describe: `beforeEach` with `vi.clearAllMocks()` and a `mkdtempSync` directory holding `a.txt`, `afterEach` removing it. `clearAllMocks` keeps the delegating implementations. |
| `flush` in `src/remote/serve-acp-loop.test.ts` | tests | Awaiting the asynchronous glob. |

## Proposed changes

Lint-counted sizes today (blank and comment lines skipped): `run-prompt.ts` 131, `serve-acp-loop.ts` 104; each grows by about three lines, far under the 200-line limit, so no extraction is needed. Test files are exempt from `max-lines` (`eslint.config.mjs`, the `**/*.test.ts` override).

Land the two production edits and their tests in one commit; neither host change depends on the other.

- `src/acp/run-prompt.ts`: in the host's `runWorkspace`, after the `active()` check, introduce `normalized`; change the mutation test to use it; add the glob branch before `return readFileInTab(managers, label, command)`. Import `globFilesInTab` from `../file-glob/tab-glob.js` and `isFileGlobCommandLine` from `../file-glob/command.js`.
- `src/remote/serve-acp-loop.ts`: in the host's `runWorkspace`, add the glob branch between the mutation branch and `return readWorkspaceCommand(workspaceDir, normalized)`. This host has no cancellation check in `runWorkspace` today; do not add one. Import `globWorkspaceCommand` from `../file-glob/glob.js` and `isFileGlobCommandLine` from `../file-glob/command.js`.

## Tests

- `src/acp/run-prompt.test.ts`:
  - Add `globFilesInTab` and `runToolLoop` to the existing `vi.hoisted` mocks object. Add `vi.mock('../file-glob/tab-glob.js', …)` wrapping the actual `globFilesInTab`, exactly as `readFileInTab` is wrapped (with a new `import type * as TabGlob from '../file-glob/tab-glob.js'`).
  - Capture the host: add `vi.mock('./drive-loop.js', …)` the same way (`import type * as DriveLoop from './drive-loop.js'`, `importOriginal`, the hoisted `runToolLoop` spy delegating to the actual function, `...actual` spread so `CORE_MAX_STEPS` — imported by this test file — and `driveToolLoop` stay real). The actual `runToolLoop` still reaches the mocked `runAcpToolLoop` from `./loop.js`, so `harness().start` keeps working unchanged. Add a small helper `capturedHost()` that returns `mocks.runToolLoop.mock.calls.at(-1)?.[3] as AcpToolHost`, the same cast style as `start` uses for `deps` (`AcpToolHost` is already imported).
  - Put the new local tests in a new `describe('runCorePrompt file glob routing', …)` placed after `runCorePrompt file mutations`, with the same `beforeEach`/`afterEach` shape (`vi.clearAllMocks()`, a `mkdtempSync` directory holding `a.txt`, removed afterwards). Every test uses `harness({ tab: { workspaceDir: dir } })` (no `remote`, so `localReadRoot` returns `dir`) and `start('tell', ['file read', 'file write', 'file edit'])`; the grant list does not matter because the host is called directly.
  - Local glob routing: await `capturedHost().runWorkspace('file glob *.txt')`. It resolves to exactly `a.txt` (the `formatGlobResult` output for one match; git's ignored-path lookup fails soft outside a repository), `mocks.globFilesInTab` was called with `(expect.anything(), 'shell', 'file glob *.txt')`, and neither `mocks.readFileInTab` nor `mocks.mutateFileInTab` was called.
  - Branch order, read: `file read a.txt` through the captured host reaches `readFileInTab` and not `globFilesInTab`.
  - Branch order, write: `file write {"path":"b.md","content":"x"}` through the captured host reaches `mutateFileInTab` with the original line and not `globFilesInTab`.
  - Cancellation stays first: after `request.abort.abort()`, `capturedHost().runWorkspace('file glob *.txt')` throws `ACP: prompt cancelled.` synchronously and `globFilesInTab` is not called (mirror `throws and writes nothing when the prompt is cancelled before the mutation runs`).
  - Remote tag, in the same describe, mirroring `tags a remote tab's workspace step with the host on the transcript and record lines`: with `harness({ remoteSession: true, tab: { workspaceDir: dir, remote: { host: 'far' } }, launchDir: dir })` and `start('tell', […], 'tell', 'record-1')`, call `events.startCommand?.('file glob *.md', true)` and `events.ranCommand('file glob *.md', 'a.md', true)` on `remoteCall(run)[3]`; the record activity lines are `[far] file glob *.md` and `[far] a.md`, `managers.tab.append` receives `{ input: '[far] file glob *.md', output: 'a.md', acp: true }`, and `globFilesInTab` is not called. This test stays as written after piece 2.
- `src/remote/serve-acp-loop.test.ts`:
  - This file uses no mocks today: add `vi` to its `vitest` import and `import type * as DriveLoop from '../acp/drive-loop.js'`. Capture the host: add a `vi.hoisted` spy and a `vi.mock('../acp/drive-loop.js', …)` that wraps `driveToolLoop` delegating to the actual function (same shape as `run-prompt.test.ts`, `...actual` spread), and read `spy.mock.calls.at(-1)?.[3] as AcpToolHost` after `start(…)` (add `AcpToolHost` to the existing `../acp/types.js` type import).
  - Put both tests in a new `describe('startRemoteLoop workspace glob routing', …)` after `startRemoteLoop workspace mutations`. Start each with `start([['Done.']], coreSnapshot('tell', ['file read']))`; the run answers at once, and the captured host stays callable afterwards because this `runWorkspace` has no abort check.
  - Glob routing: with `a.md` (`one\ntwo\n`) and a non-matching `b.txt` written into the temporary `workspace`, await `host.runWorkspace('file glob *.md')`: it resolves to exactly `a.md`. The glob is asynchronous (it walks the tree and asks git for ignored paths, which fails soft outside a repository), so await the promise rather than asserting synchronously.
  - Branch order: the same host runs `file read a.md` to `1\tone\n2\ttwo`, the numbered result `runs a granted file read against the workspace…` pins.

## Verification

- `$janissary/scripts/run.mjs check-diff`: lint, typecheck, and the server tests above pass.
- Confirm with `git diff --stat` that only the two production files and their two test files changed, and that `src/acp/tool-table.ts` and `src/plugins/roles/shared.ts` are untouched, so no extracted or granted command line reaches the new branches yet.
- No manual end-to-end check is possible in this piece: until piece 2 adds the vocabulary entry, no ACP agent can emit a glob that reaches these branches. The first manual check of an agent-emitted glob is in piece 3, once a default role grants it.

## Out of scope

The vocabulary entry, the file tool's `isCommandLine` and primer, the gate's granted path, the Commands tab row, and their test pins (piece 2). The default `ask` and `tell` grants, and every spec and user-doc edit (pieces 2 and 3). Completion (subplan 9). `src/agent/execute.ts` and `gateAgentCommand`.
