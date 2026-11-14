# Pin each hop of the agent glob cancellation chain with a test

**Complexity: 1/10** — 0 production lines and 0 production files (tests only), 4 requirements, 6 scenarios (p=3.43)

The cancel-walk repair threads an optional `AbortSignal` from the far-side loop (`startRemoteLoop` → `globWorkspaceCommand`) and the typed-tab entry (`globFilesInTab` → `globWorkspace`) down into `loadIgnoredPaths` and `walkGlob`. Only the ends are tested: `run-prompt.test.ts` asserts the signal reaches a mocked `globFilesInTab`, and `walk.test.ts` and `ignored.test.ts` honour a signal handed to them directly. A refactor that drops the trailing `signal` at any middle hop would pass every test.

## Goal

Each hop has a test that fails when that hop stops passing the signal on, so a cancelled agent glob cannot silently go back to walking and holding its git child until the limit or the 30-second deadline.

## Approach

Add tests only; production code is untouched. Each test is built so the signal-dropping variant produces a different result:

- `globWorkspace` → `loadIgnoredPaths`: with the existing hanging-`git` stub (sleeps 5 s) and a far deadline, aborting after about 100 ms must resolve `(no matches)` plus the timeout line well under the stub's 5 s. Without the hop, git runs its full 5 s and exits with an empty ignored set, so the walk lists files.
- `globWorkspace` → `walkGlob`: under `--hidden` (no git lookup) an already-aborted signal must yield `(no matches)` with no timeout line, while the files exist and would otherwise be listed.
- `globWorkspaceCommand` → `globWorkspace`: an already-aborted signal with `file glob ** --hidden` over existing files yields `(no matches)`.
- `globFilesInTab` → `globWorkspace`: on a local workspace tab, `file glob **/*.md --hidden` with an already-aborted signal yields `(no matches)`, while the same call without a signal lists `docs/guide.md` and `workspace.md`.
- `startRemoteLoop` → `globWorkspaceCommand`: a hoisted `vi.mock` of `../file-glob/glob.js` that wraps the actual export (as `src/acp/run-prompt.test.ts` does for `tab-glob.js`) records the call; assert it received the workspace, the normalized line, and an `AbortSignal` that becomes `aborted` after `handle.abort()`.

## Implementation steps

1. `src/file-glob/glob.test.ts`: add a `cancellation` describe inside `git-ignored paths` → `with a git lookup that outlasts the deadline` for the git-lookup case, and a top-level `cancellation` describe for the walk and `globWorkspaceCommand` cases.
2. `src/file-glob/tab-glob.test.ts`: add the aborted-signal case.
3. `src/remote/serve-acp-loop.test.ts`: add the hoisted wrapping mock and the routing assertion in `startRemoteLoop workspace glob routing`.
4. For each new test, temporarily drop the signal at its hop in the production file, confirm the test fails, and restore the file.

## Tests

- Git lookup aborted mid-flight resolves `(no matches)` and the timeout line in under 3 s.
- Walk with an aborted signal under `--hidden` resolves `(no matches)` with no timeout line.
- `globWorkspaceCommand` with an aborted signal resolves `(no matches)`.
- `globFilesInTab` with an aborted signal resolves `(no matches)`; without one it lists both files.
- `startRemoteLoop` passes `controller.signal` to `globWorkspaceCommand`, and `handle.abort()` aborts it.
- Existing glob, tab-glob, and serve-acp-loop tests keep passing untouched.

## Spec

None: behaviour is unchanged and `product/specs/acp.md` already states that cancelling the prompt stops a running agent glob.

## Out of scope

- Any production change.
- Cancelling a glob forwarded to a remote tab's filesystem port.
